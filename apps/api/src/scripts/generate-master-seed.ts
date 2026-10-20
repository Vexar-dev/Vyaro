/**
 * ONE-TIME setup script. Run it manually, ONCE, on a machine you trust — NEVER
 * via CI/automation, never committed to a repo, never piped anywhere:
 *
 *   cd apps/api
 *   npx ts-node src/scripts/generate-master-seed.ts
 *
 * Generates a NEW 24-word BIP39 mnemonic and stores ONLY its AES-256-GCM
 * encrypted form (via the same EncryptionService used everywhere else) in
 * `wallet_master_seeds`. The PLAINTEXT mnemonic is printed to your terminal
 * exactly once — write it down on PAPER and store it somewhere physically
 * secure and offline (a safe). It will never be shown again by this script or
 * any other part of the app.
 *
 * If you ever lose BOTH the encrypted DB row and your offline paper backup,
 * every address derived from it becomes PERMANENTLY UNRECOVERABLE. There is
 * no "forgot password" for this.
 *
 * Refuses to run if a master seed already exists — this script can create
 * one, never replace one (replacing it would orphan every deposit address
 * already derived from the old seed, and any funds sent to them).
 */
import { NestFactory } from '@nestjs/core';
import { generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { EncryptionService } from '../common/secrets/encryption.service';

const MASTER_SEED_LABEL = 'primary';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const prisma = app.get(PrismaService);
    const encryption = app.get(EncryptionService);

    const existing = await prisma.walletMasterSeed.findUnique({ where: { label: MASTER_SEED_LABEL } });
    if (existing) {
      console.error(
        `A master seed already exists (label="${MASTER_SEED_LABEL}", created ${existing.createdAt.toISOString()}). ` +
          'Refusing to overwrite it — this would orphan every address already derived from it.',
      );
      process.exitCode = 1;
      return;
    }

    const mnemonic = generateMnemonic(wordlist, 256); // 256 bits of entropy → 24 words
    const encryptedMnemonic = encryption.encrypt(mnemonic);

    await prisma.walletMasterSeed.create({ data: { label: MASTER_SEED_LABEL, encryptedMnemonic } });

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('  WRITE THIS DOWN ON PAPER NOW — IT WILL NEVER BE SHOWN AGAIN');
    console.log('════════════════════════════════════════════════════════════════\n');
    console.log('  ' + mnemonic);
    console.log('\n════════════════════════════════════════════════════════════════\n');
    console.log('Encrypted copy stored in `wallet_master_seeds`.');
    console.log('Next: run `npx ts-node src/scripts/verify-master-seed.ts` and read its');
    console.log('output carefully before trusting this with any real deposit.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
