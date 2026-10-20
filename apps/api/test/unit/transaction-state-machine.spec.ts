import { assertValidTransition, InvalidTransitionError } from '../../src/modules/transactions/transaction-state-machine';

describe('Transaction state machine', () => {
  it('allows the normal happy path: PENDING -> PROCESSING -> COMPLETED', () => {
    expect(() => assertValidTransition('PENDING', 'PROCESSING')).not.toThrow();
    expect(() => assertValidTransition('PROCESSING', 'COMPLETED')).not.toThrow();
  });

  it('allows the failure + refund path', () => {
    expect(() => assertValidTransition('PROCESSING', 'FAILED')).not.toThrow();
    expect(() => assertValidTransition('FAILED', 'REFUNDING')).not.toThrow();
    expect(() => assertValidTransition('REFUNDING', 'REFUNDED')).not.toThrow();
  });

  it('allows cancelling only from PENDING', () => {
    expect(() => assertValidTransition('PENDING', 'CANCELLED')).not.toThrow();
    expect(() => assertValidTransition('PROCESSING', 'CANCELLED')).toThrow(InvalidTransitionError);
  });

  it('rejects skipping straight from PENDING to COMPLETED', () => {
    expect(() => assertValidTransition('PENDING', 'COMPLETED')).toThrow(InvalidTransitionError);
  });

  it('rejects any transition out of a terminal state (CANCELLED, REFUNDED)', () => {
    expect(() => assertValidTransition('CANCELLED', 'PROCESSING')).toThrow(InvalidTransitionError);
    expect(() => assertValidTransition('REFUNDED', 'COMPLETED')).toThrow(InvalidTransitionError);
  });

  it('rejects going backwards (COMPLETED -> PROCESSING)', () => {
    expect(() => assertValidTransition('COMPLETED', 'PROCESSING')).toThrow(InvalidTransitionError);
  });
});
