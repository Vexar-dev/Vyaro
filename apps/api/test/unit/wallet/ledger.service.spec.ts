import { ConflictException } from '@nestjs/common';
import { LedgerService } from '../../../src/modules/ledger/ledger.service';

/**
 * A minimal in-memory fake of the two tables LedgerService touches, good enough
 * to prove the balance arithmetic and locking-order logic without a real MySQL
 * instance. `$queryRaw` is faked to return the row's current balance, exactly
 * like `SELECT ... FOR UPDATE` would inside a real transaction.
 */
function makeFakeDb() {
  const ledgerAccounts = new Map<string, { id: bigint; balanceMinor: bigint }>();
  const entries: any[] = [];
  let nextId = 1n;

  return {
    ledgerAccount: {
      findFirst: jest.fn(async ({ where }: any) => {
        const key = `${where.ownerType}:${where.ownerId}:${where.assetId}`;
        return ledgerAccounts.get(key) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const key = `${data.ownerType}:${data.ownerId}:${data.assetId}`;
        const row = { id: nextId++, balanceMinor: 0n, ...data };
        ledgerAccounts.set(key, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        for (const row of ledgerAccounts.values()) {
          if (row.id === where.id) {
            row.balanceMinor = data.balanceMinor;
            return row;
          }
        }
        throw new Error('not found');
      }),
    },
    ledgerEntry: {
      create: jest.fn(async ({ data }: any) => {
        const entry = { id: BigInt(entries.length + 1), ...data };
        entries.push(entry);
        return entry;
      }),
    },
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
      const id = values[0];
      for (const row of ledgerAccounts.values()) {
        if (row.id === id) return [{ id: row.id, balance_minor: row.balanceMinor }];
      }
      return [];
    }),
    _entries: entries,
    _ledgerAccounts: ledgerAccounts,
  } as any;
}

describe('LedgerService.postEntry', () => {
  it('credits increase the balance and record the correct balance_after', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const account = await ledger.getOrCreateLedgerAccount(db, 'USER', 1n, 10n);

    const entry = await ledger.postEntry(db, {
      ledgerAccountId: account.id,
      transactionId: 100n,
      direction: 'CREDIT',
      amountMinor: 5000n,
    });

    expect(entry.balanceAfter).toBe(5000n);
    expect(db._ledgerAccounts.get('USER:1:10').balanceMinor).toBe(5000n);
  });

  it('debits decrease the balance correctly after a prior credit', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const account = await ledger.getOrCreateLedgerAccount(db, 'USER', 1n, 10n);

    await ledger.postEntry(db, {
      ledgerAccountId: account.id,
      transactionId: 100n,
      direction: 'CREDIT',
      amountMinor: 5000n,
    });
    const debitEntry = await ledger.postEntry(db, {
      ledgerAccountId: account.id,
      transactionId: 101n,
      direction: 'DEBIT',
      amountMinor: 2000n,
    });

    expect(debitEntry.balanceAfter).toBe(3000n);
  });

  it('refuses a debit that would take the balance negative', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const account = await ledger.getOrCreateLedgerAccount(db, 'USER', 1n, 10n);

    await ledger.postEntry(db, {
      ledgerAccountId: account.id,
      transactionId: 100n,
      direction: 'CREDIT',
      amountMinor: 1000n,
    });

    await expect(
      ledger.postEntry(db, {
        ledgerAccountId: account.id,
        transactionId: 101n,
        direction: 'DEBIT',
        amountMinor: 5000n,
      }),
    ).rejects.toThrow(ConflictException);

    // balance must be unchanged after the rejected debit
    expect(db._ledgerAccounts.get('USER:1:10').balanceMinor).toBe(1000n);
  });

  it('postPair posts a balanced debit+credit between two accounts (double-entry invariant)', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const senderAccount = await ledger.getOrCreateLedgerAccount(db, 'USER', 1n, 10n);
    const recipientAccount = await ledger.getOrCreateLedgerAccount(db, 'USER', 2n, 10n);

    // fund the sender first
    await ledger.postEntry(db, {
      ledgerAccountId: senderAccount.id,
      transactionId: 100n,
      direction: 'CREDIT',
      amountMinor: 10000n,
    });

    await ledger.postPair(db, {
      transactionId: 200n,
      debitLedgerAccountId: senderAccount.id,
      creditLedgerAccountId: recipientAccount.id,
      amountMinor: 4000n,
    });

    expect(db._ledgerAccounts.get('USER:1:10').balanceMinor).toBe(6000n);
    expect(db._ledgerAccounts.get('USER:2:10').balanceMinor).toBe(4000n);
    // the sum across both sides of every posted pair is conserved — nothing was created or destroyed
    const totalAfter =
      db._ledgerAccounts.get('USER:1:10').balanceMinor + db._ledgerAccounts.get('USER:2:10').balanceMinor;
    expect(totalAfter).toBe(10000n);
  });
});
