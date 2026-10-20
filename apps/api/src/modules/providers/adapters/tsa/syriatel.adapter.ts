import { Injectable } from '@nestjs/common';
import { BalanceCapableProvider, OrderCapableProvider, ProviderOrderResult } from '../../provider-adapter.interface';
import { SecretsService } from '../../../../common/secrets/secrets.service';
import { PrismaService } from '../../../../database/prisma.service';
import { Money } from '../../../../common/money/money';
import { TsaHttpClient } from './tsa-http-client';

type SyriatelPeriod = '7' | '30' | 'all';

interface SyriatelBalanceResponse {
  gsm: string;
  balance: string;
}
interface SyriatelHistoryResponse {
  gsm: string;
  period: string;
  history_type: string;
  items: unknown[];
}
interface SyriatelFindTxResponse {
  found: boolean;
  transaction?: Record<string, unknown>;
}
interface SyriatelTransferCashResponse {
  source_gsm: string;
  beneficiary_gsm: string;
  amount: string;
  fee: string;
  billcode: string;
  message?: string;
}
interface SyriatelRechargeResponse {
  source_gsm: string;
  target_gsm: string;
  amount: string;
  recharge_amount: string;
  tax: string;
  fee: string;
  bill_code: string;
  message?: string;
}

/**
 * SyriatelAdapter — built against the TSA API documentation (tsa-api.com)
 * provided for this project. DISABLED in `providers` (seed.ts) by default —
 * an operator must store a real `tsa_api_key` + `gsm` via SecretsService and
 * flip the row to ACTIVE before this is ever called for real.
 *
 * Two distinct money-moving actions live behind createOrder(), selected via
 * `metadata.action`:
 *   'transfer_cash'   → peer-to-peer cash transfer (TSA action=transfer_cash)
 *   'mobile_recharge' → mobile top-up, amount is deducted INCLUDING tax/fee
 *                       (TSA action=mobile_recharge)
 *
 * CRITICAL — same as ShamCashAdapter: neither TSA action accepts a client
 * idempotency key. A TsaAmbiguousOutcomeError means the operation MAY have
 * already succeeded — reconcile via checkOrder()/listIncoming() before ever
 * resubmitting. Never retry blindly.
 */
@Injectable()
export class SyriatelAdapter implements BalanceCapableProvider, OrderCapableProvider {
  readonly code = 'syriatel';

  constructor(
    private readonly secrets: SecretsService,
    private readonly prisma: PrismaService,
  ) {}

  async getBalance(): Promise<{ assetCode: string; amount: string }[]> {
    const gsm = await this.getConfiguredGsm();
    const client = await this.client();
    const data = await client.get<SyriatelBalanceResponse>({ resource: 'syriatel', action: 'balance', gsm });
    return [{ assetCode: 'SYP', amount: data.balance }];
  }

  /**
   * Required in `metadata`: action ('transfer_cash' | 'mobile_recharge',
   * default 'transfer_cash'), toGsm (string — set by the server, see WithdrawalsService). The account
   * PIN comes from SecretsService key `pin_code`. For
   * 'mobile_recharge', `amount` is the total deducted from cash balance
   * (TSA's own wording: "شامل الضريبة والعمولة") — not the recharge value
   * credited to the target.
   */
  async createOrder(params: {
    amountMinor: bigint;
    assetCode: string;
    reference: string;
    metadata?: Record<string, unknown>;
  }): Promise<ProviderOrderResult> {
    const action = ((params.metadata?.action as string) ?? 'transfer_cash') as 'transfer_cash' | 'mobile_recharge';
    if (action !== 'transfer_cash' && action !== 'mobile_recharge') {
      throw new Error(`syriatel.createOrder: unsupported metadata.action "${action}"`);
    }
    const toGsm = params.metadata?.toGsm as string | undefined;
    if (!toGsm) {
      throw new Error('syriatel.createOrder: metadata.toGsm is required');
    }
    // The PIN belongs to the OPERATOR's Syriatel Cash account, never to an end user: it is read from the
    // encrypted credential store, and any pinCode in metadata is ignored.
    const pinCode = await this.getConfiguredPin();

    const gsm = await this.getConfiguredGsm();
    const client = await this.client();
    const decimalAmount = await this.toDecimalAmount(params.amountMinor, params.assetCode);

    const data = await client.post<SyriatelTransferCashResponse | SyriatelRechargeResponse>(
      { resource: 'syriatel', action },
      { gsm, to_gsm: toGsm, amount: decimalAmount, pin_code: pinCode },
      true, // money-moving — see TsaAmbiguousOutcomeError handling above
    );

    const providerOrderId = 'billcode' in data ? data.billcode : data.bill_code;
    return { providerOrderId, status: 'COMPLETED', raw: data };
  }

  /** Syriatel actions settle synchronously — this re-confirms via find_tx; it never represents a "still pending" state. */
  async checkOrder(providerOrderId: string): Promise<ProviderOrderResult> {
    const gsm = await this.getConfiguredGsm();
    const client = await this.client();
    const data = await client.get<SyriatelFindTxResponse>({
      resource: 'syriatel',
      action: 'find_tx',
      gsm,
      tx: providerOrderId,
    });
    return { providerOrderId, status: data.found ? 'COMPLETED' : 'FAILED', raw: data };
  }

  /** Syriatel has no cancel endpoint — a settled transaction cannot be reversed. This just re-confirms status. */
  async cancelOrder(providerOrderId: string): Promise<ProviderOrderResult> {
    return this.checkOrder(providerOrderId);
  }

  /** Incoming history only — this is what a Phase 6/7 deposit-detection poller reads. Default period matches TSA's own default (7 days). */
  async listIncoming(period: SyriatelPeriod = '7'): Promise<unknown[]> {
    const gsm = await this.getConfiguredGsm();
    const client = await this.client();
    const data = await client.get<SyriatelHistoryResponse>({ resource: 'syriatel', action: 'history', gsm, period });
    return data.items;
  }

  private async toDecimalAmount(amountMinor: bigint, assetCode: string): Promise<string> {
    const asset = await this.prisma.asset.findUniqueOrThrow({ where: { code: assetCode } });
    return Money.fromMinorUnits(amountMinor, asset.decimals).toDecimalString();
  }

  private async client(): Promise<TsaHttpClient> {
    const providerId = await this.getProviderId();
    const apiKey = await this.secrets.getCredential(providerId, 'tsa_api_key');
    if (!apiKey) throw new Error('syriatel: no tsa_api_key configured — set it via SecretsService before use');
    return new TsaHttpClient(apiKey);
  }

  private async getProviderId(): Promise<bigint> {
    const provider = await this.prisma.provider.findUniqueOrThrow({ where: { code: this.code } });
    return provider.id;
  }

  private async getConfiguredPin(): Promise<string> {
    const providerId = await this.getProviderId();
    const pin = await this.secrets.getCredential(providerId, 'pin_code');
    if (!pin) throw new Error('syriatel: no pin_code configured — set it via SecretsService before use');
    return pin;
  }

  private async getConfiguredGsm(): Promise<string> {
    const providerId = await this.getProviderId();
    const gsm = await this.secrets.getCredential(providerId, 'gsm');
    if (!gsm) throw new Error('syriatel: no gsm configured — set it via SecretsService before use');
    return gsm;
  }
}
