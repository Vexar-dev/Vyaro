import { TsaHttpClient } from '../../../src/modules/providers/adapters/tsa/tsa-http-client';
import { TsaApiError, TsaAmbiguousOutcomeError } from '../../../src/modules/providers/adapters/tsa/tsa-errors';
import { ShamCashAdapter } from '../../../src/modules/providers/adapters/tsa/shamcash.adapter';
import { SyriatelAdapter } from '../../../src/modules/providers/adapters/tsa/syriatel.adapter';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function fakePrismaForTsa() {
  return {
    asset: {
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        if (where.code === 'SYP') return { code: 'SYP', decimals: 0 };
        if (where.code === 'USD') return { code: 'USD', decimals: 2 };
        throw new Error(`unknown asset ${where.code}`);
      }),
    },
    provider: {
      findUniqueOrThrow: jest.fn(async ({ where }: any) => ({ id: 1n, code: where.code })),
    },
  } as any;
}

describe('TsaHttpClient', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('returns .data on a successful {success:true} response', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { success: true, data: { foo: 'bar' } })) as any;
    const client = new TsaHttpClient('key');
    await expect(client.get({ resource: 'status' })).resolves.toEqual({ foo: 'bar' });
  });

  it('throws plain TsaApiError on a clean 401 (never ambiguous, even for money-moving calls)', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(401, { success: false, error: 'Missing API key' })) as any;
    const client = new TsaHttpClient('key');
    await expect(client.post({ resource: 'shamcash', action: 'transfer' }, {}, true)).rejects.toThrow(TsaApiError);
    await expect(client.post({ resource: 'shamcash', action: 'transfer' }, {}, true)).rejects.not.toThrow(
      TsaAmbiguousOutcomeError,
    );
  });

  it('throws TsaAmbiguousOutcomeError on a 502 for a money-moving call', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(502, { success: false, error: 'upstream down' })) as any;
    const client = new TsaHttpClient('key');
    await expect(client.post({ resource: 'shamcash', action: 'transfer' }, {}, true)).rejects.toThrow(
      TsaAmbiguousOutcomeError,
    );
  });

  it('throws plain TsaApiError (not ambiguous) on a 502 for a NON-money-moving call', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(502, { success: false, error: 'upstream down' })) as any;
    const client = new TsaHttpClient('key');
    await expect(client.get({ resource: 'shamcash', action: 'balance' })).rejects.toThrow(TsaApiError);
    await expect(client.get({ resource: 'shamcash', action: 'balance' })).rejects.not.toThrow(TsaAmbiguousOutcomeError);
  });

  it('throws TsaAmbiguousOutcomeError on a network failure during a money-moving call', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as any;
    const client = new TsaHttpClient('key');
    await expect(client.post({ resource: 'syriatel', action: 'transfer_cash' }, {}, true)).rejects.toThrow(
      TsaAmbiguousOutcomeError,
    );
  });
});

describe('ShamCashAdapter', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  function buildAdapter() {
    const secrets = {
      getCredential: jest.fn(async (_id: bigint, key: string) => (key === 'tsa_api_key' ? 'test-key' : 'addr123')),
    } as any;
    return new ShamCashAdapter(secrets, fakePrismaForTsa());
  }

  it('getBalance maps TSA balances[] to {assetCode, amount}[]', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: { account_address: 'addr123', balances: [{ currency: 'SYP', balance: 6880 }, { currency: 'USD', balance: 0.05 }] },
      }),
    ) as any;
    const adapter = buildAdapter();
    const balances = await adapter.getBalance();
    expect(balances).toEqual([
      { assetCode: 'SYP', amount: '6880' },
      { assetCode: 'USD', amount: '0.05' },
    ]);
  });

  it('createOrder requires metadata.toAddress', async () => {
    const adapter = buildAdapter();
    await expect(adapter.createOrder({ amountMinor: 100n, assetCode: 'SYP', reference: 'r1' })).rejects.toThrow(
      /toAddress/,
    );
  });

  it('createOrder sends a form POST with the converted decimal amount and returns COMPLETED with the tran_id', async () => {
    let capturedBody = '';
    global.fetch = jest.fn().mockImplementation(async (_url: string, init: any) => {
      capturedBody = init.body;
      return jsonResponse(200, {
        success: true,
        data: { tran_id: '288100002', amount: 1200, currency: 'SYP', to_address: 'b7c2...' },
      });
    }) as any;

    const adapter = buildAdapter();
    const result = await adapter.createOrder({
      amountMinor: 1200n, // SYP has 0 decimals in our fake asset table
      assetCode: 'SYP',
      reference: 'tx-ref-1',
      metadata: { toAddress: 'b7c2d1e0f9a84b5632109876fedcba98' },
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.providerOrderId).toBe('288100002');
    expect(capturedBody).toContain('amount=1200');
    expect(capturedBody).toContain('to_address=b7c2d1e0f9a84b5632109876fedcba98');
  });

  it('propagates TsaAmbiguousOutcomeError from createOrder on a 5xx (caller must reconcile, not retry blindly)', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(503, { success: false, error: 'maintenance' })) as any;
    const adapter = buildAdapter();
    await expect(
      adapter.createOrder({ amountMinor: 100n, assetCode: 'SYP', reference: 'r1', metadata: { toAddress: 'x' } }),
    ).rejects.toThrow(TsaAmbiguousOutcomeError);
  });
});

describe('SyriatelAdapter', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  function buildAdapter() {
    const secrets = {
      getCredential: jest.fn(async (_id: bigint, key: string) => (key === 'tsa_api_key' ? 'test-key' : '09330000001')),
    } as any;
    return new SyriatelAdapter(secrets, fakePrismaForTsa());
  }

  it('createOrder defaults to transfer_cash and maps the billcode field', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: { source_gsm: '09330000001', beneficiary_gsm: '09980000003', amount: '250', fee: '1.50', billcode: 'X7M4P2Q1' },
      }),
    ) as any;
    const adapter = buildAdapter();
    const result = await adapter.createOrder({
      amountMinor: 250n,
      assetCode: 'SYP',
      reference: 'r1',
      metadata: { toGsm: '09980000003', pinCode: '1234' },
    });
    expect(result.providerOrderId).toBe('X7M4P2Q1');
    expect(result.status).toBe('COMPLETED');
  });

  it('createOrder with action=mobile_recharge maps the bill_code field (different key than transfer_cash)', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: {
          source_gsm: '09330000001',
          target_gsm: '09990000004',
          amount: '210',
          recharge_amount: '200.00',
          tax: '8.50',
          fee: '1.50',
          bill_code: '8844221100',
        },
      }),
    ) as any;
    const adapter = buildAdapter();
    const result = await adapter.createOrder({
      amountMinor: 210n,
      assetCode: 'SYP',
      reference: 'r1',
      metadata: { action: 'mobile_recharge', toGsm: '09990000004', pinCode: '1234' },
    });
    expect(result.providerOrderId).toBe('8844221100');
  });

  it('rejects an unsupported metadata.action before making any network call', async () => {
    global.fetch = jest.fn() as any;
    const adapter = buildAdapter();
    await expect(
      adapter.createOrder({
        amountMinor: 1n,
        assetCode: 'SYP',
        reference: 'r1',
        metadata: { action: 'not_a_real_action', toGsm: '1', pinCode: '1' },
      }),
    ).rejects.toThrow(/unsupported metadata.action/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('requires toGsm and pinCode', async () => {
    const adapter = buildAdapter();
    await expect(
      adapter.createOrder({ amountMinor: 1n, assetCode: 'SYP', reference: 'r1', metadata: {} }),
    ).rejects.toThrow(/toGsm and metadata.pinCode/);
  });

  it('getBalance wraps the raw balance string as SYP', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { success: true, data: { gsm: '09330000001', balance: '482500' } })) as any;
    const adapter = buildAdapter();
    await expect(adapter.getBalance()).resolves.toEqual([{ assetCode: 'SYP', amount: '482500' }]);
  });
});
