import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import type { Db } from '../../database/db.type';
import { assertValidTransition, TxStatus } from './transaction-state-machine';

const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  // Deliberately stateless — every method takes `db: Db` explicitly so callers can
  // pass either the top-level PrismaService or a `tx` client from an enclosing
  // `$transaction`, keeping transaction boundaries owned by the caller, not here.

  /**
   * Creates a transaction row keyed by `idempotencyKey`. If a transaction with the
   * same key already exists (unique constraint on transactions.idempotency_key —
   * enforced at the DATABASE level, not just checked-then-inserted in application
   * code, which would itself be a race condition), this returns the EXISTING row
   * instead of throwing — that's what makes a repeated request/webhook a no-op
   * instead of a duplicate financial operation.
   */
  async createIdempotent(
    db: Db,
    params: { type: TransactionType; idempotencyKey: string; referenceId?: string; initiatedBy?: bigint },
  ) {
    try {
      const tx = await db.transaction.create({
        data: {
          type: params.type,
          idempotencyKey: params.idempotencyKey,
          referenceId: params.referenceId,
          initiatedBy: params.initiatedBy,
        },
      });
      await this.recordEvent(db, tx.id, 'CREATED', { type: params.type });
      return { transaction: tx, wasAlreadyProcessed: false };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION) {
        const existing = await db.transaction.findUnique({ where: { idempotencyKey: params.idempotencyKey } });
        if (existing) {
          this.logger.log(`Idempotent replay for key ${params.idempotencyKey} — returning existing transaction`);
          return { transaction: existing, wasAlreadyProcessed: true };
        }
      }
      throw err;
    }
  }

  /**
   * The ONLY sanctioned way to change transactions.status anywhere in the codebase.
   * Validates the transition against the state machine, writes the new status, and
   * logs a transaction_events row — all inside whichever `db` (transaction-scoped or
   * not) the caller passes in.
   */
  async transitionTo(db: Db, transactionId: bigint, to: TxStatus, payload?: Record<string, unknown>) {
    const current = await db.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    assertValidTransition(current.status as TxStatus, to);

    const updated = await db.transaction.update({
      where: { id: transactionId },
      data: { status: to as TransactionStatus },
    });
    await this.recordEvent(db, transactionId, 'STATUS_CHANGED', { from: current.status, to, ...payload });
    return updated;
  }

  async recordEvent(db: Db, transactionId: bigint, eventType: string, payload?: Record<string, unknown>) {
    await db.transactionEvent.create({
      data: { transactionId, eventType, payloadJson: payload as Prisma.InputJsonValue },
    });
  }
}
