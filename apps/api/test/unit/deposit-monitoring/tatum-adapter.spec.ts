import { createHmac } from 'crypto';
import { TatumAdapter } from '../../../src/modules/providers/adapters/tatum/tatum.adapter';

function fakePrisma(hmacSecret: string | null) {
  return {
    provider: { findUniqueOrThrow: jest.fn(async () => ({ id: 1n, code: 'tatum' })) },
  } as any;
}

function fakeSecrets(hmacSecret: string | null) {
  return { getCredential: jest.fn(async (_id: bigint, key: string) => (key === 'hmac_secret' ? hmacSecret : null)) } as any;
}

describe('TatumAdapter.verifyWebhookSignature', () => {
  const body = { chain: 'tron-mainnet', txId: 'abc123', address: 'TXXX', amount: '10', type: 'incoming' };
  const bodyString = JSON.stringify(body); // exactly what TatumAdapter re-derives via JSON.parse+JSON.stringify

  it('accepts a correctly computed HMAC-SHA512/base64 signature (per Tatum\'s documented algorithm)', async () => {
    const secret = 'test-hmac-secret';
    const adapter = new TatumAdapter(fakePrisma(secret), fakeSecrets(secret));
    const validSig = createHmac('sha512', secret).update(bodyString).digest('base64');

    const result = await adapter.verifyWebhookSignature(bodyString, { 'x-payload-hash': validSig });
    expect(result).toBe(true);
  });

  it('rejects a wrong signature', async () => {
    const secret = 'test-hmac-secret';
    const adapter = new TatumAdapter(fakePrisma(secret), fakeSecrets(secret));
    const result = await adapter.verifyWebhookSignature(bodyString, { 'x-payload-hash': 'not-the-right-signature' });
    expect(result).toBe(false);
  });

  it('rejects when no hmac_secret is configured yet (refuses, never accepts-by-default)', async () => {
    const adapter = new TatumAdapter(fakePrisma(null), fakeSecrets(null));
    const validSigWithWrongSecret = createHmac('sha512', 'some-other-secret').update(bodyString).digest('base64');
    const result = await adapter.verifyWebhookSignature(bodyString, { 'x-payload-hash': validSigWithWrongSecret });
    expect(result).toBe(false);
  });

  it('rejects when the x-payload-hash header is missing', async () => {
    const secret = 'test-hmac-secret';
    const adapter = new TatumAdapter(fakePrisma(secret), fakeSecrets(secret));
    const result = await adapter.verifyWebhookSignature(bodyString, {});
    expect(result).toBe(false);
  });

  it('rejects a non-JSON body', async () => {
    const secret = 'test-hmac-secret';
    const adapter = new TatumAdapter(fakePrisma(secret), fakeSecrets(secret));
    const result = await adapter.verifyWebhookSignature('not json at all', { 'x-payload-hash': 'anything' });
    expect(result).toBe(false);
  });

  it('signature computed over a Buffer (as the real webhook controller passes it) matches the same computed over the equivalent string', async () => {
    const secret = 'test-hmac-secret';
    const adapter = new TatumAdapter(fakePrisma(secret), fakeSecrets(secret));
    const validSig = createHmac('sha512', secret).update(bodyString).digest('base64');
    const result = await adapter.verifyWebhookSignature(Buffer.from(bodyString, 'utf8'), { 'x-payload-hash': validSig });
    expect(result).toBe(true);
  });
});
