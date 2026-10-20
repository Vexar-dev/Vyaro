import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { TransactionsService } from '../transactions/transactions.service';
import { Money } from '../../common/money/money';

const RATE_SCALE_DIGITS = 8;
const RATE_SCALE = 10n ** BigInt(RATE_SCALE_DIGITS);

/** "123.4567" -> 12345670000n (scaled by 1e8). Throws on anything that isn't a plain positive decimal. */
export function parseRate(rate: string): bigint {
  if (!/^\d{1,12}(\.\d{1,8})?$/.test(rate)) throw new Error(`invalid rate "${rate}"`);
  const [i, f = ''] = rate.split('.');
  const scaled = BigInt(i) * RATE_SCALE + BigInt(f.padEnd(RATE_SCALE_DIGITS, '0'));
  if (scaled <= 0n) throw new Error('rate must be > 0');
  return scaled;
}

/** out_minor = floor(in_minor * rate * 10^toDec / 10^fromDec) — always rounds DOWN, in the platform's favour. */
export function convertMinor(inMinor: bigint, rate: string, fromDecimals: number, toDecimals: number): bigint {
  return (inMinor * parseRate(rate) * 10n ** BigInt(toDecimals)) / (RATE_SCALE * 10n ** BigInt(fromDecimals));
}

interface ConversionDetails {
  fromAssetCode: string;
  toAssetCode: string;
  amountIn: string;
  amountOut: string;
  rate: string;
}

/**
 * ConversionService — lets a user convert one wallet asset into another at an ADMIN-SET rate
 * (e.g. USDT → VYR_SCS, so a crypto deposit becomes withdrawable to Sham Cash / Syriatel).
 * Pure ledger movement in one atomic DB transaction: debit(from) + credit(to), each with its SYSTEM mirror entry.
 * Only pairs that have an ACTIVE row in exchange_rates can be converted.
 */
@Injectable()
export class ConversionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly transactions: TransactionsService,
  ) {}

  async listRates() {
    const rows = await this.prisma.exchangeRate.findMany({ where: { isActive: true }, orderBy: { fromAssetCode: 'asc' } });
    return rows.map((r) => ({ from: r.fromAssetCode, to: r.toAssetCode, rate: r.rate }));
  }

  private async resolve(fromCode: string, toCode: string, amountStr: string) {
    const [from, to] = await Promise.all([
      this.prisma.asset.findUnique({ where: { code: fromCode } }),
      this.prisma.asset.findUnique({ where: { code: toCode } }),
    ]);
    if (!from?.isActive || !to?.isActive || from.id === to.id) {
      throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'العملة/الخدمة غير متاحة' });
    }
    const rateRow = await this.prisma.exchangeRate.findUnique({
      where: { fromAssetCode_toAssetCode: { fromAssetCode: from.code, toAssetCode: to.code } },
    });
    if (!rateRow || !rateRow.isActive) {
      throw new NotFoundException({ code: 'PAIR_UNAVAILABLE', message: 'التحويل بين هاتين العملتين غير متاح حاليًا' });
    }
    let amountIn: Money;
    try {
      amountIn = Money.fromDecimalString(amountStr, from.decimals);
    } catch {
      throw new BadRequestException({ code: 'AMOUNT_INVALID', message: 'صيغة المبلغ غير صالحة' });
    }
    if (amountIn.isNegative() || amountIn.isZero()) {
      throw new BadRequestException({ code: 'AMOUNT_INVALID', message: 'يجب أن يكون المبلغ أكبر من صفر' });
    }
    const outMinor = convertMinor(amountIn.toMinorUnits(), rateRow.rate, from.decimals, to.decimals);
    if (outMinor <= 0n) {
      throw new BadRequestException({ code: 'AMOUNT_TOO_SMALL', message: 'المبلغ صغير جدًا للتحويل' });
    }
    const amountOut = Money.fromMinorUnits(outMinor, to.decimals);
    return { from, to, amountIn, amountOut, rate: rateRow.rate };
  }

  async quote(fromCode: string, toCode: string, amount: string) {
    const q = await this.resolve(fromCode.toUpperCase(), toCode.toUpperCase(), amount);
    return { from: q.from.code, to: q.to.code, amountIn: q.amountIn.toDecimalString(), amountOut: q.amountOut.toDecimalString(), rate: q.rate };
  }

  async convert(params: { userPublicId: string; fromAssetCode: string; toAssetCode: string; amount: string; idempotencyKey: string }) {
    const user = await this.prisma.user.findUnique({ where: { publicId: params.userPublicId } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });

    const q = await this.resolve(params.fromAssetCode.toUpperCase(), params.toAssetCode.toUpperCase(), params.amount);
    const key = `convert:${user.id}:${params.idempotencyKey}`;

    return this.prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (fresh.status !== 'ACTIVE') {
        throw new ForbiddenException({ code: 'ACCOUNT_NOT_ACTIVE', message: 'حسابك غير نشط حاليًا ولا يمكنه إجراء عمليات' });
      }
      const { transaction, wasAlreadyProcessed } = await this.transactions.createIdempotent(tx, {
        type: TransactionType.CONVERSION,
        idempotencyKey: key,
        referenceId: `${q.from.code}>${q.to.code}`,
        initiatedBy: user.id,
      });
      if (wasAlreadyProcessed) {
        const ev = await tx.transactionEvent.findFirst({ where: { transactionId: transaction.id, eventType: 'CONVERSION_DETAILS' } });
        return this.receipt(transaction, ev?.payloadJson as unknown as ConversionDetails | undefined, true);
      }

      const details: ConversionDetails = {
        fromAssetCode: q.from.code,
        toAssetCode: q.to.code,
        amountIn: q.amountIn.toDecimalString(),
        amountOut: q.amountOut.toDecimalString(),
        rate: q.rate,
      };
      await this.transactions.recordEvent(tx, transaction.id, 'CONVERSION_DETAILS', details as unknown as Record<string, unknown>);
      await this.transactions.transitionTo(tx, transaction.id, 'PROCESSING');

      // Stable lock order across the user's two accounts (same deadlock-avoidance rule TransfersService uses).
      const a = (await this.wallet.getOrCreateWalletAccount(tx, user.id, q.from.code)).account;
      const b = (await this.wallet.getOrCreateWalletAccount(tx, user.id, q.to.code)).account;
      for (const id of [a.id, b.id].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))) {
        await tx.$queryRaw`SELECT id FROM wallet_accounts WHERE id = ${id} FOR UPDATE`;
      }
      await this.wallet.debit(tx, user.id, q.from.code, q.amountIn, transaction.id); // throws INSUFFICIENT_BALANCE
      await this.wallet.credit(tx, user.id, q.to.code, q.amountOut, transaction.id);

      const done = await this.transactions.transitionTo(tx, transaction.id, 'COMPLETED');
      return this.receipt(done, details, false);
    });
  }

  private receipt(t: { publicId: string; status: string; createdAt: Date }, d: ConversionDetails | undefined, replay: boolean) {
    return { transactionId: t.publicId, status: t.status, ...(d ?? {}), createdAt: t.createdAt, replay };
  }
}
