import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StoreOrdersService } from '../../../src/modules/store/store-orders.service';
import { WalletService } from '../../../src/modules/wallet/wallet.service';
import { LedgerService } from '../../../src/modules/ledger/ledger.service';
import { TransactionsService } from '../../../src/modules/transactions/transactions.service';
import { ProviderLogService } from '../../../src/modules/providers/provider-log.service';
import { Money } from '../../../src/common/money/money';

function makeFakeDb() {
  const users = new Map<bigint, any>([[1n, { id: 1n, publicId: 'pub-1', status: 'ACTIVE' }]]);
  const providers = new Map<bigint, any>([[5n, { id: 5n, code: 'mock', status: 'ACTIVE' }]]);
  const assets = new Map<string, any>([['USDT', { id: 1n, code: 'USDT', decimals: 6, isActive: true }]]);
  const products = new Map<bigint, any>([[10n, { id: 10n, isActive: true, categoryId: 1n }]]);
  const providerServices = new Map<bigint, any>([
    [20n, { id: 20n, productId: 10n, providerId: 5n, providerSkuCode: 'sku-1', priceAssetCode: 'USDT', priceAmount: '10', isActive: true }],
  ]);
  const storeOrders = new Map<bigint, any>();
  const wallets = new Map<bigint, any>();
  const walletAccounts = new Map<bigint, any>();
  const ledgerAccounts = new Map<string, any>();
  const ledgerAccountsById = new Map<bigint, any>();
  const transactions = new Map<bigint, any>();
  const transactionsByKey = new Map<string, any>();
  const providerLogs: any[] = [];

  let nextWalletId = 1n;
  let nextAccountId = 1n;
  let nextLedgerId = 1n;
  let nextTxId = 1n;
  let nextEntryId = 1n;
  let nextEventId = 1n;
  let nextOrderId = 1n;

  const db: any = {
    _walletAccounts: walletAccounts,
    _storeOrders: storeOrders,
    _transactions: transactions,

    user: {
      findUnique: jest.fn(async ({ where }: any) => (where.publicId !== undefined ? [...users.values()].find((u) => u.publicId === where.publicId) ?? null : users.get(where.id) ?? null)),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => users.get(where.id)),
    },
    provider: { findUniqueOrThrow: jest.fn(async ({ where }: any) => (where.id !== undefined ? providers.get(where.id) : [...providers.values()].find((p) => p.code === where.code))) },
    asset: {
      findUnique: jest.fn(async ({ where }: any) => assets.get(where.code) ?? null),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => assets.get(where.code)),
    },
    product: {
      findUnique: jest.fn(async ({ where }: any) => {
        const p = products.get(where.id);
        if (!p) return null;
        return { ...p, services: [...providerServices.values()].filter((s) => s.productId === p.id && s.isActive) };
      }),
    },
    wallet: {
      upsert: jest.fn(async ({ where }: any) => {
        const existing = [...wallets.values()].find((w) => w.userId === where.userId);
        if (existing) return existing;
        const w = { id: nextWalletId++, userId: where.userId };
        wallets.set(w.id, w);
        return w;
      }),
    },
    walletAccount: {
      findUnique: jest.fn(async ({ where }: any) => {
        const { walletId, assetId } = where.walletId_assetId;
        return [...walletAccounts.values()].find((a) => a.walletId === walletId && a.assetId === assetId) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const a = { id: nextAccountId++, availableMinor: 0n, heldMinor: 0n, ...data };
        walletAccounts.set(a.id, a);
        return a;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const a = walletAccounts.get(where.id);
        if (data.availableMinor?.increment !== undefined) a.availableMinor += data.availableMinor.increment;
        if (data.availableMinor?.decrement !== undefined) a.availableMinor -= data.availableMinor.decrement;
        if (data.heldMinor?.increment !== undefined) a.heldMinor += data.heldMinor.increment;
        if (data.heldMinor?.decrement !== undefined) a.heldMinor -= data.heldMinor.decrement;
        return a;
      }),
    },
    ledgerAccount: {
      findFirst: jest.fn(async ({ where }: any) => ledgerAccounts.get(`${where.ownerType}:${where.ownerId}:${where.assetId}`) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextLedgerId++, balanceMinor: 0n, ...data };
        ledgerAccounts.set(`${data.ownerType}:${data.ownerId}:${data.assetId}`, row);
        ledgerAccountsById.set(row.id, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = ledgerAccountsById.get(where.id);
        row.balanceMinor = data.balanceMinor;
        return row;
      }),
    },
    ledgerEntry: { create: jest.fn(async ({ data }: any) => ({ id: nextEntryId++, ...data })) },
    transaction: {
      create: jest.fn(async ({ data }: any) => {
        if (transactionsByKey.has(data.idempotencyKey)) {
          throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.19.0' });
        }
        const tx = { id: nextTxId++, publicId: `txpub-${nextTxId}`, status: 'PENDING', createdAt: new Date(), ...data };
        transactions.set(tx.id, tx);
        transactionsByKey.set(data.idempotencyKey, tx);
        return tx;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => transactions.get(where.id)),
      update: jest.fn(async ({ where, data }: any) => {
        const tx = transactions.get(where.id);
        Object.assign(tx, data);
        return tx;
      }),
    },
    transactionEvent: { create: jest.fn(async ({ data }: any) => ({ id: nextEventId++, createdAt: new Date(), ...data })) },
    storeOrder: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextOrderId++, publicId: `order-${nextOrderId}`, providerOrderId: null, providerResponse: null, createdAt: new Date(), ...data };
        storeOrders.set(row.id, row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.transactionId !== undefined) return [...storeOrders.values()].find((o) => o.transactionId === where.transactionId) ?? null;
        return storeOrders.get(where.id) ?? null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => storeOrders.get(where.id)),
      update: jest.fn(async ({ where, data }: any) => {
        const row = storeOrders.get(where.id);
        Object.assign(row, data);
        return row;
      }),
    },
    providerLog: { create: jest.fn(async ({ data }: any) => ({ id: BigInt(providerLogs.length + 1), createdAt: new Date(), ...data })) },
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = strings.join('?');
      const id = values[0];
      if (sql.includes('FROM wallet_accounts')) {
        const wa = walletAccounts.get(id);
        return wa ? [{ id: wa.id, available_minor: wa.availableMinor, held_minor: wa.heldMinor }] : [];
      }
      if (sql.includes('FROM ledger_accounts')) {
        const la = ledgerAccountsById.get(id);
        return la ? [{ id: la.id, balance_minor: la.balanceMinor }] : [];
      }
      return [];
    }),
    $transaction: jest.fn(async (fn: any) => fn(db)),
  };

  return db;
}

function buildService(db: any, adapter: any) {
  const ledger = new LedgerService();
  const wallet = new WalletService(db, ledger);
  const transactions = new TransactionsService();
  const providerLogs = new ProviderLogService(db);
  const registry = { get: jest.fn().mockReturnValue(adapter) };
  return new StoreOrdersService(db, wallet, transactions, providerLogs, registry as any);
}

describe('StoreOrdersService.createOrder', () => {
  it('rejects an order that would overdraw the user, before ever calling the provider', async () => {
    const db = makeFakeDb();
    const adapter = { createOrder: jest.fn() };
    const service = buildService(db, adapter);

    await expect(
      service.createOrder({ userPublicId: 'pub-1', productId: 10n, idempotencyKey: 'k1' }),
    ).rejects.toThrow();
    expect(adapter.createOrder).not.toHaveBeenCalled();
  });

  it('on provider success: settles the hold, order COMPLETED with providerOrderId recorded', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const wallet = new WalletService(db, ledger);
    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('100', 6), 999n);

    const adapter = { createOrder: jest.fn().mockResolvedValue({ providerOrderId: 'mock_1', status: 'COMPLETED' }) };
    const service = buildService(db, adapter);

    const receipt = await service.createOrder({ userPublicId: 'pub-1', productId: 10n, idempotencyKey: 'k1' });

    expect(receipt.status).toBe('COMPLETED');
    expect(receipt.providerOrderId).toBe('mock_1');
    expect(receipt.amount).toBe('10'); // priceAmount for quantity=1
    const { account } = await wallet.getOrCreateWalletAccount(db, 1n, 'USDT');
    expect(account.availableMinor).toBe(90_000_000n); // 100 - 10
    expect(account.heldMinor).toBe(0n);
  });

  it('multiplies price by quantity', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const wallet = new WalletService(db, ledger);
    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('100', 6), 999n);

    const adapter = { createOrder: jest.fn().mockResolvedValue({ providerOrderId: 'mock_1', status: 'COMPLETED' }) };
    const service = buildService(db, adapter);

    const receipt = await service.createOrder({ userPublicId: 'pub-1', productId: 10n, quantity: 3, idempotencyKey: 'k1' });
    expect(receipt.amount).toBe('30'); // 10 * 3
  });

  it('on a confirmed provider rejection: releases the hold, order FAILED', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const wallet = new WalletService(db, ledger);
    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('100', 6), 999n);

    const adapter = { createOrder: jest.fn().mockRejectedValue(new Error('out of stock')) };
    const service = buildService(db, adapter);

    await expect(
      service.createOrder({ userPublicId: 'pub-1', productId: 10n, idempotencyKey: 'k1' }),
    ).rejects.toThrow(BadRequestException);

    const { account } = await wallet.getOrCreateWalletAccount(db, 1n, 'USDT');
    expect(account.availableMinor).toBe(100_000_000n); // fully released
    expect(account.heldMinor).toBe(0n);
    const order = [...db._storeOrders.values()][0];
    expect(order.status).toBe('FAILED');
  });

  it('on an AMBIGUOUS provider outcome: funds stay HELD, order stays PROCESSING', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const wallet = new WalletService(db, ledger);
    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('100', 6), 999n);

    const ambiguousError = Object.assign(new Error('timeout'), { ambiguousOutcome: true });
    const adapter = { createOrder: jest.fn().mockRejectedValue(ambiguousError) };
    const service = buildService(db, adapter);

    const receipt = await service.createOrder({ userPublicId: 'pub-1', productId: 10n, idempotencyKey: 'k1' });

    expect(receipt.status).toBe('PROCESSING');
    const { account } = await wallet.getOrCreateWalletAccount(db, 1n, 'USDT');
    expect(account.availableMinor).toBe(90_000_000n);
    expect(account.heldMinor).toBe(10_000_000n); // neither released nor settled
  });

  it('is idempotent: a retry with the same key never calls the provider a second time', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const wallet = new WalletService(db, ledger);
    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('100', 6), 999n);

    const adapter = { createOrder: jest.fn().mockResolvedValue({ providerOrderId: 'mock_1', status: 'COMPLETED' }) };
    const service = buildService(db, adapter);

    const params = { userPublicId: 'pub-1', productId: 10n, idempotencyKey: 'same-key' };
    await service.createOrder(params);
    await service.createOrder(params);

    expect(adapter.createOrder).toHaveBeenCalledTimes(1);
    const { account } = await wallet.getOrCreateWalletAccount(db, 1n, 'USDT');
    expect(account.availableMinor).toBe(90_000_000n); // debited only once
  });

  it('rejects a product with no active ProviderService (never calls the provider)', async () => {
    const db = makeFakeDb();
    db.product.findUnique = jest.fn(async () => ({ id: 99n, isActive: true, services: [] }));
    const adapter = { createOrder: jest.fn() };
    const service = buildService(db, adapter);

    await expect(
      service.createOrder({ userPublicId: 'pub-1', productId: 99n, idempotencyKey: 'k1' }),
    ).rejects.toThrow();
    expect(adapter.createOrder).not.toHaveBeenCalled();
  });
});
