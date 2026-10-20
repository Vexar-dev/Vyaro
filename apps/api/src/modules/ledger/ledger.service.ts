import { ConflictException, Injectable } from '@nestjs/common';
import { LedgerDirection, LedgerOwnerType } from '@prisma/client';
import type { Db } from '../../database/db.type';

/**
 * LedgerService — the ONLY module in the codebase permitted to write
 * `ledger_accounts.balance_minor` or insert into `ledger_entries`. Every other
 * module (Wallet, Transfers, Orders, ...) must go through `postEntry`/`postPair`
 * instead of touching these tables directly — that invariant is what keeps the
 * double-entry ledger trustworthy as the system grows.
 *
 * Every method here MUST be called with a `db` that is the `tx` client from an
 * enclosing `prisma.$transaction(async (tx) => ...)` — never with the bare
 * PrismaService — because a debit and its matching credit(s) must commit or
 * roll back together. Callers (e.g. WalletService) are responsible for opening
 * that transaction.
 */
@Injectable()
export class LedgerService {
  /** Finds or creates the ledger_account for a given owner+asset. Safe to call repeatedly. */
  async getOrCreateLedgerAccount(
    db: Db,
    ownerType: LedgerOwnerType,
    ownerId: bigint | null,
    assetId: bigint,
  ) {
    const existing = await db.ledgerAccount.findFirst({ where: { ownerType, ownerId, assetId } });
    if (existing) return existing;
    return db.ledgerAccount.create({ data: { ownerType, ownerId, assetId } });
  }

  /**
   * Posts ONE entry against a ledger account under a row lock, so concurrent
   * postings against the same account (e.g. two transfers touching the same
   * recipient at once) serialize instead of racing on balance_after.
   * Throws ConflictException if a DEBIT would take the account negative —
   * callers must catch this and fail/roll back the whole transaction.
   */
  async postEntry(
    db: Db,
    params: {
      ledgerAccountId: bigint;
      transactionId: bigint;
      direction: LedgerDirection;
      amountMinor: bigint;
      /** ONLY for SYSTEM counter-accounts (they mirror the outside world and may go negative). Never for user accounts. */
      allowNegative?: boolean;
    },
  ) {
    if (params.amountMinor <= 0n) {
      throw new Error('LedgerService.postEntry: amountMinor must be positive; sign is carried by `direction`');
    }

    // SELECT ... FOR UPDATE via Prisma's raw query — this is the row lock that
    // prevents two concurrent postings from both reading the same starting
    // balance and computing an inconsistent balance_after.
    const [locked] = await db.$queryRaw<Array<{ id: bigint; balance_minor: bigint }>>`
      SELECT id, balance_minor FROM ledger_accounts WHERE id = ${params.ledgerAccountId} FOR UPDATE
    `;
    if (!locked) throw new Error(`LedgerService.postEntry: ledger_account ${params.ledgerAccountId} not found`);

    const currentBalance = BigInt(locked.balance_minor);
    const delta = params.direction === 'CREDIT' ? params.amountMinor : -params.amountMinor;
    const newBalance = currentBalance + delta;

    if (newBalance < 0n && !params.allowNegative) {
      throw new ConflictException({
        code: 'INSUFFICIENT_BALANCE',
        message: 'الرصيد غير كافٍ لإتمام العملية',
      });
    }

    await db.ledgerAccount.update({
      where: { id: params.ledgerAccountId },
      data: { balanceMinor: newBalance },
    });

    return db.ledgerEntry.create({
      data: {
        ledgerAccountId: params.ledgerAccountId,
        transactionId: params.transactionId,
        direction: params.direction,
        amountMinor: params.amountMinor,
        balanceAfter: newBalance,
      },
    });
  }

  /**
   * Convenience for the common case: one DEBIT and one CREDIT of the same amount
   * between two ledger accounts, under the same transaction — e.g. a user-to-user
   * transfer or a fee sweep into the fee pool. Order matters for deadlock
   * avoidance: callers should always lock/post in a stable order (e.g. by
   * ledgerAccountId ascending) when two USER accounts are both involved.
   */
  async postPair(
    db: Db,
    params: {
      transactionId: bigint;
      debitLedgerAccountId: bigint;
      creditLedgerAccountId: bigint;
      amountMinor: bigint;
    },
  ) {
    const debitEntry = await this.postEntry(db, {
      ledgerAccountId: params.debitLedgerAccountId,
      transactionId: params.transactionId,
      direction: 'DEBIT',
      amountMinor: params.amountMinor,
    });
    const creditEntry = await this.postEntry(db, {
      ledgerAccountId: params.creditLedgerAccountId,
      transactionId: params.transactionId,
      direction: 'CREDIT',
      amountMinor: params.amountMinor,
    });
    return { debitEntry, creditEntry };
  }
}
