import { Injectable } from '@nestjs/common';
import { BalanceCapableProvider, OrderCapableProvider, ProviderOrderResult } from '../../provider-adapter.interface';
import { SecretsService } from '../../../../common/secrets/secrets.service';
import { PrismaService } from '../../../../database/prisma.service';
import { Money } from '../../../../common/money/money';
import { TsaHttpClient } from './tsa-http-client';

interface ShamCashBalanceResponse {
  account_address: string;
  balances: { currency: string; balance: number }[];
}
interface ShamCashTransferResponse {
  tran_id: string;
  amount: number;
  currency: string;
  to_address: string;
  message?: string;
}
interface ShamCashFindTxResponse {
  found: boolean;
  transaction?: { tran_id: string; from_name: string; to_name: string; currency: string; amount: number; datetime: string };
}
interface ShamCashLogsResponse {
  account_address: string;
  log_type: string;
  items: unknown[];
}
interface ShamCashResolveResponse {
  address: string;
  name: string;
  account_number?: string;
}

/**
 * ShamCashAdapter — built against the TSA API documentation (tsa-api.com)
 * provided for this project. DISABLED in `providers` (seed.ts) by default —
 * an operator must store a real `tsa_api_key` + `account_address` via
 * SecretsService and flip the row to ACTIVE before this is ever called for
 * real (ProviderLogService.assertActiveProvider enforces this).
 *
 * CRITICAL — read before wiring this into Phase 8 checkout/withdrawal flows:
 * TSA's `transfer` endpoint accepts NO client-supplied idempotency key. If
 * createOrder() throws TsaAmbiguousOutcomeError (network failure or a TSA
 * 5xx), the transfer MAY HAVE ALREADY SUCCEEDED on Sham Cash's side. The
 * caller MUST reconcile — e.g. checkOrder()/listIncoming() for a matching
 * amount+recipient+timeframe — before ever deciding to resubmit. Blindly
 * retrying risks a real double-send of money. This is the single biggest
 * security risk in this integration and there is no way to eliminate it
 * purely inside this adapter — TSA itself would need to add an idempotency
 * key parameter.
 *
 * Transfers only unlock 24h after an account is linked (per the docs) — TSA
 * itself enforces this, not us; a transfer attempted too early comes back as
 * a normal TsaApiError (400), not an ambiguous one.
 */
@Injectable()
export class ShamCashAdapter implements BalanceCapableProvider, OrderCapableProvider {
  readonly code = 'shamcash';

  constructor(
    private readonly secrets: SecretsService,
    private readonly prisma: PrismaService,
  ) {}

  async getBalance(): Promise<{ assetCode: string; amount: string }[]> {
    const accountAddress = await this.getConfiguredAccountAddress();
    const client = await this.client();
    const data = await client.get<ShamCashBalanceResponse>({
      resource: 'shamcash',
      action: 'balance',
      account_address: accountAddress,
    });
    return data.balances.map((b) => ({ assetCode: b.currency, amount: String(b.balance) }));
  }

  /**
   * Required in `metadata`: toAddress (string). Optional: currency (USD|SYP|EUR,
   * default SYP per TSA), note, pin. `reference` (our own transaction publicId)
   * is NOT sent to TSA — they have no field for it — so it only ever appears in
   * our own provider_logs row for audit/reconciliation.
   *
   * Always call resolveRecipient(toAddress) in the UI BEFORE this, so the user
   * confirms the real recipient name — TSA transfers cannot be reversed once sent.
   */
  async createOrder(params: {
    amountMinor: bigint;
    assetCode: string;
    reference: string;
    metadata?: Record<string, unknown>;
  }): Promise<ProviderOrderResult> {
    const toAddress = params.metadata?.toAddress as string | undefined;
    if (!toAddress) {
      throw new Error('shamcash.createOrder: metadata.toAddress is required');
    }

    const accountAddress = await this.getConfiguredAccountAddress();
    const client = await this.client();
    const decimalAmount = await this.toDecimalAmount(params.amountMinor, params.assetCode);
    const pin = await this.getOptionalPin();

    const data = await client.post<ShamCashTransferResponse>(
      { resource: 'shamcash', action: 'transfer', account_address: accountAddress },
      {
        to_address: toAddress,
        amount: decimalAmount,
        ...(params.metadata?.currency ? { currency: String(params.metadata.currency) } : {}),
        ...(params.metadata?.note ? { note: String(params.metadata.note) } : {}),
        // Operator account PIN (if the TSA account has one) comes from the credential store only.
        ...(pin ? { pin } : {}),
      },
      true, // money-moving — see TsaAmbiguousOutcomeError handling above
    );

    return { providerOrderId: data.tran_id, status: 'COMPLETED', raw: data };
  }

  /** Sham Cash transfers settle synchronously — this re-confirms via find_tx; it never represents a "still pending" state. */
  async checkOrder(providerOrderId: string): Promise<ProviderOrderResult> {
    const accountAddress = await this.getConfiguredAccountAddress();
    const client = await this.client();
    const data = await client.get<ShamCashFindTxResponse>({
      resource: 'shamcash',
      action: 'find_tx',
      tx: providerOrderId,
      account_address: accountAddress,
    });
    return { providerOrderId, status: data.found ? 'COMPLETED' : 'FAILED', raw: data };
  }

  /** Sham Cash has no cancel endpoint — a settled transfer cannot be reversed. This just re-confirms status. */
  async cancelOrder(providerOrderId: string): Promise<ProviderOrderResult> {
    return this.checkOrder(providerOrderId);
  }

  /** Always call before createOrder in any UI flow that lets a user pick a recipient. */
  async resolveRecipient(toAddress: string): Promise<ShamCashResolveResponse> {
    const accountAddress = await this.getConfiguredAccountAddress();
    const client = await this.client();
    return client.get<ShamCashResolveResponse>({
      resource: 'shamcash',
      action: 'resolve',
      account_address: accountAddress,
      to_address: toAddress,
    });
  }

  /** Incoming transfers only (~last 50) — this is what a Phase 6 deposit-detection poller reads. */
  async listIncoming(): Promise<unknown[]> {
    const accountAddress = await this.getConfiguredAccountAddress();
    const client = await this.client();
    const data = await client.get<ShamCashLogsResponse>({
      resource: 'shamcash',
      action: 'logs',
      account_address: accountAddress,
    });
    return data.items;
  }

  private async toDecimalAmount(amountMinor: bigint, assetCode: string): Promise<string> {
    const asset = await this.prisma.asset.findUniqueOrThrow({ where: { code: assetCode } });
    return Money.fromMinorUnits(amountMinor, asset.decimals).toDecimalString();
  }

  private async client(): Promise<TsaHttpClient> {
    const providerId = await this.getProviderId();
    const apiKey = await this.secrets.getCredential(providerId, 'tsa_api_key');
    if (!apiKey) throw new Error('shamcash: no tsa_api_key configured — set it via SecretsService before use');
    return new TsaHttpClient(apiKey);
  }

  private async getProviderId(): Promise<bigint> {
    const provider = await this.prisma.provider.findUniqueOrThrow({ where: { code: this.code } });
    return provider.id;
  }

  private async getOptionalPin(): Promise<string | null> {
    return this.secrets.getCredential(await this.getProviderId(), 'pin');
  }

  private async getConfiguredAccountAddress(): Promise<string> {
    const providerId = await this.getProviderId();
    const address = await this.secrets.getCredential(providerId, 'account_address');
    if (!address) throw new Error('shamcash: no account_address configured — set it via SecretsService before use');
    return address;
  }
}
