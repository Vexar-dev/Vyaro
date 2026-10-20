import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WithdrawalsService } from '../../../src/modules/withdrawals/withdrawals.service';
import { WalletService } from '../../../src/modules/wallet/wallet.service';
import { LedgerService } from '../../../src/modules/ledger/ledger.service';
import { TransactionsService } from '../../../src/modules/transactions/transactions.service';
import { ProviderLogService } from '../../../src/modules/providers/provider-log.service';
import { Money } from '../../../src/common/money/money';

function makeFakeDb() {
  const users = new Map<bigint, any>([[1n, { id: 1n, publicId: 'pub-1', status: 'ACTIVE' }]]);
  const providers = new Map<string, any>([['shamcash', { id: 5n, code: 'shamcash', status: 'ACTIVE' }]]);
  const assets = new Map<string, any>([['USDT', { id: 1n, code: 'USDT', decimals: 6, isActive: true }]]);
  const wallets = new Map<bigint, any>();
  const walletAccounts = new Map<bigint, any>();
  const ledgerAccounts = new Map<string, any>();
  const ledgerAccountsById = new Map<bigint, any>();
  const transactions = new Map<bigint, any>();
  const transactionsByKey = new Map<string, any>();
  const transactionEvents: any[] = [];
  const providerLogs: any[] = [];

  let nextWalletId = 1n;
  let nextAccountId = 1n;
  let nextLedgerId = 1n;
  let nextTxId = 1n;
  let nextEntryId = 1n;
  let nextEventId = 1n;

  const db: any = {
    _walletAccounts: walletAccounts,
    _transactions: transactions,

    user: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.publicId !== undefined) return [...users.values()].find((u) => u.publicId === where.publicId) ?? null;
        return users.get(where.id) ?? null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const u = users.get(where.id);
        if (!u) throw new Error('not found');
        return u;
      }),
    },
    provider: { findUnique: jest.fn(async ({ where }: any) => providers.get(where.code) ?? null) },
    asset: {
      findUnique: jest.fn(async ({ where }: any) => assets.get(where.code) ?? null),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => assets.get(where.code)),
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
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.idempotencyKey !== undefined) return transactionsByKey.get(where.idempotencyKey) ?? null;
        if (where.publicId !== undefined) return [...transactions.values()].find((t) => t.publicId === where.publicId) ?? null;
        return null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        if (where.id !== undefined) return transactions.get(where.id);
        return [...transactions.values()].find((t) => t.publicId === where.publicId);
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const tx = transactions.get(where.id);
        Object.assign(tx, data);
        return tx;
      }),
    },
    transactionEvent: {
      create: jest.fn(async ({ data }: any) => {
        const ev = { id: nextEventId++, createdAt: new Date(), ...data };
        transactionEvents.push(ev);
        return ev;
      }),
      findFirst: jest.fn(async ({ where }: any) =>
        [...transactionEvents].filter((e) => e.transactionId === where.transactionId && e.eventType === where.eventType)[0] ?? null,
      ),
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
  return new WithdrawalsService(db, wallet, transactions, providerLogs, registry as any);
}

describe('WithdrawalsService.createWithdrawal', () => {
  it('rejects a withdrawal that would overdraw the user, before ever calling the provider', async () => {
    const db = makeFakeDb();
    const adapter = { createOrder: jest.fn() };
    const service = buildService(db, adapter);

    await expect(
      service.createWithdrawal({
        userPublicId: 'pub-1',
        providerCode: 'shamcash',
        assetCode: 'USDT',
        amount: '100',
        destination: { toAddress: 'addr' },
        idempotencyKey: 'k1',
      }),
    ).rejects.toThrow(); // INSUFFICIENT_BALANCE

    expect(adapter.createOrder).not.toHaveBeenCalled();
  });

  it('on provider success: settles the hold (ledger DEBIT posted), transaction COMPLETED', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const wallet = new WalletService(db, ledger);
    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('500', 6), 999n);

    const adapter = { createOrder: jest.fn().mockResolvedValue({ providerOrderId: 'tsa-1', status: 'COMPLETED' }) };
    const service = buildService(db, adapter);

    const receipt = await service.createWithdrawal({
      userPublicId: 'pub-1',
      providerCode: 'shamcash',
      assetCode: 'USDT',
      amount: '100',
      destination: { toAddress: 'addr' },
      idempotencyKey: 'k1',
    });

    expect(receipt.status).toBe('COMPLETED');
    const { account } = await wallet.getOrCreateWalletAccount(db, 1n, 'USDT');
    expect(account.availableMinor).toBe(400_000_000n); // 500 - 100
    expect(account.heldMinor).toBe(0n); // settled — nothing left held
  });

  it('on a confirmed provider rejection: releases the hold back to available, transaction FAILED', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const wallet = new WalletService(db, ledger);
    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('500', 6), 999n);

    const adapter = { createOrder: jest.fn().mockRejectedValue(new Error('rejected: bad pin')) };
    const service = buildService(db, adapter);

    await expect(
      service.createWithdrawal({
        userPublicId: 'pub-1',
        providerCode: 'shamcash',
        assetCode: 'USDT',
        amount: '100',
        destination: { toAddress: 'addr' },
        idempotencyKey: 'k1',
      }),
    ).rejects.toThrow(BadRequestException);

    const { account } = await wallet.getOrCreateWalletAccount(db, 1n, 'USDT');
    expect(account.availableMinor).toBe(500_000_000n); // fully released — as if nothing happened
    expect(account.heldMinor).toBe(0n);
    const tx = [...db._transactions.values()][0];
    expect(tx.status).toBe('FAILED');
  });

  it('on an AMBIGUOUS provider outcome: funds stay HELD (neither released nor settled), transaction stays PROCESSING', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const wallet = new WalletService(db, ledger);
    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('500', 6), 999n);

    const ambiguousError = Object.assign(new Error('network timeout'), { ambiguousOutcome: true });
    const adapter = { createOrder: jest.fn().mockRejectedValue(ambiguousError) };
    const service = buildService(db, adapter);

    const receipt = await service.createWithdrawal({
      userPublicId: 'pub-1',
      providerCode: 'shamcash',
      assetCode: 'USDT',
      amount: '100',
      destination: { toAddress: 'addr' },
      idempotencyKey: 'k1',
    });

    expect(receipt.status).toBe('PROCESSING');
    const { account } = await wallet.getOrCreateWalletAccount(db, 1n, 'USDT');
    expect(account.availableMinor).toBe(400_000_000n); // still reduced — money is "in limbo", not available
    expect(account.heldMinor).toBe(100_000_000n); // still held — neither released nor settled
  });

  it('is idempotent: a retry with the same key never calls the provider a second time', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const wallet = new WalletService(db, ledger);
    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('500', 6), 999n);

    const adapter = { createOrder: jest.fn().mockResolvedValue({ providerOrderId: 'tsa-1', status: 'COMPLETED' }) };
    const service = buildService(db, adapter);

    const params = {
      userPublicId: 'pub-1',
      providerCode: 'shamcash' as const,
      assetCode: 'USDT',
      amount: '100',
      destination: { toAddress: 'addr' },
      idempotencyKey: 'same-key',
    };
    await service.createWithdrawal(params);
    await service.createWithdrawal(params);

    expect(adapter.createOrder).toHaveBeenCalledTimes(1);
    const { account } = await wallet.getOrCreateWalletAccount(db, 1n, 'USDT');
    expect(account.availableMinor).toBe(400_000_000n); // debited only once
  });
});

describe('WithdrawalsService.resolveAmbiguousWithdrawal', () => {
  it('SUCCEEDED: settles the hold after the fact (ledger DEBIT posted now)', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const wallet = new WalletService(db, ledger);
    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('500', 6), 999n);

    const ambiguousError = Object.assign(new Error('timeout'), { ambiguousOutcome: true });
    const adapter = { createOrder: jest.fn().mockRejectedValue(ambiguousError) };
    const service = buildService(db, adapter);

    const receipt = await service.createWithdrawal({
      userPublicId: 'pub-1',
      providerCode: 'shamcash',
      assetCode: 'USDT',
      amount: '100',
      destination: { toAddress: 'addr' },
      idempotencyKey: 'k1',
    });

    await service.resolveAmbiguousWithdrawal(receipt.transactionId, 'SUCCEEDED', 'confirmed-by-operator');

    const { account } = await wallet.getOrCreateWalletAccount(db, 1n, 'USDT');
    expect(account.heldMinor).toBe(0n);
    expect(account.availableMinor).toBe(400_000_000n);
  });

  it('FAILED: releases the hold back to available', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const wallet = new WalletService(db, ledger);
    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('500', 6), 999n);

    const ambiguousError = Object.assign(new Error('timeout'), { ambiguousOutcome: true });
    const adapter = { createOrder: jest.fn().mockRejectedValue(ambiguousError) };
    const service = buildService(db, adapter);

    const receipt = await service.createWithdrawal({
      userPublicId: 'pub-1',
      providerCode: 'shamcash',
      assetCode: 'USDT',
      amount: '100',
      destination: { toAddress: 'addr' },
      idempotencyKey: 'k1',
    });

    await service.resolveAmbiguousWithdrawal(receipt.transactionId, 'FAILED');

    const { account } = await wallet.getOrCreateWalletAccount(db, 1n, 'USDT');
    expect(account.heldMinor).toBe(0n);
    expect(account.availableMinor).toBe(500_000_000n); // back to full — as if nothing happened
  });
});
