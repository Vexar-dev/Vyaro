import { TsaApiError, TsaAmbiguousOutcomeError } from './tsa-errors';

const TSA_BASE_URL = 'https://tsa-api.com/api/v1';

/**
 * TsaHttpClient — the ONLY place that talks to tsa-api.com over the network.
 * Both ShamCashAdapter and SyriatelAdapter go through this, since they share
 * the exact same base URL, auth scheme (X-Api-Key header), and error/response
 * shape (see docs/05_APIS_AND_PROVIDERS.txt for the source doc this was built
 * against).
 *
 * Uses the Node/undici global `fetch` — no new HTTP dependency added.
 */
export class TsaHttpClient {
  constructor(private readonly apiKey: string) {}

  async get<T>(query: Record<string, string>): Promise<T> {
    const url = this.buildUrl(query);
    return this.request<T>(url, { method: 'GET' }, false);
  }

  /**
   * `isMoneyMoving` must be true for transfer/transfer_cash/mobile_recharge —
   * it controls whether a network/5xx failure surfaces as
   * TsaAmbiguousOutcomeError (must be reconciled, never blindly retried) or
   * plain TsaApiError (safe to retry).
   */
  async post<T>(query: Record<string, string>, body: Record<string, string>, isMoneyMoving: boolean): Promise<T> {
    const url = this.buildUrl(query);
    return this.request<T>(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString(),
      },
      isMoneyMoving,
    );
  }

  private buildUrl(query: Record<string, string>): string {
    const url = new URL(TSA_BASE_URL);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private async request<T>(url: string, init: RequestInit, isMoneyMoving: boolean): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { ...(init.headers ?? {}), 'X-Api-Key': this.apiKey, Accept: 'application/json' },
      });
    } catch (networkErr) {
      const message = networkErr instanceof Error ? networkErr.message : 'network error';
      if (isMoneyMoving) {
        throw new TsaAmbiguousOutcomeError(`TSA network error (outcome unknown): ${message}`, 0);
      }
      throw new TsaApiError(`TSA network error: ${message}`, 0);
    }

    let json: { success?: boolean; data?: T; error?: string } | undefined;
    try {
      json = (await response.json()) as { success?: boolean; data?: T; error?: string } | undefined;
    } catch {
      if (isMoneyMoving && response.status >= 500) {
        throw new TsaAmbiguousOutcomeError(`TSA returned a non-JSON ${response.status} response (outcome unknown)`, response.status);
      }
      throw new TsaApiError(`TSA returned a non-JSON response (HTTP ${response.status})`, response.status);
    }

    if (response.ok && json?.success) {
      return json.data as T;
    }

    const tsaMessage = typeof json?.error === 'string' ? json.error : `TSA request failed (HTTP ${response.status})`;
    if (isMoneyMoving && response.status >= 500) {
      throw new TsaAmbiguousOutcomeError(tsaMessage, response.status, json?.error);
    }
    throw new TsaApiError(tsaMessage, response.status, json?.error);
  }
}
