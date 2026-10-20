import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/**
 * ProviderLogService — the single place that:
 *  1. enforces "a DISABLED/ARCHIVED provider can never be called" (assertActiveProvider),
 *  2. writes exactly one provider_logs row per adapter call, success or failure
 *     (logCall) — this is what Admin's future "Provider Logs" screen (§12) reads,
 *  3. guarantees a webhook is processed AT MOST ONCE per (provider, their event id)
 *     via the webhook_events unique constraint (recordWebhookEvent) — the same
 *     DB-level idempotency pattern TransactionsService.createIdempotent already
 *     uses for transactions.idempotency_key.
 *
 * No adapter (Mock or real, Phase 6/7+) should call prisma.providerLog /
 * prisma.webhookEvent directly — always through here, so every provider gets
 * the same guarantees for free.
 */
@Injectable()
export class ProviderLogService {
  constructor(private readonly prisma: PrismaService) {}

  async assertActiveProvider(code: string) {
    const provider = await this.prisma.provider.findUnique({ where: { code } });
    if (!provider || provider.status !== 'ACTIVE') {
      throw new ServiceUnavailableException({ code: 'PROVIDER_UNAVAILABLE', message: 'مزود الخدمة غير متاح حاليًا' });
    }
    return provider;
  }

  async logCall<T>(
    params: { providerId: bigint; action: string; requestPayload?: unknown },
    fn: () => Promise<T>,
  ): Promise<T> {
    let responsePayload: unknown;
    let success = true;
    let errorMessage: string | null = null;
    try {
      responsePayload = await fn();
      return responsePayload as T;
    } catch (err) {
      success = false;
      errorMessage = err instanceof Error ? err.message : 'unknown error';
      throw err;
    } finally {
      await this.prisma.providerLog.create({
        data: {
          providerId: params.providerId,
          action: params.action,
          requestPayload: (params.requestPayload as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          responsePayload: (responsePayload as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          success,
          errorMessage,
        },
      });
    }
  }

  /**
   * Insert-or-fetch on the (providerId, eventId) unique constraint.
   * `isNew: false` means this exact event was already recorded — the caller
   * must NOT re-apply its effect (no re-crediting a wallet, no re-completing
   * an order). Mirrors TransactionsService.createIdempotent's P2002 handling.
   */
  async recordWebhookEvent(providerId: bigint, eventId: string, payload: unknown, signatureValid: boolean) {
    try {
      const event = await this.prisma.webhookEvent.create({
        data: { providerId, eventId, payload: payload as Prisma.InputJsonValue, signatureValid },
      });
      return { event, isNew: true as const };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION) {
        const existing = await this.prisma.webhookEvent.findUniqueOrThrow({
          where: { providerId_eventId: { providerId, eventId } },
        });
        return { event: existing, isNew: false as const };
      }
      throw err;
    }
  }

  async markWebhookProcessed(webhookEventId: bigint): Promise<void> {
    await this.prisma.webhookEvent.update({ where: { id: webhookEventId }, data: { processedAt: new Date() } });
  }
}
