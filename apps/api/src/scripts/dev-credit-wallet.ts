/**
 * DEV-ONLY utility: credits a user's wallet with test funds, going through the
 * exact same WalletService/LedgerService code path production deposits will use
 * later (Phase 6+) — so testing against it now is testing the real logic, not a
 * shortcut around it. This is a CLI script, not an HTTP endpoint, specifically so
 * there is zero attack surface in the running API for "give me free money" —
 * nothing here is reachable over the network.
 *
 * Usage (from apps/api):
 *   NODE_ENV=development npx ts-node src/scripts/dev-credit-wallet.ts <username> <ASSET_CODE> <amount>
 *   e.g. npx ts-node src/scripts/dev-credit-wallet.ts ahmad USDT 100
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { WalletService } from '../modules/wallet/wallet.service';
import { TransactionsService } from '../modules/transactions/transactions.service';
import { Money } from '../common/money/money';
import { randomUUID } from 'crypto';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run dev-credit-wallet against NODE_ENV=production');
  }

  const [username, assetCode, amountStr] = process.argv.slice(2);
  if (!username || !assetCode || !amountStr) {
    console.error('Usage: dev-credit-wallet.ts <username> <ASSET_CODE> <amount>');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const wallet = app.get(WalletService);
  const transactions = app.get(TransactionsService);

  const user = await prisma.user.findUnique({ where: { usernameLower: username.toLowerCase() } });
  if (!user) throw new Error(`No user with username "${username}"`);

  const asset = await prisma.asset.findUnique({ where: { code: assetCode } });
  if (!asset) throw new Error(`No asset with code "${assetCode}"`);

  const amount = Money.fromDecimalString(amountStr, asset.decimals);

  await prisma.$transaction(async (tx) => {
    const { transaction } = await transactions.createIdempotent(tx, {
      type: 'DEPOSIT',
      idempotencyKey: `dev-credit:${randomUUID()}`,
      referenceId: 'dev-credit-wallet script',
    });
    await transactions.transitionTo(tx, transaction.id, 'PROCESSING');
    await wallet.credit(tx, user.id, assetCode, amount, transaction.id);
    await transactions.transitionTo(tx, transaction.id, 'COMPLETED');
  });

  console.log(`Credited ${amountStr} ${assetCode} to @${username} (dev/test only).`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
