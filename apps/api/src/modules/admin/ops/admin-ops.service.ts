import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../../common/audit/audit.service';
import { Money } from '../../../common/money/money';
import { SettingsService } from '../../site/settings.service';
import { parseRate } from '../../conversion/conversion.service';

/** Setting keys an admin may edit, with a light validator each. Anything else is rejected. */
const EDITABLE_SETTINGS: Record<string, (v: Record<string, unknown>) => void> = {
  'withdraw.limits': (v) => {
    for (const [asset, lim] of Object.entries(v)) {
      if (!/^[A-Z0-9_]{2,16}$/.test(asset) || typeof lim !== 'object' || lim === null) throw new Error(`limits.${asset}`);
      for (const [k, n] of Object.entries(lim as Record<string, unknown>)) {
        if (!['min', 'max', 'dailyMax'].includes(k) || typeof n !== 'string' || !/^\d{1,15}(\.\d{1,8})?$/.test(n)) throw new Error(`limits.${asset}.${k}`);
      }
    }
  },
  'login.images': (v) => {
    const imgs = v.images;
    if (!Array.isArray(imgs) || imgs.length > 10 || !imgs.every((u) => typeof u === 'string' && /^(\/api\/v1\/media\/[a-f0-9-]{36}\.(png|jpg|webp)|https:\/\/\S{3,500})$/.test(u))) throw new Error('login.images');
  },
  'site.social': (v) => {
    for (const [k, u] of Object.entries(v)) if (!/^[a-z]{2,20}$/.test(k) || typeof u !== 'string' || !(u === '' || /^(https:\/\/|mailto:)\S{3,300}$/.test(u))) throw new Error(`social.${k}`);
  },
  'site.announcement': (v) => {
    if (typeof v.text !== 'string' || v.text.length > 300 || typeof v.enabled !== 'boolean') throw new Error('announcement');
  },
  'kyc.requirements': (v) => {
    const allowed = ['depositAddresses', 'withdrawals', 'shamcashWithdrawals', 'store', 'transfers'];
    for (const [k, b] of Object.entries(v)) if (!allowed.includes(k) || typeof b !== 'boolean') throw new Error(`kyc.${k}`);
  },
  'store.defaultMargin': (v) => {
    if (!['PERCENT', 'FIXED'].includes(String(v.type)) || !/^\d{1,12}(\.\d{1,8})?$/.test(String(v.value))) throw new Error('defaultMargin');
  },
};

@Injectable()
export class AdminOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  // ── settings ──
  async getSettings() {
    return this.settings.getAll();
  }

  async setSetting(key: string, value: Record<string, unknown>, actorPublicId: string, ip?: string) {
    const validate = EDITABLE_SETTINGS[key];
    if (!validate) throw new BadRequestException({ code: 'SETTING_UNKNOWN', message: 'إعداد غير معروف' });
    try {
      validate(value);
    } catch (e) {
      throw new BadRequestException({ code: 'SETTING_INVALID', message: `قيمة غير صالحة (${e instanceof Error ? e.message : key})` });
    }
    const actor = await this.prisma.user.findUnique({ where: { publicId: actorPublicId }, select: { id: true } });
    const before = await this.settings.get(key, null);
    await this.settings.set(key, value, actor?.id);
    await this.audit.log({ actorPublicId, action: 'SETTING_SET', entityType: 'SiteSetting', entityId: key, before, after: value, ipAddress: ip });
    return { ok: true };
  }

  // ── exchange rates ──
  async listRates() {
    const rows = await this.prisma.exchangeRate.findMany({ orderBy: [{ fromAssetCode: 'asc' }, { toAssetCode: 'asc' }] });
    return rows.map((r) => ({ from: r.fromAssetCode, to: r.toAssetCode, rate: r.rate, isActive: r.isActive, updatedAt: r.updatedAt }));
  }

  async setRate(dto: { fromAssetCode: string; toAssetCode: string; rate: string; isActive?: boolean }, actorPublicId: string, ip?: string) {
    const from = dto.fromAssetCode.toUpperCase();
    const to = dto.toAssetCode.toUpperCase();
    if (from === to) throw new BadRequestException({ code: 'RATE_INVALID', message: 'العملتان متطابقتان' });
    try { parseRate(dto.rate); } catch { throw new BadRequestException({ code: 'RATE_INVALID', message: 'سعر الصرف غير صالح' }); }
    const assets = await this.prisma.asset.findMany({ where: { code: { in: [from, to] } } });
    if (assets.length !== 2) throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'عملة غير موجودة' });
    const actor = await this.prisma.user.findUnique({ where: { publicId: actorPublicId }, select: { id: true } });
    const where = { fromAssetCode_toAssetCode: { fromAssetCode: from, toAssetCode: to } };
    const before = await this.prisma.exchangeRate.findUnique({ where });
    await this.prisma.exchangeRate.upsert({
      where,
      update: { rate: dto.rate, isActive: dto.isActive ?? true, updatedBy: actor?.id },
      create: { fromAssetCode: from, toAssetCode: to, rate: dto.rate, isActive: dto.isActive ?? true, updatedBy: actor?.id },
    });
    await this.audit.log({ actorPublicId, action: 'RATE_SET', entityType: 'ExchangeRate', entityId: `${from}>${to}`, before: before ? { rate: before.rate, isActive: before.isActive } : null, after: dto, ipAddress: ip });
    return { ok: true };
  }

  // ── wallets ──
  async userWallet(publicId: string) {
    const user = await this.prisma.user.findUnique({ where: { publicId } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });
    const wallet = await this.prisma.wallet.findUnique({ where: { userId: user.id }, include: { accounts: { include: { asset: true } } } });
    const ledger = await this.prisma.ledgerAccount.findMany({ where: { ownerType: 'USER', ownerId: user.id }, include: { asset: true } });
    const ledgerByAsset = new Map(ledger.map((l) => [l.asset.code, l.balanceMinor]));
    const recent = await this.prisma.transaction.findMany({ where: { initiatedBy: user.id }, orderBy: { id: 'desc' }, take: 30 });
    return {
      user: { publicId: user.publicId, username: user.username, email: user.email, phone: user.phone, shamcashAddress: user.shamcashAddress, status: user.status },
      balances: (wallet?.accounts ?? []).map((a) => {
        const dec = a.asset.decimals;
        const ledgerBal = ledgerByAsset.get(a.asset.code) ?? 0n;
        return {
          assetCode: a.asset.code,
          available: Money.fromMinorUnits(a.availableMinor, dec).toDecimalString(),
          held: Money.fromMinorUnits(a.heldMinor, dec).toDecimalString(),
          ledger: Money.fromMinorUnits(ledgerBal, dec).toDecimalString(),
          consistent: a.availableMinor + a.heldMinor === ledgerBal,
        };
      }),
      recentTransactions: recent.map((t) => ({ id: t.publicId, type: t.type, status: t.status, createdAt: t.createdAt })),
    };
  }

  /**
   * Integrity checks across the whole system. Read-only. Run it routinely; any non-empty section is a finding.
   *  1. wallet projection vs ledger:  available + held must equal the USER ledger balance, per account
   *  2. every transaction's entries must sum to zero (double-entry)  — transactions from before the SYSTEM
   *     mirror entries existed will show up here until backfilled
   *  3. per asset, the sum of ALL ledger balances (users + SYSTEM) must be zero
   *  4. negative balances
   *  5. withdrawals/orders stuck in PROCESSING
   */
  async reconcile() {
    const mismatches = await this.prisma.$queryRaw<{ wallet_account_id: bigint; user_id: bigint; asset: string; wallet_total: bigint; ledger_balance: bigint }[]>`
      SELECT wa.id AS wallet_account_id, w.user_id AS user_id, a.code AS asset,
             (wa.available_minor + wa.held_minor) AS wallet_total, COALESCE(la.balance_minor, 0) AS ledger_balance
      FROM wallet_accounts wa
      JOIN wallets w ON w.id = wa.wallet_id
      JOIN assets a ON a.id = wa.asset_id
      LEFT JOIN ledger_accounts la ON la.owner_type = 'USER' AND la.owner_id = w.user_id AND la.asset_id = wa.asset_id
      WHERE (wa.available_minor + wa.held_minor) <> COALESCE(la.balance_minor, 0)
      LIMIT 200`;
    const unbalanced = await this.prisma.$queryRaw<{ transaction_id: bigint; net: bigint }[]>`
      SELECT transaction_id,
             SUM(CASE direction WHEN 'CREDIT' THEN amount_minor ELSE -amount_minor END) AS net
      FROM ledger_entries GROUP BY transaction_id
      HAVING SUM(CASE direction WHEN 'CREDIT' THEN amount_minor ELSE -amount_minor END) <> 0
      LIMIT 200`;
    const assetTotals = await this.prisma.$queryRaw<{ asset: string; total: bigint }[]>`
      SELECT a.code AS asset, SUM(la.balance_minor) AS total
      FROM ledger_accounts la JOIN assets a ON a.id = la.asset_id
      GROUP BY a.code HAVING SUM(la.balance_minor) <> 0`;
    const negatives = await this.prisma.$queryRaw<{ wallet_account_id: bigint; available: bigint; held: bigint }[]>`
      SELECT id AS wallet_account_id, available_minor AS available, held_minor AS held
      FROM wallet_accounts WHERE available_minor < 0 OR held_minor < 0 LIMIT 200`;
    const [stuckWithdrawals, stuckOrders] = await Promise.all([
      this.prisma.transaction.count({ where: { type: 'WITHDRAWAL', status: 'PROCESSING', createdAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } } }),
      this.prisma.storeOrder.count({ where: { status: 'PROCESSING', createdAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } } }),
    ]);
    const s = (n: bigint) => n.toString();
    return {
      ok: !mismatches.length && !unbalanced.length && !assetTotals.length && !negatives.length && !stuckWithdrawals && !stuckOrders,
      walletVsLedger: mismatches.map((m) => ({ walletAccountId: s(m.wallet_account_id), userId: s(m.user_id), asset: m.asset, walletTotalMinor: s(m.wallet_total), ledgerBalanceMinor: s(m.ledger_balance) })),
      unbalancedTransactions: unbalanced.map((u) => ({ transactionId: s(u.transaction_id), netMinor: s(u.net) })),
      assetTotalsNotZero: assetTotals.map((t) => ({ asset: t.asset, totalMinor: s(t.total) })),
      negativeBalances: negatives.map((n) => ({ walletAccountId: s(n.wallet_account_id), availableMinor: s(n.available), heldMinor: s(n.held) })),
      stuckWithdrawals,
      stuckOrders,
      checkedAt: new Date(),
    };
  }
}
