/**
 * Development-only seed. NEVER run against production.
 * Contains no real API keys, no real users, no real balances.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { DEFAULT_RESERVED_USERNAMES } from '../src/modules/users/username-policy';

const prisma = new PrismaClient();

async function main() {
  // Baseline data (roles, permissions, assets, networks, DISABLED providers) is REQUIRED in every environment —
  // without it registration fails. Dev-only extras (dev admin, mock provider ACTIVE, demo catalog) are skipped
  // in production. Create the first production admin with: npm run create-admin
  const isProd = process.env.NODE_ENV === 'production';

  // Roles
  const roleDefs = [
    { code: 'USER' as const, name: 'مستخدم' },
    { code: 'SUPPORT' as const, name: 'دعم فني' },
    { code: 'ADMIN' as const, name: 'مسؤول' },
    { code: 'SUPER_ADMIN' as const, name: 'مسؤول عام' },
    { code: 'STORE_ADMIN' as const, name: 'مدير المتجر' },
  ];
  for (const r of roleDefs) {
    await prisma.role.upsert({ where: { code: r.code }, update: {}, create: r });
  }

  // Baseline permissions (extended per-module as Phases 3+ land)
  const permissionDefs = [
    { code: 'users.view', label: 'عرض المستخدمين' },
    { code: 'users.freeze', label: 'تجميد/إلغاء تجميد مستخدم' },
    // Deliberately NOT granted to ADMIN by default below — only SUPER_ADMIN
    // gets it (via the "all permissions" loop). Assigning ADMIN/SUPER_ADMIN
    // roles is further restricted in code to callers who ARE SUPER_ADMIN,
    // regardless of this permission — see AdminUsersService.
    { code: 'users.manage_roles', label: 'إدارة أدوار المستخدمين' },
    { code: 'providers.manage', label: 'إدارة مزودي الخدمة' },
    { code: 'settings.manage', label: 'إدارة إعدادات النظام' },
    { code: 'wallets.view', label: 'عرض المحافظ والتسوية' },
    { code: 'withdrawals.resolve', label: 'حلّ السحوبات والطلبات العالقة' },
    { code: 'rates.manage', label: 'إدارة أسعار الصرف' },
    { code: 'news.manage', label: 'إدارة الأخبار والعروض' },
    { code: 'media.upload', label: 'رفع الصور' },
    { code: 'store.manage', label: 'إدارة المتجر (أقسام، منتجات، أسعار)' },
    { code: 'store.suppliers', label: 'مزامنة مزوّدي المتجر' },
    { code: 'kyc.review', label: 'مراجعة توثيق الهوية' },
  ];
  for (const p of permissionDefs) {
    await prisma.permission.upsert({ where: { code: p.code }, update: {}, create: p });
  }

  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });
  const allPermissions = await prisma.permission.findMany();
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: superAdminRole.id, permissionId: perm.id },
    });
  }

  // ADMIN: day-to-day operational permissions only — NOT users.manage_roles
  // or settings.manage (reserved for SUPER_ADMIN).
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
  for (const code of ['users.view', 'users.freeze', 'providers.manage', 'wallets.view', 'withdrawals.resolve', 'rates.manage', 'news.manage', 'media.upload', 'store.manage', 'store.suppliers', 'kyc.review']) {
    const perm = await prisma.permission.findUniqueOrThrow({ where: { code } });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: perm.id },
    });
  }

  // STORE_ADMIN: catalog, pricing, suppliers, images — nothing about users, wallets or money operations.
  const storeAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'STORE_ADMIN' } });
  for (const code of ['store.manage', 'store.suppliers', 'media.upload']) {
    const perm = await prisma.permission.findUniqueOrThrow({ where: { code } });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: storeAdminRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: storeAdminRole.id, permissionId: perm.id },
    });
  }

  // SUPPORT: read-only.
  const supportRole = await prisma.role.findUniqueOrThrow({ where: { code: 'SUPPORT' } });
  const usersViewPerm = await prisma.permission.findUniqueOrThrow({ where: { code: 'users.view' } });
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: supportRole.id, permissionId: usersViewPerm.id } },
    update: {},
    create: { roleId: supportRole.id, permissionId: usersViewPerm.id },
  });

  // Reserved usernames
  for (const username of DEFAULT_RESERVED_USERNAMES) {
    await prisma.reservedUsername.upsert({
      where: { username },
      update: {},
      create: { username, reason: 'seed: default reserved list' },
    });
  }

  // Starter assets (dynamic — Admin can add/edit/disable more later)
  const assetDefs = [
    { code: 'USDT', name: 'Tether USD', type: 'crypto', decimals: 6 },
    { code: 'LTC', name: 'Litecoin', type: 'crypto', decimals: 8 },
    { code: 'VYR_SCS', name: 'VAYRO Cash SYP', type: 'fiat_wallet', decimals: 2 },
    { code: 'VYR_SCD', name: 'VAYRO Cash USD', type: 'fiat_wallet', decimals: 2 },
    { code: 'SYRIATEL_CASH', name: 'Syriatel Cash', type: 'mobile_cash', decimals: 2 },
  ];
  for (const a of assetDefs) {
    await prisma.asset.upsert({ where: { code: a.code }, update: {}, create: a });
  }

  // Providers registered as DISABLED placeholders — no adapters wired until real API docs arrive.
  const providerDefs = [
    { code: 'shamcash', name: 'Sham Cash Provider', type: 'payment', status: 'DISABLED' as const },
    { code: 'syriatel', name: 'Syriatel Cash Provider', type: 'payment', status: 'DISABLED' as const },
    // tatum: DISABLED until an operator stores real `api_key` + `hmac_secret`
    // via SecretsService, calls TatumAdapter.enableHmac() once, and flips this
    // to ACTIVE. Supersedes the earlier generic "usdt-custody" placeholder —
    // this IS the real, working adapter. See docs/05_APIS_AND_PROVIDERS.txt §7.
    { code: 'tatum', name: 'Tatum (USDT/LTC deposit monitoring)', type: 'crypto', status: 'DISABLED' as const },
    // The ONE provider with a real, working adapter (MockProviderAdapter) — Phase 5.
    // ACTIVE by design: it exists specifically to exercise ProviderRegistry /
    // ProviderLogService / webhook idempotency end-to-end without touching any
    // external API. See docs/05_APIS_AND_PROVIDERS.txt.
    { code: 'mock', name: 'Mock Provider (dev/test only)', type: 'other', status: isProd ? ('DISABLED' as const) : ('ACTIVE' as const) },
    // Store suppliers — rows only; each stays DISABLED until its adapter exists and credentials are stored.
    { code: 'shahnstore', name: 'Shahn Store', type: 'game', status: 'DISABLED' as const },
    { code: 'shamekh_bot', name: 'بوت شامخ (Railway reseller API)', type: 'game', status: 'DISABLED' as const },
    { code: 'canboso', name: 'Canboso buyer API', type: 'game', status: 'DISABLED' as const },
  ];
  for (const p of providerDefs) {
    const { status, ...rest } = p;
    await prisma.provider.upsert({ where: { code: p.code }, update: {}, create: { ...rest, status } });
  }

  // Networks for HD-derived deposit addresses (Phase 6). Active by default —
  // deriving/storing an address costs nothing and moves no funds by itself;
  // actual crediting only happens once `tatum` above is ACTIVE with real
  // credentials. See docs/05_APIS_AND_PROVIDERS.txt §6/§7.
  //
  // tatumChainId values are CONFIRMED by live-testing against a real Tatum
  // account (not guessed) — see docs §7. tokenContractAddress values below are
  // the widely-published mainnet USDT contract addresses for each chain —
  // VERIFY them yourself against an independent source before relying on them;
  // an incorrect contract address here means deposits are silently never detected.
  const networkDefs = [
    {
      code: 'BEP20' as const,
      name: 'USDT on BNB Smart Chain (BEP-20)',
      tatumChainId: 'bsc-mainnet',
      // Binance-Peg BSC-USD — NOTE: 18 decimals on-chain (unlike the 6-decimal
      // USDT elsewhere). We don't need to know that here: Tatum's webhook
      // reports `amount` already in human-readable decimal form, which we
      // parse against OUR OWN 'USDT' asset's decimals (6), not the token's.
      tokenContractAddress: '0x55d398326f99059fF775485246999027B3197955',
      requiredConfirmations: 15,
    },
    {
      code: 'TRC20' as const,
      name: 'USDT on Tron (TRC-20)',
      tatumChainId: 'tron-mainnet',
      tokenContractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      requiredConfirmations: 19,
    },
    {
      code: 'LTC' as const,
      name: 'Litecoin (native SegWit)',
      tatumChainId: 'litecoin-core-mainnet',
      tokenContractAddress: null, // native coin — INCOMING_NATIVE_TX, no contract filter
      requiredConfirmations: 6,
    },
  ];
  for (const n of networkDefs) {
    await prisma.network.upsert({
      where: { code: n.code },
      update: { tatumChainId: n.tatumChainId, tokenContractAddress: n.tokenContractAddress, requiredConfirmations: n.requiredConfirmations },
      create: { ...n, isActive: true },
    });
  }

  if (!isProd) {
    // Dev-only admin account — password must be changed immediately; never used in production.
    const devAdminEmail = 'dev-admin@vayro.local';
    const existingAdmin = await prisma.user.findUnique({ where: { email: devAdminEmail } });
    if (!existingAdmin) {
      const passwordHash = await argon2.hash('ChangeMe!DevOnly123', { type: argon2.argon2id });
      const admin = await prisma.user.create({
        data: {
          username: 'dev_admin',
          usernameLower: 'dev_admin',
          email: devAdminEmail,
          phone: '+963900000000', // dev-only placeholders (both are mandatory + immutable)
          shamcashAddress: 'dev-admin-shamcash',
          passwordHash,
          status: 'ACTIVE',
          profile: { create: {} },
          roles: { create: { role: { connect: { code: 'SUPER_ADMIN' } } } },
        },
      });
      console.log(`Seeded dev admin: ${admin.email} / ChangeMe!DevOnly123 (development only!)`);
    }

    // Phase 8 — demo store catalog, backed by the "mock" provider (the only
    // one with a real, working adapter — see providerDefs above). Lets the
    // whole Product → ProviderService → Provider chain be exercised end-to-end
    // without needing a real game-topup provider's documentation.
    const mockProvider = await prisma.provider.findUniqueOrThrow({ where: { code: 'mock' } });
    const demoCategory = await prisma.productCategory.upsert({
      where: { slug: 'demo' },
      update: {},
      create: { name: 'تجريبي (Demo)', slug: 'demo', isActive: true, sortOrder: 0 },
    });
    const demoProduct = await prisma.product.upsert({
      where: { id: 1n }, // fine for a single deterministic seed row; Admin CRUD (Phase 9) won't rely on this
      update: {},
      create: {
        id: 1n,
        categoryId: demoCategory.id,
        name: 'منتج تجريبي — 100 USDT',
        description: 'منتج توضيحي فقط، يستخدم Mock Provider — لا اتصال حقيقي بأي مزوّد خارجي.',
        isActive: true,
        sortOrder: 0,
      },
    });
    await prisma.providerService.upsert({
      where: { id: 1n },
      update: {},
      create: {
        id: 1n,
        productId: demoProduct.id,
        providerId: mockProvider.id,
        providerSkuCode: 'demo-sku-100',
        priceAssetCode: 'USDT',
        priceAmount: '10',
        isActive: true,
      },
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
