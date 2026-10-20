import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Db } from '../../database/db.type';
import { PrismaService } from '../../database/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { Money } from '../../common/money/money';

interface WalletAccountRow {
  id: bigint;
  wallet_id: bigint;
  asset_id: bigint;
  available_minor: bigint;
  held_minor: bigint;
}

/**
 * WalletService — the user-facing balance API. It is the ONLY module allowed to
 * write `wallets`/`wallet_accounts`, and every method that moves real value
 * (credit/debit/settle) delegates the actual double-entry posting to
 * LedgerService in the SAME database transaction, so the wallet projection and
 * the ledger can never drift apart.
 *
 * hold()/release() move money between `available_minor` and `held_minor` WITHIN
 * one user's own wallet account — no value leaves the user, so no ledger entry
 * is posted for those two. Only credit/debit/settle touch the ledger, because
 * those are the only operations where value actually moves between owners.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  /** Listens for the event AuthService emits on successful registration (see auth.service.ts). */
  @OnEvent('user.registered')
  async handleUserRegistered(payload: { userId: bigint }) {
    await this.createWalletForUser(payload.userId);
  }

  async createWalletForUser(userId: bigint) {
    await this.prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  private async getAsset(db: Db, assetCode: string) {
    const asset = await db.asset.findUnique({ where: { code: assetCode } });
    if (!asset || !asset.isActive) {
      throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'العملة/الخدمة غير متاحة' });
    }
    return asset;
  }

  /** Ensures a wallet_account row exists for this user+asset. Lazy — not created for every asset up front. */
  async getOrCreateWalletAccount(db: Db, userId: bigint, assetCode: string) {
    const asset = await this.getAsset(db, assetCode);
    const wallet = await db.wallet.upsert({ where: { userId }, update: {}, create: { userId } });

    const existing = await db.walletAccount.findUnique({
      where: { walletId_assetId: { walletId: wallet.id, assetId: asset.id } },
    });
    const account = existing ?? (await db.walletAccount.create({ data: { walletId: wallet.id, assetId: asset.id } }));
    return { account, asset };
  }

  async getBalances(userId: bigint) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: { accounts: { include: { asset: true } } },
    });
    if (!wallet) return [];
    return wallet.accounts.map((wa) => ({
      assetCode: wa.asset.code,
      assetName: wa.asset.name,
      available: Money.fromMinorUnits(wa.availableMinor, wa.asset.decimals).toDecimalString(),
      held: Money.fromMinorUnits(wa.heldMinor, wa.asset.decimals).toDecimalString(),
    }));
  }

  private async lockWalletAccount(db: Db, walletAccountId: bigint): Promise<WalletAccountRow> {
    const [locked] = await db.$queryRaw<WalletAccountRow[]>`
      SELECT id, wallet_id, asset_id, available_minor, held_minor
      FROM wallet_accounts WHERE id = ${walletAccountId} FOR UPDATE
    `;
    if (!locked) throw new NotFoundException({ code: 'WALLET_ACCOUNT_NOT_FOUND', message: 'حساب المحفظة غير موجود' });
    return locked;
  }

  /**
   * Every user-side posting gets a mirror entry on the per-asset SYSTEM account, so each transaction's entries
   * sum to zero (real double-entry). SYSTEM balance = what the platform holds against the outside world
   * (negative = users hold more than we've taken in via that channel). Reconciliation reads this.
   */
  private async postCounter(db: Db, assetId: bigint, transactionId: bigint, userDirection: 'CREDIT' | 'DEBIT', amountMinor: bigint) {
    const system = await this.ledger.getOrCreateLedgerAccount(db, 'SYSTEM', null, assetId);
    return this.ledger.postEntry(db, {
      ledgerAccountId: system.id,
      transactionId,
      direction: userDirection === 'CREDIT' ? 'DEBIT' : 'CREDIT',
      amountMinor,
      allowNegative: true,
    });
  }

  /** Adds funds to `available`. Used for deposits and as the credit side of internal transfers. */
  async credit(db: Db, userId: bigint, assetCode: string, amount: Money, transactionId: bigint) {
    const { account, asset } = await this.getOrCreateWalletAccount(db, userId, assetCode);
    await this.lockWalletAccount(db, account.id);

    await db.walletAccount.update({
      where: { id: account.id },
      data: { availableMinor: { increment: amount.toMinorUnits() } },
    });

    const ledgerAccount = await this.ledger.getOrCreateLedgerAccount(db, 'USER', userId, asset.id);
    const entry = await this.ledger.postEntry(db, {
      ledgerAccountId: ledgerAccount.id,
      transactionId,
      direction: 'CREDIT',
      amountMinor: amount.toMinorUnits(),
    });
    await this.postCounter(db, asset.id, transactionId, 'CREDIT', amount.toMinorUnits());
    return entry;
  }

  /** Removes funds directly from `available` (no hold step) — e.g. a fee charged at the same instant as a credit. */
  async debit(db: Db, userId: bigint, assetCode: string, amount: Money, transactionId: bigint) {
    const { account, asset } = await this.getOrCreateWalletAccount(db, userId, assetCode);
    const locked = await this.lockWalletAccount(db, account.id);

    if (BigInt(locked.available_minor) < amount.toMinorUnits()) {
      throw new ConflictException({ code: 'INSUFFICIENT_BALANCE', message: 'الرصيد غير كافٍ لإتمام العملية' });
    }

    await db.walletAccount.update({
      where: { id: account.id },
      data: { availableMinor: { decrement: amount.toMinorUnits() } },
    });

    const ledgerAccount = await this.ledger.getOrCreateLedgerAccount(db, 'USER', userId, asset.id);
    const entry = await this.ledger.postEntry(db, {
      ledgerAccountId: ledgerAccount.id,
      transactionId,
      direction: 'DEBIT',
      amountMinor: amount.toMinorUnits(),
    });
    await this.postCounter(db, asset.id, transactionId, 'DEBIT', amount.toMinorUnits());
    return entry;
  }

  /**
   * Moves funds from `available` to `held` — e.g. when a withdrawal/order is created
   * and PENDING, before we know if the provider will accept it. No ledger entry:
   * the money hasn't left the user, it's just no longer spendable elsewhere.
   */
  async hold(db: Db, userId: bigint, assetCode: string, amount: Money) {
    const { account } = await this.getOrCreateWalletAccount(db, userId, assetCode);
    const locked = await this.lockWalletAccount(db, account.id);

    if (BigInt(locked.available_minor) < amount.toMinorUnits()) {
      throw new ConflictException({ code: 'INSUFFICIENT_BALANCE', message: 'الرصيد غير كافٍ لإتمام العملية' });
    }

    return db.walletAccount.update({
      where: { id: account.id },
      data: {
        availableMinor: { decrement: amount.toMinorUnits() },
        heldMinor: { increment: amount.toMinorUnits() },
      },
    });
  }

  /** Undoes a hold (e.g. the held operation failed/was cancelled) — funds become available again. */
  async release(db: Db, userId: bigint, assetCode: string, amount: Money) {
    const { account } = await this.getOrCreateWalletAccount(db, userId, assetCode);
    const locked = await this.lockWalletAccount(db, account.id);

    if (BigInt(locked.held_minor) < amount.toMinorUnits()) {
      throw new ConflictException({ code: 'INVALID_HOLD_RELEASE', message: 'لا يوجد مبلغ محجوز بهذا القدر' });
    }

    return db.walletAccount.update({
      where: { id: account.id },
      data: {
        heldMinor: { decrement: amount.toMinorUnits() },
        availableMinor: { increment: amount.toMinorUnits() },
      },
    });
  }

  /**
   * Finalizes a hold as an actual outgoing settlement (e.g. the provider confirmed
   * the withdrawal succeeded) — funds leave `held` PERMANENTLY, and THIS is where a
   * ledger DEBIT is posted, because value has now genuinely left the user.
   */
  async settle(db: Db, userId: bigint, assetCode: string, amount: Money, transactionId: bigint) {
    const { account, asset } = await this.getOrCreateWalletAccount(db, userId, assetCode);
    const locked = await this.lockWalletAccount(db, account.id);

    if (BigInt(locked.held_minor) < amount.toMinorUnits()) {
      throw new ConflictException({ code: 'INVALID_SETTLEMENT', message: 'لا يوجد مبلغ محجوز كافٍ للتسوية' });
    }

    await db.walletAccount.update({
      where: { id: account.id },
      data: { heldMinor: { decrement: amount.toMinorUnits() } },
    });

    const ledgerAccount = await this.ledger.getOrCreateLedgerAccount(db, 'USER', userId, asset.id);
    const entry = await this.ledger.postEntry(db, {
      ledgerAccountId: ledgerAccount.id,
      transactionId,
      direction: 'DEBIT',
      amountMinor: amount.toMinorUnits(),
    });
    await this.postCounter(db, asset.id, transactionId, 'DEBIT', amount.toMinorUnits());
    return entry;
  }
}
