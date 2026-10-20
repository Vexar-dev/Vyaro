export type TxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDING'
  | 'REFUNDED';

/**
 * The ONLY table of allowed transitions. TransactionsService.transitionTo() is the
 * ONLY place permitted to change a transaction's status, and it consults this map
 * before ever writing a new status — no other module may set `transactions.status`
 * directly (there is deliberately no public setter for it anywhere else).
 */
const ALLOWED_TRANSITIONS: Record<TxStatus, TxStatus[]> = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: ['REFUNDING'],
  FAILED: ['REFUNDING'],
  CANCELLED: [],
  REFUNDING: ['REFUNDED'],
  REFUNDED: [],
};

export class InvalidTransitionError extends Error {
  constructor(from: TxStatus, to: TxStatus) {
    super(`Invalid transaction state transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertValidTransition(from: TxStatus, to: TxStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
}
