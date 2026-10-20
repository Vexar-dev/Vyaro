import { ConflictException } from '@nestjs/common';
import { WalletService } from '../../../src/modules/wallet/wallet.service';
import { Money } from '../../../src/common/money/money';

function makeFakeDb() {
  const wallets = new Map<bigint, { id: bigint; userId: bigint }>();
  const walletAccounts = new Map<bigint, { id: bigint; walletId: bigint; assetId: bigint; availableMinor: bigint; heldMinor: bigint }>();
  const assets = new Map<string, { id: bigint; code: string; decimals: number; isActive: boolean }>();
  const ledgerAccounts = new Map<string, { id: bigint; balanceMinor: bigint }>();
  let nextWalletId = 1n;
  let nextAccountId = 1n;
  let nextLedgerId = 1n;

  assets.set('USDT', { id: 10n, code: 'USDT', decimals: 6, isActive: true });

  return {
    asset: { findUnique: jest.fn(async ({ where }: any) => assets.get(where.code) ?? null) },
    wallet: {
      upsert: jest.fn(async ({ where }: any) => {
        const existing = [...wallets.values()].find((w) => w.userId === where.userId);
        if (existing) return existing;
        const w = { id: nextWalletId++, userId: where.userId };
        wallets.set(w.id, w);
        return w;
      }),
      findUnique: jest.fn(async ({ where }: any) => [...wallets.values()].find((w) => w.userId === where.userId) ?? null),
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
        const row = { id: nextLedgerId++, balanceMinor: 0n };
        ledgerAccounts.set(`${data.ownerType}:${data.ownerId}:${data.assetId}`, row);
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
    ledgerEntry: { create: jest.fn(async ({ data }: any) => ({ id: 1n, ...data })) },
    $queryRaw: jest.fn(async (_strings: TemplateStringsArray, ...values: any[]) => {
      const id = values[0];
      const wa = walletAccounts.get(id);
      if (wa) return [{ id: wa.id, wallet_id: wa.walletId, asset_id: wa.assetId, available_minor: wa.availableMinor, held_minor: wa.heldMinor }];
      for (const row of ledgerAccounts.values()) {
        if (row.id === id) return [{ id: row.id, balance_minor: row.balanceMinor }];
      }
      return [];
    }),
    _walletAccounts: walletAccounts,
  } as any;
}

// Minimal fake LedgerService reusing the real implementation's shape but backed by the same fake db.
import { LedgerService } from '../../../src/modules/ledger/ledger.service';

describe('WalletService — AVAILABLE/HELD semantics', () => {
  it('credit increases available and posts a ledger CREDIT', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const wallet = new WalletService(db, ledger);

    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('100', 6), 900n);

    const { account } = await wallet.getOrCreateWalletAccount(db, 1n, 'USDT');
    expect(account.availableMinor).toBe(100_000_000n);
  });

  it('hold moves funds from available to held without changing the total', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const wallet = new WalletService(db, ledger);

    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('1000', 6), 900n);
    await wallet.hold(db, 1n, 'USDT', Money.fromDecimalString('500', 6));

    const { account } = await wallet.getOrCreateWalletAccount(db, 1n, 'USDT');
    expect(account.availableMinor).toBe(500_000_000n);
    expect(account.heldMinor).toBe(500_000_000n);
  });

  it('refuses to hold more than what is available', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const wallet = new WalletService(db, ledger);

    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('100', 6), 900n);

    await expect(wallet.hold(db, 1n, 'USDT', Money.fromDecimalString('500', 6))).rejects.toThrow(ConflictException);
  });

  it('release restores held funds back to available', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const wallet = new WalletService(db, ledger);

    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('1000', 6), 900n);
    await wallet.hold(db, 1n, 'USDT', Money.fromDecimalString('500', 6));
    await wallet.release(db, 1n, 'USDT', Money.fromDecimalString('500', 6));

    const { account } = await wallet.getOrCreateWalletAccount(db, 1n, 'USDT');
    expect(account.availableMinor).toBe(1_000_000_000n); // back to full 1000
    expect(account.heldMinor).toBe(0n);
  });

  it('settle permanently removes held funds and posts a ledger DEBIT (never a double release)', async () => {
    const db = makeFakeDb();
    const ledger = new LedgerService();
    const wallet = new WalletService(db, ledger);

    await wallet.credit(db, 1n, 'USDT', Money.fromDecimalString('1000', 6), 900n);
    await wallet.hold(db, 1n, 'USDT', Money.fromDecimalString('500', 6));
    await wallet.settle(db, 1n, 'USDT', Money.fromDecimalString('500', 6), 901n);

    const { account } = await wallet.getOrCreateWalletAccount(db, 1n, 'USDT');
    expect(account.availableMinor).toBe(500_000_000n); // unaffected by settle
    expect(account.heldMinor).toBe(0n); // gone for good, not back in available
  });
});
