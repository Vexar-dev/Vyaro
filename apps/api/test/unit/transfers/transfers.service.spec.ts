import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TransfersService } from '../../../src/modules/transfers/transfers.service';
import { WalletService } from '../../../src/modules/wallet/wallet.service';
import { LedgerService } from '../../../src/modules/ledger/ledger.service';
import { TransactionsService } from '../../../src/modules/transactions/transactions.service';
import { Money } from '../../../src/common/money/money';

/**
 * A fake Prisma-shaped db, in the same spirit as wallet.service.spec.ts's
 * makeFakeDb() — but extended with users/assets/transactions/events so that
 * TransfersService can be exercised end-to-end against the REAL
 * WalletService + LedgerService + TransactionsService implementations,
 * which is what actually matters here: the composition, not each unit alone.
 *
 * `$transaction` just invokes the callback with the same fake db — no real
 * isolation is needed to test the business logic and idempotency behaviour.
 */
function makeFakeDb() {
  const users = new Map<bigint, any>();
  const assets = new Map<string, any>();
  const wallets = new Map<bigint, any>();
  const walletAccounts = new Map<bigint, any>();
  const ledgerAccounts = new Map<string, any>();
  const ledgerAccountsById = new Map<bigint, any>();
  const transactions = new Map<bigint, any>();
  const transactionsByKey = new Map<string, any>();
  const transactionEvents: any[] = [];

  let nextWalletId = 1n;
  let nextAccountId = 1n;
  let nextLedgerId = 1n;
  let nextTxId = 1n;
  let nextEventId = 1n;
  let nextEntryId = 1n;

  assets.set('USDT', { id: 10n, code: 'USDT', decimals: 6, isActive: true });
  const assetsById = new Map<bigint, any>([[10n, assets.get('USDT')]]);
  const ledgerEntries: any[] = [];

  function seedUser(id: bigint, username: string, status = 'ACTIVE') {
    const user = { id, publicId: `pub-${id}`, username, usernameLower: username.toLowerCase(), status };
    users.set(id, user);
    return user;
  }

  const db: any = {
    _seedUser: seedUser,
    _walletAccounts: walletAccounts,

    user: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id !== undefined) return users.get(where.id) ?? null;
        if (where.publicId !== undefined) return [...users.values()].find((u) => u.publicId === where.publicId) ?? null;
        if (where.usernameLower !== undefined)
          return [...users.values()].find((u) => u.usernameLower === where.usernameLower) ?? null;
        return null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const found = users.get(where.id);
        if (!found) throw new Error('user not found');
        return found;
      }),
    },
    asset: { findUnique: jest.fn(async ({ where }: any) => assets.get(where.code) ?? null) },
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
        if (!a) throw new Error('not found');
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
        if (!row) throw new Error('not found');
        row.balanceMinor = data.balanceMinor;
        return row;
      }),
    },
    ledgerEntry: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextEntryId++, createdAt: new Date(), ...data };
        ledgerEntries.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where, orderBy, take }: any) => {
        const ownerId = where.ledgerAccount.ownerId;
        const ownerType = where.ledgerAccount.ownerType;
        const wantedTxType = where.transaction?.type;
        let rows = ledgerEntries.filter((e) => {
          const la = ledgerAccountsById.get(e.ledgerAccountId);
          if (!la || la.ownerType !== ownerType || la.ownerId !== ownerId) return false;
          const tx = transactions.get(e.transactionId);
          if (wantedTxType !== undefined && tx?.type !== wantedTxType) return false;
          return true;
        });
        if (orderBy?.createdAt === 'desc') rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (take) rows = rows.slice(0, take);
        return rows.map((e) => {
          const la = ledgerAccountsById.get(e.ledgerAccountId);
          return { ...e, transaction: transactions.get(e.transactionId), ledgerAccount: { ...la, asset: assetsById.get(la.assetId) } };
        });
      }),
    },
    transaction: {
      create: jest.fn(async ({ data }: any) => {
        if (transactionsByKey.has(data.idempotencyKey)) {
          // Real Prisma error class (not a hand-rolled stub) — this is EXACTLY what
          // TransactionsService.createIdempotent's catch block checks for
          // (`err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'`)
          // when a unique-constraint violation on transactions.idempotency_key happens.
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the constraint: `idempotency_key`', {
            code: 'P2002',
            clientVersion: '5.19.0',
          });
        }
        const tx = {
          id: nextTxId++,
          publicId: `txpub-${nextTxId}`,
          status: 'PENDING',
          type: data.type,
          idempotencyKey: data.idempotencyKey,
          referenceId: data.referenceId,
          initiatedBy: data.initiatedBy,
          createdAt: new Date(),
        };
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
        const found = transactions.get(where.id);
        if (!found) throw new Error('transaction not found');
        return found;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const tx = transactions.get(where.id);
        if (!tx) throw new Error('not found');
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
      findFirst: jest.fn(async ({ where }: any) => {
        const matches = transactionEvents
          .filter((e) => e.transactionId === where.transactionId && e.eventType === where.eventType)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        return matches[0] ?? null;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        const ids: bigint[] = where.transactionId.in;
        return transactionEvents.filter((e) => ids.includes(e.transactionId) && e.eventType === where.eventType);
      }),
    },
    $queryRaw: jest.fn(async (_strings: TemplateStringsArray, ...values: any[]) => {
      const id = values[0];
      const wa = walletAccounts.get(id);
      if (wa) return [{ id: wa.id, wallet_id: wa.walletId, asset_id: wa.assetId, available_minor: wa.availableMinor, held_minor: wa.heldMinor }];
      const la = ledgerAccountsById.get(id);
      if (la) return [{ id: la.id, balance_minor: la.balanceMinor }];
      return [];
    }),
    $transaction: jest.fn(async (fn: any) => fn(db)),
  };

  return db;
}

function buildServices(db: any) {
  const ledger = new LedgerService();
  const wallet = new WalletService(db, ledger);
  const transactions = new TransactionsService();
  const transfers = new TransfersService(db, wallet, transactions);
  return { transfers, wallet };
}

describe('TransfersService — internal @username transfers (Phase 4)', () => {
  it('moves funds atomically: sender -amount, recipient +amount, status COMPLETED', async () => {
    const db = makeFakeDb();
    db._seedUser(1n, 'ahmad');
    db._seedUser(2n, 'mohammad');
    const { transfers, wallet } = buildServices(db);

    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('500', 6), 999n);

    const receipt = await transfers.createTransfer({
      senderPublicId: 'pub-1',
      toUsername: 'mohammad',
      assetCode: 'USDT',
      amount: '100',
      idempotencyKey: 'req-1',
    });

    expect(receipt.status).toBe('COMPLETED');
    expect(receipt.replay).toBe(false);

    const senderAccount = await wallet.getOrCreateWalletAccount(db, 1n, 'USDT');
    const recipientAccount = await wallet.getOrCreateWalletAccount(db, 2n, 'USDT');
    expect(senderAccount.account.availableMinor).toBe(400_000_000n); // 500 - 100
    expect(recipientAccount.account.availableMinor).toBe(100_000_000n);
  });

  it('a retry with the same idempotency key replays the same result instead of moving money twice', async () => {
    const db = makeFakeDb();
    db._seedUser(1n, 'ahmad');
    db._seedUser(2n, 'mohammad');
    const { transfers, wallet } = buildServices(db);

    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('500', 6), 999n);

    const first = await transfers.createTransfer({
      senderPublicId: 'pub-1',
      toUsername: 'mohammad',
      assetCode: 'USDT',
      amount: '100',
      idempotencyKey: 'same-key',
    });
    const second = await transfers.createTransfer({
      senderPublicId: 'pub-1',
      toUsername: 'mohammad',
      assetCode: 'USDT',
      amount: '100',
      idempotencyKey: 'same-key',
    });

    expect(first.replay).toBe(false);
    expect(second.replay).toBe(true);
    expect(second.transactionId).toBe(first.transactionId);

    const { account } = await wallet.getOrCreateWalletAccount(db, 1n, 'USDT');
    expect(account.availableMinor).toBe(400_000_000n); // only debited ONCE, not twice
  });

  it('rejects sending to yourself', async () => {
    const db = makeFakeDb();
    db._seedUser(1n, 'ahmad');
    const { transfers } = buildServices(db);

    await expect(
      transfers.createTransfer({
        senderPublicId: 'pub-1',
        toUsername: 'ahmad',
        assetCode: 'USDT',
        amount: '10',
        idempotencyKey: 'k1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an unknown recipient username', async () => {
    const db = makeFakeDb();
    db._seedUser(1n, 'ahmad');
    const { transfers } = buildServices(db);

    await expect(
      transfers.createTransfer({
        senderPublicId: 'pub-1',
        toUsername: 'nobody',
        assetCode: 'USDT',
        amount: '10',
        idempotencyKey: 'k1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a transfer that would overdraw the sender (INSUFFICIENT_BALANCE), rolling back cleanly', async () => {
    const db = makeFakeDb();
    db._seedUser(1n, 'ahmad');
    db._seedUser(2n, 'mohammad');
    const { transfers, wallet } = buildServices(db);

    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('10', 6), 999n);

    await expect(
      transfers.createTransfer({
        senderPublicId: 'pub-1',
        toUsername: 'mohammad',
        assetCode: 'USDT',
        amount: '100',
        idempotencyKey: 'k1',
      }),
    ).rejects.toThrow();

    const { account } = await wallet.getOrCreateWalletAccount(db, 1n, 'USDT');
    expect(account.availableMinor).toBe(10_000_000n); // untouched
  });

  it('rejects a transfer from a frozen sender', async () => {
    const db = makeFakeDb();
    db._seedUser(1n, 'ahmad', 'FROZEN');
    db._seedUser(2n, 'mohammad');
    const { transfers, wallet } = buildServices(db);

    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('100', 6), 999n);

    await expect(
      transfers.createTransfer({
        senderPublicId: 'pub-1',
        toUsername: 'mohammad',
        assetCode: 'USDT',
        amount: '10',
        idempotencyKey: 'k1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a transfer to a banned recipient', async () => {
    const db = makeFakeDb();
    db._seedUser(1n, 'ahmad');
    db._seedUser(2n, 'mohammad', 'BANNED');
    const { transfers, wallet } = buildServices(db);

    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('100', 6), 999n);

    await expect(
      transfers.createTransfer({
        senderPublicId: 'pub-1',
        toUsername: 'mohammad',
        assetCode: 'USDT',
        amount: '10',
        idempotencyKey: 'k1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lists the transfer from both the sender and recipient side, with correct direction', async () => {
    const db = makeFakeDb();
    db._seedUser(1n, 'ahmad');
    db._seedUser(2n, 'mohammad');
    const { transfers, wallet } = buildServices(db);

    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('500', 6), 999n);
    await transfers.createTransfer({
      senderPublicId: 'pub-1',
      toUsername: 'mohammad',
      assetCode: 'USDT',
      amount: '100',
      idempotencyKey: 'k1',
    });

    const senderList = await transfers.listMyTransfers('pub-1');
    expect(senderList).toHaveLength(1);
    expect(senderList[0].direction).toBe('SENT');
    expect(senderList[0].counterpartyUsername).toBe('mohammad');
    expect(senderList[0].amount).toBe('100');

    const recipientList = await transfers.listMyTransfers('pub-2');
    expect(recipientList).toHaveLength(1);
    expect(recipientList[0].direction).toBe('RECEIVED');
    expect(recipientList[0].counterpartyUsername).toBe('ahmad');
  });
});
