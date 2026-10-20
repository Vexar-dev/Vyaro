import { DepositMonitoringService } from '../../../src/modules/deposit-monitoring/deposit-monitoring.service';
import { WalletService } from '../../../src/modules/wallet/wallet.service';
import { LedgerService } from '../../../src/modules/ledger/ledger.service';
import { TransactionsService } from '../../../src/modules/transactions/transactions.service';
import { ProviderLogService } from '../../../src/modules/providers/provider-log.service';
import { Prisma } from '@prisma/client';

function makeFakeDb() {
  const providers = new Map<bigint, any>([[1n, { id: 1n, code: 'tatum', status: 'ACTIVE' }]]);
  const networks = new Map<bigint, any>([
    [
      10n,
      {
        id: 10n,
        code: 'TRC20',
        tatumChainId: 'tron-mainnet',
        requiredConfirmations: 5,
        tokenContractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      },
    ],
  ]);
  const depositAddresses = new Map<bigint, any>([
    [100n, { id: 100n, userId: 7n, networkId: 10n, address: 'TReceiverAddress', tatumSubscriptionId: null }],
  ]);
  const depositEvents = new Map<bigint, any>();
  const webhookEvents = new Map<string, any>();
  const assets = new Map<string, any>([['USDT', { id: 1n, code: 'USDT', decimals: 6, isActive: true }]]);
  const wallets = new Map<bigint, any>();
  const walletAccounts = new Map<bigint, any>();
  const ledgerAccounts = new Map<string, any>();
  const ledgerAccountsById = new Map<bigint, any>();
  const transactions = new Map<bigint, any>();
  const transactionsByKey = new Map<string, any>();
  const transactionEvents: any[] = [];

  let nextDepositEventId = 1n;
  let nextWalletId = 1n;
  let nextAccountId = 1n;
  let nextLedgerId = 1n;
  let nextTxId = 1n;
  let nextEntryId = 1n;
  let nextEventId = 1n;

  const db: any = {
    _networks: networks,
    _depositEvents: depositEvents,

    provider: {
      findUniqueOrThrow: jest.fn(async ({ where }: any) => providers.get(where.id) ?? [...providers.values()].find((p) => p.code === where.code)),
    },
    network: {
      findUniqueOrThrow: jest.fn(async ({ where }: any) => networks.get(where.id)),
      findFirst: jest.fn(async ({ where }: any) => [...networks.values()].find((n) => n.tatumChainId === where.tatumChainId) ?? null),
    },
    depositAddress: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.address !== undefined) return [...depositAddresses.values()].find((a) => a.address === where.address) ?? null;
        return depositAddresses.get(where.id) ?? null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const found = depositAddresses.get(where.id);
        if (!found) throw new Error('not found');
        return found;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = depositAddresses.get(where.id);
        Object.assign(row, data);
        return row;
      }),
    },
    depositEvent: {
      create: jest.fn(async ({ data }: any) => {
        for (const existing of depositEvents.values()) {
          if (existing.networkId === data.networkId && existing.txHash === data.txHash) {
            throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.19.0' });
          }
        }
        const row = { id: nextDepositEventId++, createdAt: new Date(), updatedAt: new Date(), transactionId: null, ...data };
        depositEvents.set(row.id, row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        [...depositEvents.values()]
          .filter((e) => e.status === where.status)
          .map((e) => ({ ...e, network: networks.get(e.networkId) })),
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const row = depositEvents.get(where.id);
        Object.assign(row, data);
        return row;
      }),
    },
    providerLog: { create: jest.fn(async ({ data }: any) => ({ id: 1n, createdAt: new Date(), ...data })) },
    webhookEvent: {
      create: jest.fn(async ({ data }: any) => {
        const key = `${data.providerId}:${data.eventId}`;
        if (webhookEvents.has(key)) {
          throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.19.0' });
        }
        const row = { id: 1n, createdAt: new Date(), processedAt: null, ...data };
        webhookEvents.set(key, row);
        return row;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const { providerId, eventId } = where.providerId_eventId;
        return webhookEvents.get(`${providerId}:${eventId}`);
      }),
    },
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
      findUnique: jest.fn(async ({ where }: any) => transactionsByKey.get(where.idempotencyKey) ?? null),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => transactions.get(where.id)),
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
    },
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
      // Route by the actual SQL text, not by guessing which table an `id`
      // belongs to — deposit_events, wallet_accounts, and ledger_accounts each
      // have their own independent id sequence in this fake db, so the same
      // numeric id (e.g. 1n) can legitimately exist in more than one table at
      // once. Guessing by id alone previously caused a real bug: a lock query
      // for a ledger_account with id=1n was silently matched against
      // deposit_events' id=1n instead, returning `{status: ...}` with no
      // `balance_minor` — which made LedgerService.postEntry's
      // `BigInt(locked.balance_minor)` throw on `undefined`.
      const sql = strings.join('?');
      const id = values[0];
      if (sql.includes('FROM deposit_events')) {
        const de = depositEvents.get(id);
        return de ? [{ status: de.status }] : [];
      }
      if (sql.includes('FROM wallet_accounts')) {
        const wa = walletAccounts.get(id);
        return wa ? [{ id: wa.id, available_minor: wa.availableMinor }] : [];
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

function buildService(db: any, tatum: any) {
  const ledger = new LedgerService();
  const wallet = new WalletService(db, ledger);
  const transactions = new TransactionsService();
  const providerLogs = new ProviderLogService(db);
  const config = { get: jest.fn() };
  return new DepositMonitoringService(db, tatum, providerLogs, wallet, transactions, config as any);
}

describe('DepositMonitoringService.processWebhook', () => {
  const validPayload = {
    chain: 'tron-mainnet',
    txId: 'tx-1',
    address: 'TReceiverAddress',
    amount: '50',
    type: 'incoming',
    blockNumber: 1000,
  };

  it('records but does NOT act on an invalid signature', async () => {
    const db = makeFakeDb();
    const tatum = { verifyWebhookSignature: jest.fn().mockResolvedValue(false) };
    const service = buildService(db, tatum);

    await service.processWebhook(Buffer.from(JSON.stringify(validPayload)), { 'x-payload-hash': 'bad' });

    expect(db._depositEvents.size).toBe(0);
  });

  it('does not create a DepositEvent for a mempool-only (unconfirmed) notification', async () => {
    const db = makeFakeDb();
    const tatum = { verifyWebhookSignature: jest.fn().mockResolvedValue(true) };
    const service = buildService(db, tatum);

    await service.processWebhook(Buffer.from(JSON.stringify({ ...validPayload, mempool: true })), { 'x-payload-hash': 'ok' });

    expect(db._depositEvents.size).toBe(0);
  });

  it('ignores outgoing-type notifications', async () => {
    const db = makeFakeDb();
    const tatum = { verifyWebhookSignature: jest.fn().mockResolvedValue(true) };
    const service = buildService(db, tatum);

    await service.processWebhook(Buffer.from(JSON.stringify({ ...validPayload, type: 'outgoing' })), { 'x-payload-hash': 'ok' });

    expect(db._depositEvents.size).toBe(0);
  });

  it('creates a PENDING_CONFIRMATION DepositEvent for a valid, confirmed, incoming deposit to a known address', async () => {
    const db = makeFakeDb();
    const tatum = { verifyWebhookSignature: jest.fn().mockResolvedValue(true) };
    const service = buildService(db, tatum);

    await service.processWebhook(Buffer.from(JSON.stringify(validPayload)), { 'x-payload-hash': 'ok' });

    expect(db._depositEvents.size).toBe(1);
    const event = [...db._depositEvents.values()][0];
    expect(event.status).toBe('PENDING_CONFIRMATION');
    expect(event.amount).toBe('50');
  });

  it('is idempotent: the same webhook delivered twice creates only ONE DepositEvent', async () => {
    const db = makeFakeDb();
    const tatum = { verifyWebhookSignature: jest.fn().mockResolvedValue(true) };
    const service = buildService(db, tatum);

    await service.processWebhook(Buffer.from(JSON.stringify(validPayload)), { 'x-payload-hash': 'ok' });
    await service.processWebhook(Buffer.from(JSON.stringify(validPayload)), { 'x-payload-hash': 'ok' });

    expect(db._depositEvents.size).toBe(1);
  });

  it('ignores a deposit to an address this system does not recognize', async () => {
    const db = makeFakeDb();
    const tatum = { verifyWebhookSignature: jest.fn().mockResolvedValue(true) };
    const service = buildService(db, tatum);

    await service.processWebhook(
      Buffer.from(JSON.stringify({ ...validPayload, address: 'TSomeoneElsesAddress' })),
      { 'x-payload-hash': 'ok' },
    );

    expect(db._depositEvents.size).toBe(0);
  });
});

describe('DepositMonitoringService.checkPendingConfirmations', () => {
  it("does NOT credit a deposit below its network's required confirmations", async () => {
    const db = makeFakeDb();
    db._depositEvents.set(1n, {
      id: 1n,
      depositAddressId: 100n,
      networkId: 10n,
      txHash: 'tx-1',
      amount: '50',
      blockNumber: 998n, // network requires 5 confirmations; current height 1000 → only 3
      status: 'PENDING_CONFIRMATION',
    });
    const tatum = { getCurrentBlockHeight: jest.fn().mockResolvedValue(1000) };
    const service = buildService(db, tatum);

    await service.checkPendingConfirmations();

    expect(db._depositEvents.get(1n).status).toBe('PENDING_CONFIRMATION');
    const { account } = await new WalletService(db, new LedgerService()).getOrCreateWalletAccount(db, 7n, 'USDT');
    expect(account.availableMinor).toBe(0n);
  });

  it('credits a deposit that has reached the required confirmations, exactly once', async () => {
    const db = makeFakeDb();
    db._depositEvents.set(1n, {
      id: 1n,
      depositAddressId: 100n,
      networkId: 10n,
      txHash: 'tx-1',
      amount: '50',
      blockNumber: 996n, // 1000 - 996 + 1 = 5 confirmations — meets the threshold of 5
      status: 'PENDING_CONFIRMATION',
    });
    const tatum = { getCurrentBlockHeight: jest.fn().mockResolvedValue(1000) };
    const service = buildService(db, tatum);

    await service.checkPendingConfirmations();

    expect(db._depositEvents.get(1n).status).toBe('CREDITED');
    const { account } = await new WalletService(db, new LedgerService()).getOrCreateWalletAccount(db, 7n, 'USDT');
    expect(account.availableMinor).toBe(50_000_000n); // 50 USDT at 6 decimals

    // Running the check again must NOT credit a second time.
    await service.checkPendingConfirmations();
    const { account: accountAfter } = await new WalletService(db, new LedgerService()).getOrCreateWalletAccount(db, 7n, 'USDT');
    expect(accountAfter.availableMinor).toBe(50_000_000n);
  });
});
