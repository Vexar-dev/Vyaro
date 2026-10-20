export type StoreOrderState = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'REFUNDED';

/**
 * The ONLY table of allowed StoreOrder status transitions — separate from
 * transaction-state-machine.ts's TxStatus on purpose (different domain: an
 * order's fulfillment status vs. its underlying payment's status, which can
 * diverge — e.g. payment COMPLETED but the provider still failed to deliver).
 */
const ALLOWED_TRANSITIONS: Record<StoreOrderState, StoreOrderState[]> = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: ['REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export class InvalidStoreOrderTransitionError extends Error {
  constructor(from: StoreOrderState, to: StoreOrderState) {
    super(`Invalid store order state transition: ${from} -> ${to}`);
    this.name = 'InvalidStoreOrderTransitionError';
  }
}

export function assertValidStoreOrderTransition(from: StoreOrderState, to: StoreOrderState): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new InvalidStoreOrderTransitionError(from, to);
  }
}
