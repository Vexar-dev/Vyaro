import { Injectable } from '@nestjs/common';
import { randomUUID, createHmac } from 'crypto';
import {
  OrderCapableProvider,
  ProviderOrderResult,
  WebhookCapableProvider,
} from '../../provider-adapter.interface';
import { SecretsService } from '../../../../common/secrets/secrets.service';
import { PrismaService } from '../../../../database/prisma.service';

/**
 * MockProviderAdapter — Master Prompt §37: "لا تخترع implementation... استخدم
 * Mock Provider أو Interface." This is that Mock Provider: a fully working
 * OrderCapableProvider + WebhookCapableProvider that talks to NOTHING external.
 *
 * Its webhook signature scheme (HMAC-SHA256 over the raw body, secret pulled
 * via SecretsService) is the same SHAPE a real provider integration will use —
 * so wiring a real provider later means writing one class like this one and
 * adding it to ProvidersModule; nothing else changes.
 *
 * KNOWN LIMITATION (intentional, mock-only): order state lives in an in-memory
 * Map, not the database — it does not survive a restart and is not shared
 * across multiple API instances. A REAL adapter must never do this; it should
 * rely on the provider's own remote state plus our own orders/transactions
 * tables (Phase 8). This adapter exists purely to exercise
 * ProviderRegistry / ProviderLogService / webhook idempotency end-to-end.
 */
@Injectable()
export class MockProviderAdapter implements OrderCapableProvider, WebhookCapableProvider {
  readonly code = 'mock';

  private readonly orders = new Map<string, ProviderOrderResult>();

  constructor(
    private readonly secrets: SecretsService,
    private readonly prisma: PrismaService,
  ) {}

  async createOrder(params: {
    amountMinor: bigint;
    assetCode: string;
    reference: string;
    metadata?: Record<string, unknown>;
  }): Promise<ProviderOrderResult> {
    const providerOrderId = `mock_${randomUUID()}`;
    const result: ProviderOrderResult = {
      providerOrderId,
      status: 'PENDING',
      raw: { ...params, amountMinor: params.amountMinor.toString() },
    };
    this.orders.set(providerOrderId, result);
    return result;
  }

  async checkOrder(providerOrderId: string): Promise<ProviderOrderResult> {
    return this.orders.get(providerOrderId) ?? { providerOrderId, status: 'FAILED', raw: { reason: 'unknown providerOrderId' } };
  }

  async cancelOrder(providerOrderId: string): Promise<ProviderOrderResult> {
    const existing = this.orders.get(providerOrderId);
    if (existing && existing.status === 'PENDING') {
      existing.status = 'CANCELLED';
    }
    return existing ?? { providerOrderId, status: 'FAILED', raw: { reason: 'unknown providerOrderId' } };
  }

  /**
   * Dev/test-only helper simulating the provider's own async completion
   * (e.g. what a real provider would do server-side before firing a webhook).
   * Never exposed over HTTP — only called from tests / a future local dev tool.
   */
  async _devMarkCompleted(providerOrderId: string): Promise<void> {
    const existing = this.orders.get(providerOrderId);
    if (existing) existing.status = 'COMPLETED';
  }

  async verifyWebhookSignature(rawBody: string, headers: Record<string, string>): Promise<boolean> {
    const providerId = await this.getProviderId();
    const secret = await this.secrets.getCredential(providerId, 'webhook_secret');
    if (!secret) return false; // no secret configured — refuse rather than accept an unsigned webhook
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const provided = headers['x-mock-signature'];
    return !!provided && provided === expected;
  }

  async handleWebhook(_eventId: string, payload: unknown): Promise<void> {
    const body = payload as { providerOrderId?: string; status?: ProviderOrderResult['status'] };
    if (body.providerOrderId && body.status) {
      const existing = this.orders.get(body.providerOrderId);
      if (existing) existing.status = body.status;
    }
  }

  private async getProviderId(): Promise<bigint> {
    const provider = await this.prisma.provider.findUniqueOrThrow({ where: { code: this.code } });
    return provider.id;
  }
}
