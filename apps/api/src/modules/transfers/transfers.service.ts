import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { KycService } from '../kyc/kyc.service';
import { PrismaService } from '../../database/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { TransactionsService } from '../transactions/transactions.service';
import { UsernamePolicy } from '../users/username-policy';
import { Money } from '../../common/money/money';

export interface CreateTransferParams {
  senderPublicId: string;
  toUsername: string;
  assetCode: string;
  /** Decimal string, e.g. "100.50" — never a JS number. */
  amount: string;
  note?: string;
  /** Client-supplied idempotency key (e.g. from the "Idempotency-Key" header). Required. */
  idempotencyKey: string;
}

interface TransferDetails {
  fromUserId: string;
  fromUsername: string;
  toUserId: string;
  toUsername: string;
  assetCode: string;
  amount: string;
  note: string | null;
}

/**
 * TransfersService — Phase 4: internal @username → @username transfers, same asset,
 * both parties on-platform. This is EXACTLY the module db.type.ts's docstring
 * anticipated ("the future TransfersService in Phase 4"): it composes
 * WalletService.debit()/credit() (which each post their own LedgerService entry)
 * and TransactionsService's state machine into ONE atomic prisma.$transaction,
 * without any of those three modules needing to know about each other.
 *
 * No blockchain/provider call happens here — per the Master Prompt (§7), an
 * internal transfer between two platform users is a pure ledger movement:
 *   sender  -amount
 *   recipient +amount
 * inside one atomic DB transaction. No fee is applied here: the Master Prompt's
 * fee example (§8) is for provider CONVERSIONS (USDT → Sham Cash), not for
 * same-asset internal transfers, and there is no `fees` table yet to configure
 * one from Admin. If/when Admin needs a configurable internal-transfer fee,
 * FeeCalculator (common/money/fee-calculator.ts) is already built for that and
 * can be wired in here without touching WalletService/LedgerService.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly transactions: TransactionsService,
    private readonly kyc: KycService,
  ) {}

  private assertActive(user: { status: string }, code: string, message: string) {
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException({ code, message });
    }
  }

  async createTransfer(params: CreateTransferParams) {
    const assetCode = params.assetCode.trim().toUpperCase();
    const toUsernameLower = UsernamePolicy.normalizeForLookup(params.toUsername);

    // ── Fail fast, OUTSIDE any DB transaction, on checks that don't need a lock ──
    const sender = await this.prisma.user.findUnique({ where: { publicId: params.senderPublicId } });
    if (!sender) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });

    await this.kyc.assertVerified(sender.id, 'transfers');

    const recipient = await this.prisma.user.findUnique({ where: { usernameLower: toUsernameLower } });
    if (!recipient) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم المستلم غير موجود' });

    if (recipient.id === sender.id) {
      throw new BadRequestException({ code: 'INVALID_RECIPIENT', message: 'لا يمكنك إرسال الأموال إلى نفسك' });
    }

    const asset = await this.prisma.asset.findUnique({ where: { code: assetCode } });
    if (!asset || !asset.isActive) {
      throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'العملة/الخدمة غير متاحة' });
    }

    let amount: Money;
    try {
      amount = Money.fromDecimalString(params.amount, asset.decimals);
    } catch {
      throw new BadRequestException({ code: 'AMOUNT_INVALID', message: 'صيغة المبلغ غير صالحة' });
    }
    if (amount.isNegative() || amount.isZero()) {
      throw new BadRequestException({ code: 'AMOUNT_INVALID', message: 'يجب أن يكون المبلغ أكبر من صفر' });
    }

    // Scoped to the sender so two different users can never collide on the same
    // client-generated idempotency key.
    const scopedIdempotencyKey = `transfer:${sender.id}:${params.idempotencyKey}`;

    return this.prisma.$transaction(async (tx) => {
      const { transaction, wasAlreadyProcessed } = await this.transactions.createIdempotent(tx, {
        type: TransactionType.TRANSFER,
        idempotencyKey: scopedIdempotencyKey,
        referenceId: recipient.publicId,
        initiatedBy: sender.id,
      });

      if (wasAlreadyProcessed) {
        // The transaction row only ever persists if the WHOLE atomic block below
        // committed (it's all one prisma.$transaction) — so "already processed"
        // always means "already completed successfully". Replay the same receipt
        // instead of moving money again — this is the double-debit protection
        // the Master Prompt (§2, §14 DUPLICATE_REQUEST) asks for.
        const details = await tx.transactionEvent.findFirst({
          where: { transactionId: transaction.id, eventType: 'TRANSFER_DETAILS' },
          orderBy: { createdAt: 'asc' },
        });
        return this.toReceipt(transaction, details?.payloadJson as unknown as TransferDetails, true);
      }

      // Re-check status INSIDE the atomic transaction, where it actually matters —
      // the sender/recipient fetched above were only for the fast-fail checks;
      // status could have changed since (e.g. an admin freezing the account
      // concurrently with this request).
      const freshSender = await tx.user.findUniqueOrThrow({ where: { id: sender.id } });
      const freshRecipient = await tx.user.findUniqueOrThrow({ where: { id: recipient.id } });
      this.assertActive(freshSender, 'ACCOUNT_NOT_ACTIVE', 'حسابك غير نشط حاليًا ولا يمكنه إجراء عمليات');
      this.assertActive(freshRecipient, 'RECIPIENT_NOT_ACTIVE', 'حساب المستلم غير نشط حاليًا');

      const details: TransferDetails = {
        fromUserId: sender.id.toString(),
        fromUsername: sender.username,
        toUserId: recipient.id.toString(),
        toUsername: recipient.username,
        assetCode: asset.code,
        amount: amount.toDecimalString(),
        note: params.note ?? null,
      };
      await this.transactions.recordEvent(tx, transaction.id, 'TRANSFER_DETAILS', details as unknown as Record<string, unknown>);
      await this.transactions.transitionTo(tx, transaction.id, 'PROCESSING');

      // Lock both wallet_accounts in a STABLE, deterministic order (ascending id)
      // BEFORE debit()/credit() take their own (idempotent, re-entrant) row locks.
      // Without this, two simultaneous opposite transfers (A→B and B→A) could each
      // hold one lock while waiting on the other's — a classic deadlock. See the
      // "lock/post in a stable order" guidance in ledger.service.ts's postPair docstring.
      const { account: senderAccount } = await this.wallet.getOrCreateWalletAccount(tx, sender.id, assetCode);
      const { account: recipientAccount } = await this.wallet.getOrCreateWalletAccount(tx, recipient.id, assetCode);
      const [firstId, secondId] = [senderAccount.id, recipientAccount.id].sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0,
      );
      await tx.$queryRaw`SELECT id FROM wallet_accounts WHERE id = ${firstId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM wallet_accounts WHERE id = ${secondId} FOR UPDATE`;

      // debit() itself throws INSUFFICIENT_BALANCE (ConflictException) if the sender
      // can't cover it — that throw rolls back this ENTIRE $transaction, including
      // the transaction row and TRANSFER_DETAILS event just written above, so a
      // failed attempt leaves no half-done state and the same idempotency key can
      // be retried cleanly.
      await this.wallet.debit(tx, sender.id, assetCode, amount, transaction.id);
      await this.wallet.credit(tx, recipient.id, assetCode, amount, transaction.id);

      const completed = await this.transactions.transitionTo(tx, transaction.id, 'COMPLETED');
      return this.toReceipt(completed, details, false);
    });
  }

  /**
   * Recent transfers where the caller was either party (sender or recipient) —
   * powers the dashboard's "آخر العمليات" (§19 of the Master Prompt). Built off
   * ledger_entries (real relational columns: owner_type/owner_id) rather than
   * querying transaction_events' JSON payload directly, which keeps this a plain
   * indexed query instead of a JSON-path scan.
   */
  async listMyTransfers(callerPublicId: string, limit = 20) {
    const caller = await this.prisma.user.findUnique({ where: { publicId: callerPublicId } });
    if (!caller) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });

    const take = Math.min(Math.max(Math.trunc(limit) || 20, 1), 100);

    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        ledgerAccount: { ownerType: 'USER', ownerId: caller.id },
        transaction: { type: TransactionType.TRANSFER },
      },
      include: { transaction: true, ledgerAccount: { include: { asset: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
    if (entries.length === 0) return [];

    // One extra query to hydrate the counterparty username/note — batched by
    // transactionId, not one query per row.
    const transactionIds = entries.map((e) => e.transactionId);
    const detailEvents = await this.prisma.transactionEvent.findMany({
      where: { transactionId: { in: transactionIds }, eventType: 'TRANSFER_DETAILS' },
    });
    const detailsByTxId = new Map(
      detailEvents.map((e) => [e.transactionId.toString(), e.payloadJson as unknown as TransferDetails]),
    );

    return entries.map((entry) => {
      const details = detailsByTxId.get(entry.transactionId.toString());
      const direction: 'SENT' | 'RECEIVED' = entry.direction === 'DEBIT' ? 'SENT' : 'RECEIVED';
      return {
        transactionId: entry.transaction.publicId,
        status: entry.transaction.status,
        direction,
        counterpartyUsername: direction === 'SENT' ? details?.toUsername ?? null : details?.fromUsername ?? null,
        assetCode: entry.ledgerAccount.asset.code,
        amount: Money.fromMinorUnits(entry.amountMinor, entry.ledgerAccount.asset.decimals).toDecimalString(),
        note: details?.note ?? null,
        createdAt: entry.createdAt,
      };
    });
  }

  /** Ownership-checked: returns the same 404 whether the transfer doesn't exist or belongs to someone else. */
  async getTransferReceipt(callerPublicId: string, transactionPublicId: string) {
    const caller = await this.prisma.user.findUnique({ where: { publicId: callerPublicId } });
    if (!caller) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });

    const transaction = await this.prisma.transaction.findUnique({ where: { publicId: transactionPublicId } });
    if (!transaction || transaction.type !== TransactionType.TRANSFER) {
      throw new NotFoundException({ code: 'TRANSACTION_NOT_FOUND', message: 'العملية غير موجودة' });
    }

    const event = await this.prisma.transactionEvent.findFirst({
      where: { transactionId: transaction.id, eventType: 'TRANSFER_DETAILS' },
      orderBy: { createdAt: 'asc' },
    });
    const details = event?.payloadJson as unknown as TransferDetails | undefined;

    const callerIdStr = caller.id.toString();
    const isParty = !!details && (details.fromUserId === callerIdStr || details.toUserId === callerIdStr);
    if (!isParty) {
      throw new NotFoundException({ code: 'TRANSACTION_NOT_FOUND', message: 'العملية غير موجودة' });
    }

    return this.toReceipt(transaction, details, false);
  }

  private toReceipt(
    transaction: { publicId: string; status: string; createdAt: Date },
    details: TransferDetails | undefined,
    replay: boolean,
  ) {
    return {
      transactionId: transaction.publicId,
      status: transaction.status,
      fromUsername: details?.fromUsername ?? null,
      toUsername: details?.toUsername ?? null,
      assetCode: details?.assetCode ?? null,
      amount: details?.amount ?? null,
      note: details?.note ?? null,
      createdAt: transaction.createdAt,
      replay,
    };
  }
}
