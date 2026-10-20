/**
 * TsaApiError — a CONFIRMED rejection from tsa-api.com (400/401/403/404/405/429,
 * or any clean non-2xx with a parseable {success:false, error} body). The
 * operation definitely did NOT happen. Safe to fix the request and retry.
 */
export class TsaApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly tsaError?: string,
  ) {
    super(message);
    this.name = 'TsaApiError';
  }
}

/**
 * TsaAmbiguousOutcomeError — thrown ONLY for money-moving calls (transfer,
 * transfer_cash, mobile_recharge) when we could not confirm what actually
 * happened on TSA's side: a network failure, a timeout, or any 5xx/non-JSON
 * response. TSA's transfer endpoints accept NO client-supplied idempotency
 * key (see docs/05_APIS_AND_PROVIDERS.txt) — there is no safe way to "just
 * retry" here.
 *
 * ANY caller that catches this MUST reconcile via find_tx/history using its
 * own reference (amount, recipient, approximate timestamp) BEFORE deciding
 * whether to resubmit. Never resubmit blindly on this error.
 */
export class TsaAmbiguousOutcomeError extends TsaApiError {
  /** Duck-typed marker — see isAmbiguousOutcomeError() in provider-adapter.interface.ts. */
  readonly ambiguousOutcome = true as const;

  constructor(message: string, httpStatus: number, tsaError?: string) {
    super(message, httpStatus, tsaError);
    this.name = 'TsaAmbiguousOutcomeError';
  }
}
