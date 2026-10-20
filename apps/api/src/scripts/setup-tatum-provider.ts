/**
 * One-time setup for the Tatum provider. Run manually:
 *
 *   cd apps/api
 *   TATUM_API_KEY=xxx TATUM_HMAC_SECRET=xxx npx ts-node src/scripts/setup-tatum-provider.ts
 *
 * TATUM_HMAC_SECRET: pick any long random string yourself (e.g.
 * `openssl rand -hex 32`) — this is NOT something Tatum gives you, it's a
 * secret YOU choose and tell Tatum about via PUT /v4/subscription. Whatever
 * you pass here is both stored (encrypted) in our DB AND pushed to Tatum in
 * the same run — they must always match, so never change one without the other.
 *
 * What this does, in order:
 *  1. Stores TATUM_API_KEY + TATUM_HMAC_SECRET via SecretsService (encrypted).
 *  2. Calls Tatum's PUT /v4/subscription to register the HMAC secret account-wide.
 *  3. Flips the `tatum` provider row to ACTIVE.
 *
 * Safe to re-run — upserts credentials and re-registers the same HMAC secret.
 *
 * ⚠️ Before running this against MAINNET with real API keys: read
 * docs/05_APIS_AND_PROVIDERS.txt §7 in full, and make sure
 * PUBLIC_API_BASE_URL in your .env is a REAL, internet-reachable HTTPS URL —
 * Tatum cannot deliver webhooks to localhost.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { SecretsService } from '../common/secrets/secrets.service';
import { TatumAdapter } from '../modules/providers/adapters/tatum/tatum.adapter';

async function main() {
  const apiKey = process.env.TATUM_API_KEY;
  const hmacSecret = process.env.TATUM_HMAC_SECRET;
  if (!apiKey || !hmacSecret) {
    throw new Error('Set TATUM_API_KEY and TATUM_HMAC_SECRET env vars before running this script.');
  }
  if (hmacSecret.length < 32) {
    throw new Error('TATUM_HMAC_SECRET should be at least 32 random characters — generate one with: openssl rand -hex 32');
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const prisma = app.get(PrismaService);
    const secrets = app.get(SecretsService);
    const tatum = app.get(TatumAdapter);

    const provider = await prisma.provider.findUniqueOrThrow({ where: { code: 'tatum' } });

    await secrets.setCredential(provider.id, 'api_key', apiKey);
    await secrets.setCredential(provider.id, 'hmac_secret', hmacSecret);
    console.log('Stored api_key and hmac_secret (encrypted) for provider "tatum".');

    await tatum.enableHmac(hmacSecret);
    console.log('Registered the HMAC secret with Tatum (PUT /v4/subscription) — webhooks will now be signed.');

    await prisma.provider.update({ where: { id: provider.id }, data: { status: 'ACTIVE' } });
    console.log('Provider "tatum" is now ACTIVE.');

    console.log(
      '\nNext: create a deposit address for a test user (GET /api/v1/deposit-addresses) and confirm a\n' +
        'Tatum subscription was created — check `deposit_addresses.tatum_subscription_id` is no longer null,\n' +
        'or GET https://api.tatum.io/v4/subscription with your api key.',
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
