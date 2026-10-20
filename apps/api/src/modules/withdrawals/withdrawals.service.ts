import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { TransactionsService } from '../transactions/transactions.service';
import { ProviderLogService } from '../providers/provider-log.service';
import { ProviderRegistry } from '../providers/provider-registry.service';
import { isOrderCapable, isAmbiguousOutcomeError, ProviderOrderResult } from '../providers/provider-adapter.interface';
import { Money } from '../../common/money/money';
import { normalizePhone, toLocalSyrian } from '../../common/phone/phone';
import { KycService } from '../kyc/kyc.service';
import { SettingsService } from '../site/settings.service';

export interface CreateWithdrawalParams {
  userPublicId: string;
  providerCode: 'shamcash' | 'syriatel';
  assetCode: string;
  /** Decimal string. */
  amount: string;
  /** Sham Cash account address, or the Syriatel Cash number. Chosen by the user at send time. */
  destination: string;
  /** Syriatel only. */
  action?: 'transfer_cash' | 'mobile_recharge';
  idempotencyKey: string;
}

/**
 * Which of OUR ledger assets may be paid out through which provider, and the currency code the
 * provider expects. Anything not listed here cannot be withdrawn (e.g. USDT needs a conversion step
 * first — there is no conversion module yet). Without this map the raw asset amount used to be sent
 * as if it were SYP.
 */
const PAYOUT_ASSETS: Record<'shamcash' | 'syriatel', Record<string, 'SYP' | 'USD'>> = {
  shamcash: { VYR_SCS: 'SYP', VYR_SCD: 'USD' },
  syriatel: { VYR_SCS: 'SYP', SYRIATEL_CASH: 'SYP' },
};

interface WithdrawalDetails {
  providerCode: string;
  assetCode: string;
  amount: string;
  destination: Record<string, unknown>;
}

/**
 * WithdrawalsService — Phase 7: the first real consumer of ShamCashAdapter/
 * SyriatelAdapter's createOrder(). Composes WalletService (hold/release/
 * settle — these already existed, unused, since Phase 3) with
 * ProviderRegistry + ProviderLogService, exactly like TransfersService
 * composes Wallet+Ledger+Transactions and DepositMonitoringService composes
 * Wallet+Transactions+Tatum. None of those modules know about each other.
 *
 * ── THE CORE SAFETY PROPERTY ──────────────────────────────────────────────
 * Funds are HELD (available → held) BEFORE the external provider is ever
 * called, and only ever leave the system permanently (settle → ledger DEBIT)
 * AFTER the provider confirms success. Three outcomes after calling the
 * provider:
 *   COMPLETED → settle() the hold, transaction → COMPLETED.
 *   confirmed rejection (TsaApiError) → release() the hold, transaction → FAILED.
 *   AMBIGUOUS outcome (isAmbiguousOutcomeError) → funds stay HELD, transaction
 *     stays PROCESSING. We do NOT guess. A human must reconcile via the
 *     provider's own find_tx/history before this is ever resolved — see
 *     resolveAmbiguousWithdrawal() below (no Admin UI yet — Phase 9).
 */
@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly transactions: TransactionsService,
    private readonly providerLogs: ProviderLogService,
    private readonly registry: ProviderRegistry,
    private readonly settings: SettingsService,
    private readonly kyc: KycService,
  ) {}

  async createWithdrawal(params: CreateWithdrawalParams) {
    const user = await this.prisma.user.findUnique({ where: { publicId: params.userPublicId } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });

    const asset = await this.prisma.asset.findUnique({ where: { code: params.assetCode.toUpperCase() } });
    if (!asset || !asset.isActive) {
      throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'العملة/الخدمة غير متاحة' });
    }
    const payoutCurrency = PAYOUT_ASSETS[params.providerCode]?.[asset.code];
    if (!payoutCurrency) {
      throw new BadRequestException({ code: 'ASSET_NOT_WITHDRAWABLE', message: 'لا يمكن سحب هذا الرصيد عبر هذا المزوّد' });
    }

    // Verified identity is required only if the admin enabled it (kyc.requirements): for all withdrawals and/or Sham Cash only.
    await this.kyc.assertVerified(user.id, 'withdrawals');
    if (params.providerCode === 'shamcash') await this.kyc.assertVerified(user.id, 'shamcashWithdrawals');

    // The user may send to ANY Sham Cash account (address) or Syriatel Cash number; it is requested at send time.
    const rawDestination = params.destination.trim();
    let destination: Record<string, unknown>;
    if (params.providerCode === 'shamcash') {
      if (!/^[A-Za-z0-9_\-.:@]{4,128}$/.test(rawDestination)) {
        throw new BadRequestException({ code: 'DESTINATION_INVALID', message: 'عنوان حساب شام كاش غير صالح' });
      }
      destination = { toAddress: rawDestination, currency: payoutCurrency };
    } else {
      const e164 = normalizePhone(rawDestination);
      if (!e164 || !/^\+9639\d{8}$/.test(e164)) {
        throw new BadRequestException({ code: 'DESTINATION_INVALID', message: 'رقم سيريتل كاش غير صالح (يبدأ بـ 09 ويتكوّن من 10 أرقام)' });
      }
      destination = { action: params.action ?? 'transfer_cash', toGsm: toLocalSyrian(e164) };
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

    // Limits are admin-managed (site setting "withdraw.limits": { "VYR_SCS": { min, max, dailyMax } }, decimal strings).
    // No entry for an asset = no limit for it. min/max are checked here; dailyMax inside the transaction below.
    const limits = (await this.settings.get<Record<string, { min?: string; max?: string; dailyMax?: string }>>('withdraw.limits', {}))[asset.code] ?? {};
    if (limits.min && amount.lessThan(Money.fromDecimalString(limits.min, asset.decimals))) {
      throw new BadRequestException({ code: 'BELOW_MIN_WITHDRAWAL', message: `الحد الأدنى للسحب ${limits.min} ${asset.code}` });
    }
    if (limits.max && !Money.fromDecimalString(limits.max, asset.decimals).greaterThanOrEqual(amount)) {
      throw new BadRequestException({ code: 'ABOVE_MAX_WITHDRAWAL', message: `الحد الأعلى للسحب ${limits.max} ${asset.code}` });
    }

    // Throws PROVIDER_UNAVAILABLE if this provider isn't ACTIVE — never even
    // attempts a hold for a provider that can't actually be called.
    const provider = await this.providerLogs.assertActiveProvider(params.providerCode);

    const adapter = this.registry.get(params.providerCode);
    if (!isOrderCapable(adapter)) {
      throw new BadRequestException({ code: 'PROVIDER_UNAVAILABLE', message: 'مزود الخدمة لا يدعم السحب حاليًا' });
    }

    const scopedIdempotencyKey = `withdrawal:${user.id}:${params.idempotencyKey}`;

    // ── Step 1: create the transaction + HOLD the funds, atomically. ──
    // This must commit BEFORE we ever call the external provider — the hold
    // has to be durable before we risk any external side effect.
    const { transaction, wasAlreadyProcessed } = await this.prisma.$transaction(async (tx) => {
      const freshUser = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (freshUser.status !== 'ACTIVE') {
        throw new ForbiddenException({ code: 'ACCOUNT_NOT_ACTIVE', message: 'حسابك غير نشط حاليًا ولا يمكنه إجراء عمليات' });
      }

      const { transaction, wasAlreadyProcessed } = await this.transactions.createIdempotent(tx, {
        type: TransactionType.WITHDRAWAL,
        idempotencyKey: scopedIdempotencyKey,
        referenceId: params.providerCode,
        initiatedBy: user.id,
      });

      if (wasAlreadyProcessed) return { transaction, wasAlreadyProcessed: true };

      // Hold FIRST: it row-locks this user's wallet account, which serialises concurrent withdrawals so the
      // daily-limit check below can't be raced by two parallel requests.
      await this.wallet.hold(tx, user.id, asset.code, amount);
      if (limits.dailyMax) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recent = await tx.transaction.findMany({
          where: { type: TransactionType.WITHDRAWAL, initiatedBy: user.id, createdAt: { gte: since }, status: { in: ['PROCESSING', 'COMPLETED'] } },
          include: { events: { where: { eventType: 'WITHDRAWAL_DETAILS' } } },
        });
        let used = Money.zero(asset.decimals);
        for (const t of recent) {
          const d = t.events[0]?.payloadJson as unknown as WithdrawalDetails | undefined;
          if (d && d.assetCode === asset.code) used = used.add(Money.fromDecimalString(d.amount, asset.decimals));
        }
        if (!Money.fromDecimalString(limits.dailyMax, asset.decimals).greaterThanOrEqual(used.add(amount))) {
          throw new BadRequestException({ code: 'DAILY_LIMIT_EXCEEDED', message: `تجاوزت الحد اليومي للسحب (${limits.dailyMax} ${asset.code})` });
        }
      }

      const details: WithdrawalDetails = {
        providerCode: params.providerCode,
        assetCode: asset.code,
        amount: amount.toDecimalString(),
        destination,
      };
      await this.transactions.recordEvent(tx, transaction.id, 'WITHDRAWAL_DETAILS', details as unknown as Record<string, unknown>);
      await this.transactions.transitionTo(tx, transaction.id, 'PROCESSING');

      return { transaction, wasAlreadyProcessed: false };
    });

    if (wasAlreadyProcessed) {
      // Idempotent replay — the hold (or settlement, or release) for this
      // exact request already happened in a prior attempt. Never call the
      // provider again; just report current status.
      return this.toReceipt(await this.prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } }));
    }

    // ── Step 2: call the external provider — OUTSIDE any DB transaction. ──
    // Never hold a DB transaction open across a slow/unreliable network call.
    let result: ProviderOrderResult;
    try {
      result = await this.providerLogs.logCall(
        {
          providerId: provider.id,
          action: 'CREATE_ORDER',
          requestPayload: { amount: amount.toDecimalString(), destination },
        },
        () =>
          adapter.createOrder({
            amountMinor: amount.toMinorUnits(),
            assetCode: asset.code,
            reference: transaction.publicId,
            metadata: destination,
          }),
      );
    } catch (err) {
      if (isAmbiguousOutcomeError(err)) {
        // Do NOT release, do NOT settle. Leave the hold in place. Record for
        // mandatory manual reconciliation — see resolveAmbiguousWithdrawal().
        await this.transactions.recordEvent(this.prisma, transaction.id, 'AMBIGUOUS_OUTCOME', {
          error: err instanceof Error ? err.message : String(err),
        });
        this.logger.error(
          `AMBIGUOUS withdrawal outcome for transaction ${transaction.publicId} (provider=${params.providerCode}) — ` +
            'funds remain HELD. Requires manual reconciliation via the provider before any resolution. Never auto-retry this.',
        );
        return this.toReceipt(
          await this.prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } }),
          'قيد المراجعة اليدوية — لم نتمكن من تأكيد نتيجة العملية لدى المزوّد',
        );
      }

      // Confirmed rejection — release the hold, mark FAILED.
      await this.prisma.$transaction(async (tx) => {
        await this.wallet.release(tx, user.id, asset.code, amount);
        await this.transactions.transitionTo(tx, transaction.id, 'FAILED', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
      const tsaMessage = (err as { tsaError?: string } | undefined)?.tsaError;
      throw new BadRequestException({ code: 'WITHDRAWAL_FAILED', message: tsaMessage ?? 'تعذّر إتمام السحب' });
    }

    // ── Step 3: settle or release based on the provider's reported outcome. ──
    if (result.status === 'COMPLETED') {
      await this.prisma.$transaction(async (tx) => {
        await this.wallet.settle(tx, user.id, asset.code, amount, transaction.id);
        await this.transactions.transitionTo(tx, transaction.id, 'COMPLETED', { providerOrderId: result.providerOrderId });
      });
    } else if (result.status === 'FAILED' || result.status === 'CANCELLED') {
      await this.prisma.$transaction(async (tx) => {
        await this.wallet.release(tx, user.id, asset.code, amount);
        await this.transactions.transitionTo(tx, transaction.id, 'FAILED', { providerOrderId: result.providerOrderId });
      });
    }
    // else PENDING: no currently-registered adapter returns this (Sham Cash/
    // Syriatel transfers settle synchronously) — left as PROCESSING/held for
    // a future truly-async provider. Nothing to do here yet.

    return this.toReceipt(
      await this.prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } }),
      undefined,
      result.providerOrderId,
    );
  }

  /** Admin: withdrawals stuck in PROCESSING (ambiguous provider outcome, or the process died after the hold). */
  async listStuckWithdrawals(olderThanMinutes = 10) {
    const before = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const txs = await this.prisma.transaction.findMany({
      where: { type: TransactionType.WITHDRAWAL, status: 'PROCESSING', createdAt: { lt: before } },
      include: { events: { where: { eventType: { in: ['WITHDRAWAL_DETAILS', 'AMBIGUOUS_OUTCOME'] } } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const userIds = [...new Set(txs.map((t) => t.initiatedBy).filter((x): x is bigint => x != null))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } });
    const nameById = new Map(users.map((u) => [u.id.toString(), u.username]));
    return txs.map((t) => {
      const details = t.events.find((e) => e.eventType === 'WITHDRAWAL_DETAILS')?.payloadJson as unknown as WithdrawalDetails | undefined;
      return {
        transactionId: t.publicId,
        username: t.initiatedBy != null ? nameById.get(t.initiatedBy.toString()) ?? null : null,
        providerCode: details?.providerCode ?? null,
        assetCode: details?.assetCode ?? null,
        amount: details?.amount ?? null,
        destination: details?.destination ?? null,
        ambiguous: t.events.some((e) => e.eventType === 'AMBIGUOUS_OUTCOME'),
        createdAt: t.createdAt,
      };
    });
  }

  /**
   * Manual reconciliation for an AMBIGUOUS_OUTCOME withdrawal — no Admin UI
   * yet (Phase 9); callable via a script or future admin endpoint once an
   * operator has independently confirmed via the provider's own find_tx/
   * history what actually happened.
   */
  async resolveAmbiguousWithdrawal(transactionPublicId: string, outcome: 'SUCCEEDED' | 'FAILED', providerOrderId?: string) {
    const transaction = await this.prisma.transaction.findUnique({ where: { publicId: transactionPublicId } });
    if (!transaction || transaction.type !== TransactionType.WITHDRAWAL) {
      throw new NotFoundException({ code: 'TRANSACTION_NOT_FOUND', message: 'العملية غير موجودة' });
    }
    const detailsEvent = await this.prisma.transactionEvent.findFirst({
      where: { transactionId: transaction.id, eventType: 'WITHDRAWAL_DETAILS' },
    });
    const details = detailsEvent?.payloadJson as unknown as WithdrawalDetails | undefined;
    if (!details) throw new Error(`resolveAmbiguousWithdrawal: no WITHDRAWAL_DETAILS event for transaction ${transactionPublicId}`);

    const asset = await this.prisma.asset.findUniqueOrThrow({ where: { code: details.assetCode } });
    const amount = Money.fromDecimalString(details.amount, asset.decimals);

    await this.prisma.$transaction(async (tx) => {
      if (outcome === 'SUCCEEDED') {
        await this.wallet.settle(tx, transaction.initiatedBy!, details.assetCode, amount, transaction.id);
        await this.transactions.transitionTo(tx, transaction.id, 'COMPLETED', { providerOrderId, resolvedManually: true });
      } else {
        await this.wallet.release(tx, transaction.initiatedBy!, details.assetCode, amount);
        await this.transactions.transitionTo(tx, transaction.id, 'FAILED', { resolvedManually: true });
      }
    });
  }

  private toReceipt(transaction: { publicId: string; status: string; createdAt: Date }, note?: string, providerOrderId?: string) {
    return {
      transactionId: transaction.publicId,
      status: transaction.status,
      note: note ?? null,
      providerOrderId: providerOrderId ?? null,
      createdAt: transaction.createdAt,
    };
  }
}
