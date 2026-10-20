import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../../../database/prisma.service';
import { SecretsService } from '../../../../common/secrets/secrets.service';

const TATUM_BASE_URL = 'https://api.tatum.io/v4';

export interface TatumSubscriptionParams {
  /** 'INCOMING_FUNGIBLE_TX' for token deposits (BEP20/TRC20 USDT), 'INCOMING_NATIVE_TX' for native-coin deposits (LTC). */
  type: 'INCOMING_FUNGIBLE_TX' | 'INCOMING_NATIVE_TX';
  /** Tatum's own chain identifier — confirmed by live-testing, stored per-network in `networks.tatum_chain_id`. */
  chain: string;
  address: string;
  webhookUrl: string;
  /** Required for INCOMING_FUNGIBLE_TX — the token contract to filter on (e.g. USDT-BEP20/TRC20). */
  contractAddress?: string;
}

/**
 * TatumAdapter — built against Tatum's v4 API, confirmed by:
 *  (a) official docs.tatum.io reference pages (subscription creation, HMAC
 *      signature algorithm), fetched live rather than guessed, and
 *  (b) the operator's own live test call with a real API key, which is what
 *      confirmed the exact `chain` identifiers actually in effect on this
 *      account: "tron-mainnet" (TRON), "litecoin-core-mainnet" (Litecoin),
 *      "bsc-mainnet" (BSC) — see docs/05_APIS_AND_PROVIDERS.txt §7.
 *
 * Deliberately does NOT implement the generic WebhookCapableProvider
 * interface's handleWebhook(): verifying a signature is a pure adapter
 * concern (belongs here), but APPLYING a deposit's effect needs
 * WalletService/TransactionsService, which ProvidersModule intentionally
 * does not depend on — same boundary OrderCapableProvider already respects
 * by not needing Wallet directly. That composition lives in
 * DepositMonitoringService, exactly like TransfersService composes
 * WalletService+LedgerService+TransactionsService outside any single module.
 */
@Injectable()
export class TatumAdapter {
  readonly code = 'tatum';

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
  ) {}

  /**
   * One-time setup: tells Tatum the HMAC secret to sign future webhooks with.
   * This is ACCOUNT-WIDE on Tatum's side (not per-subscription) — call this
   * once, store the SAME secret via SecretsService, and never change one
   * without the other.
   */
  async enableHmac(hmacSecretPlaintext: string): Promise<void> {
    const apiKey = await this.getApiKey();
    const response = await fetch(`${TATUM_BASE_URL}/subscription`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ hmacSecret: hmacSecretPlaintext }),
    });
    if (!response.ok) {
      throw new Error(`Tatum enableHmac failed: HTTP ${response.status} ${await this.safeText(response)}`);
    }
  }

  async createSubscription(params: TatumSubscriptionParams): Promise<string> {
    const apiKey = await this.getApiKey();
    const attr: Record<string, unknown> = { chain: params.chain, address: params.address, url: params.webhookUrl };
    if (params.type === 'INCOMING_FUNGIBLE_TX') {
      if (!params.contractAddress) {
        throw new Error('TatumAdapter.createSubscription: contractAddress is required for INCOMING_FUNGIBLE_TX');
      }
      attr.conditions = [{ field: 'contractAddress', operator: '==', value: params.contractAddress }];
    }

    const response = await fetch(`${TATUM_BASE_URL}/subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ type: params.type, attr }),
    });
    if (!response.ok) {
      throw new Error(`Tatum createSubscription failed: HTTP ${response.status} ${await this.safeText(response)}`);
    }
    const data = (await response.json()) as { id?: string };
    if (!data.id) throw new Error('Tatum createSubscription: response had no subscription id');
    return data.id;
  }

  async deleteSubscription(subscriptionId: string): Promise<void> {
    const apiKey = await this.getApiKey();
    const response = await fetch(`${TATUM_BASE_URL}/subscription/${encodeURIComponent(subscriptionId)}`, {
      method: 'DELETE',
      headers: { 'x-api-key': apiKey },
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Tatum deleteSubscription failed: HTTP ${response.status} ${await this.safeText(response)}`);
    }
  }

  /** `GET /v4/data/blockchains/block/current` — current block height for a chain. */
  async getCurrentBlockHeight(chain: string): Promise<number> {
    const apiKey = await this.getApiKey();
    const response = await fetch(`${TATUM_BASE_URL}/data/blockchains/block/current?chain=${encodeURIComponent(chain)}`, {
      headers: { Accept: 'application/json', 'x-api-key': apiKey },
    });
    if (!response.ok) {
      throw new Error(`Tatum getCurrentBlockHeight failed: HTTP ${response.status} ${await this.safeText(response)}`);
    }
    const data = (await response.json()) as Record<string, unknown>;
    // ⚠️ Exact response field NOT independently confirmed by this codebase —
    // tries the commonly-documented shapes. VERIFY against a real response
    // for each network before trusting this in the confirmation-checker
    // (see docs/05_APIS_AND_PROVIDERS.txt §7).
    const raw = data.result ?? data.blockNumber ?? data.height ?? data.currentBlock;
    const height = typeof raw === 'string' ? parseInt(raw, 10) : (raw as number | undefined);
    if (typeof height !== 'number' || Number.isNaN(height)) {
      throw new Error(`Tatum getCurrentBlockHeight: could not parse block height from response: ${JSON.stringify(data)}`);
    }
    return height;
  }

  /**
   * Verifies a Tatum webhook per their documented algorithm EXACTLY:
   * HMAC-SHA512 over `JSON.stringify(parsedBody)` (not the raw wire bytes),
   * Base64 output, compared against the `x-payload-hash` header.
   */
  async verifyWebhookSignature(rawBody: Buffer | string, headers: Record<string, string | string[] | undefined>): Promise<boolean> {
    const providedHashRaw = headers['x-payload-hash'];
    const providedHash = Array.isArray(providedHashRaw) ? providedHashRaw[0] : providedHashRaw;
    if (!providedHash) return false;

    const hmacSecret = await this.getHmacSecret();
    if (!hmacSecret) return false; // no secret configured — refuse rather than accept an unsigned webhook

    let canonical: string;
    try {
      const parsed = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'));
      canonical = JSON.stringify(parsed);
    } catch {
      return false; // not valid JSON — cannot be a genuine Tatum webhook
    }

    const expected = createHmac('sha512', hmacSecret).update(canonical).digest('base64');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const providedBuf = Buffer.from(providedHash, 'utf8');
    if (expectedBuf.length !== providedBuf.length) return false; // timingSafeEqual requires equal length
    return timingSafeEqual(expectedBuf, providedBuf);
  }

  private async safeText(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }

  private async getProviderId(): Promise<bigint> {
    const provider = await this.prisma.provider.findUniqueOrThrow({ where: { code: this.code } });
    return provider.id;
  }

  private async getApiKey(): Promise<string> {
    const providerId = await this.getProviderId();
    const apiKey = await this.secrets.getCredential(providerId, 'api_key');
    if (!apiKey) throw new Error('tatum: no api_key configured — set it via SecretsService before use');
    return apiKey;
  }

  private async getHmacSecret(): Promise<string | null> {
    const providerId = await this.getProviderId();
    return this.secrets.getCredential(providerId, 'hmac_secret');
  }
}
