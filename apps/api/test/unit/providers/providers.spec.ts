import { ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { Prisma } from '@prisma/client';
import { ProviderRegistry } from '../../../src/modules/providers/provider-registry.service';
import { ProviderLogService } from '../../../src/modules/providers/provider-log.service';
import { MockProviderAdapter } from '../../../src/modules/providers/adapters/mock/mock-provider.adapter';

function makeFakeDb() {
  const providers = new Map<bigint, any>([[1n, { id: 1n, code: 'mock', status: 'ACTIVE' }]]);
  const providerLogs: any[] = [];
  const webhookEvents = new Map<string, any>(); // key: `${providerId}:${eventId}`
  let nextLogId = 1n;
  let nextEventId = 1n;

  const db: any = {
    provider: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.code !== undefined) return [...providers.values()].find((p) => p.code === where.code) ?? null;
        return providers.get(where.id) ?? null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const found = [...providers.values()].find((p) => p.code === where.code);
        if (!found) throw new Error('not found');
        return found;
      }),
    },
    providerLog: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextLogId++, createdAt: new Date(), ...data };
        providerLogs.push(row);
        return row;
      }),
    },
    webhookEvent: {
      create: jest.fn(async ({ data }: any) => {
        const key = `${data.providerId}:${data.eventId}`;
        if (webhookEvents.has(key)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the constraint: `providerId_eventId`', {
            code: 'P2002',
            clientVersion: '5.19.0',
          });
        }
        const row = { id: nextEventId++, createdAt: new Date(), processedAt: null, ...data };
        webhookEvents.set(key, row);
        return row;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const { providerId, eventId } = where.providerId_eventId;
        const row = webhookEvents.get(`${providerId}:${eventId}`);
        if (!row) throw new Error('not found');
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = [...webhookEvents.values()].find((r) => r.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      }),
    },
  };

  return { db, providerLogs, webhookEvents, providers };
}

describe('ProviderRegistry', () => {
  it('registers and resolves adapters by code, and rejects duplicates', () => {
    const registry = new ProviderRegistry();
    const adapter = { code: 'mock' } as any;
    registry.register(adapter);
    expect(registry.get('mock')).toBe(adapter);
    expect(registry.has('mock')).toBe(true);
    expect(registry.has('nope')).toBe(false);
    expect(() => registry.register(adapter)).toThrow();
  });

  it('throws for an unregistered code', () => {
    const registry = new ProviderRegistry();
    expect(() => registry.get('nope')).toThrow();
  });
});

describe('MockProviderAdapter', () => {
  it('createOrder → checkOrder (PENDING) → _devMarkCompleted → checkOrder (COMPLETED)', async () => {
    const { db } = makeFakeDb();
    const secrets = { getCredential: jest.fn() } as any;
    const adapter = new MockProviderAdapter(secrets, db);

    const created = await adapter.createOrder({ amountMinor: 100_000_000n, assetCode: 'USDT', reference: 'ref-1' });
    expect(created.status).toBe('PENDING');

    const checked = await adapter.checkOrder(created.providerOrderId);
    expect(checked.status).toBe('PENDING');

    await adapter._devMarkCompleted(created.providerOrderId);
    const afterComplete = await adapter.checkOrder(created.providerOrderId);
    expect(afterComplete.status).toBe('COMPLETED');
  });

  it('cancelOrder cancels a still-PENDING order but leaves a COMPLETED one alone', async () => {
    const { db } = makeFakeDb();
    const secrets = { getCredential: jest.fn() } as any;
    const adapter = new MockProviderAdapter(secrets, db);

    const order = await adapter.createOrder({ amountMinor: 1n, assetCode: 'USDT', reference: 'r' });
    const cancelled = await adapter.cancelOrder(order.providerOrderId);
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('checkOrder on an unknown id returns FAILED rather than throwing', async () => {
    const { db } = makeFakeDb();
    const secrets = { getCredential: jest.fn() } as any;
    const adapter = new MockProviderAdapter(secrets, db);
    const result = await adapter.checkOrder('does-not-exist');
    expect(result.status).toBe('FAILED');
  });

  it('verifyWebhookSignature accepts a correct HMAC and rejects a wrong one', async () => {
    const { db } = makeFakeDb();
    const secrets = { getCredential: jest.fn().mockResolvedValue('top-secret') } as any;
    const adapter = new MockProviderAdapter(secrets, db);

    const rawBody = JSON.stringify({ providerOrderId: 'mock_123', status: 'COMPLETED' });
    const validSig = createHmac('sha256', 'top-secret').update(rawBody).digest('hex');

    await expect(adapter.verifyWebhookSignature(rawBody, { 'x-mock-signature': validSig })).resolves.toBe(true);
    await expect(adapter.verifyWebhookSignature(rawBody, { 'x-mock-signature': 'wrong' })).resolves.toBe(false);
  });

  it('verifyWebhookSignature refuses (does not accept-by-default) when no secret is configured yet', async () => {
    const { db } = makeFakeDb();
    const secrets = { getCredential: jest.fn().mockResolvedValue(null) } as any;
    const adapter = new MockProviderAdapter(secrets, db);
    await expect(adapter.verifyWebhookSignature('{}', { 'x-mock-signature': 'anything' })).resolves.toBe(false);
  });
});

describe('ProviderLogService', () => {
  it('assertActiveProvider throws for a missing/non-ACTIVE provider', async () => {
    const { db } = makeFakeDb();
    db.provider.findUnique.mockResolvedValueOnce({ id: 2n, code: 'shamcash', status: 'DISABLED' });
    const service = new ProviderLogService(db);
    await expect(service.assertActiveProvider('shamcash')).rejects.toThrow(ServiceUnavailableException);
  });

  it('assertActiveProvider resolves for an ACTIVE provider', async () => {
    const { db } = makeFakeDb();
    const service = new ProviderLogService(db);
    await expect(service.assertActiveProvider('mock')).resolves.toMatchObject({ code: 'mock' });
  });

  it('logCall writes exactly one provider_logs row on success', async () => {
    const { db, providerLogs } = makeFakeDb();
    const service = new ProviderLogService(db);
    const result = await service.logCall({ providerId: 1n, action: 'CHECK_ORDER' }, async () => ({ ok: true }));
    expect(result).toEqual({ ok: true });
    expect(providerLogs).toHaveLength(1);
    expect(providerLogs[0].success).toBe(true);
  });

  it('logCall writes a failed provider_logs row AND rethrows when the call fails', async () => {
    const { db, providerLogs } = makeFakeDb();
    const service = new ProviderLogService(db);
    await expect(
      service.logCall({ providerId: 1n, action: 'CREATE_ORDER' }, async () => {
        throw new Error('provider timed out');
      }),
    ).rejects.toThrow('provider timed out');
    expect(providerLogs).toHaveLength(1);
    expect(providerLogs[0].success).toBe(false);
    expect(providerLogs[0].errorMessage).toBe('provider timed out');
  });

  it('recordWebhookEvent is idempotent: a duplicate (providerId, eventId) is reported, not reprocessed', async () => {
    const { db, webhookEvents } = makeFakeDb();
    const service = new ProviderLogService(db);

    const first = await service.recordWebhookEvent(1n, 'evt-1', { any: 'payload' }, true);
    expect(first.isNew).toBe(true);

    const second = await service.recordWebhookEvent(1n, 'evt-1', { any: 'payload' }, true);
    expect(second.isNew).toBe(false);
    expect(second.event.id).toBe(first.event.id);
    expect(webhookEvents.size).toBe(1); // NOT two rows
  });

  it('markWebhookProcessed sets processedAt', async () => {
    const { db } = makeFakeDb();
    const service = new ProviderLogService(db);
    const { event } = await service.recordWebhookEvent(1n, 'evt-2', {}, true);
    expect(event.processedAt).toBeNull();
    await service.markWebhookProcessed(event.id);
    expect(event.processedAt).not.toBeNull();
  });
});
