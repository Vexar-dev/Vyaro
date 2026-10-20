import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { TransactionsService } from '../transactions/transactions.service';
import { ProviderLogService } from '../providers/provider-log.service';
import { TatumAdapter } from '../providers/adapters/tatum/tatum.adapter';
import { Money } from '../../common/money/money';
import type { NetworkCode } from '../custody/custody-key.service';

interface DepositAddressCreatedPayload {
  depositAddressId: bigint;
  networkId: bigint;
  networkCode: NetworkCode;
  address: string;
}

/**
 * DepositMonitoringService — Phase 6, part 2. Composes TatumAdapter +
 * ProviderLogService + WalletService + TransactionsService, exactly like
 * TransfersService composes Wallet+Ledger+Transactions elsewhere — none of
 * those modules know about each other or about Tatum.
 *
 * ── FLOW ───────────────────────────────────────────────────────────────
 * 1. A new deposit address is created → 'deposit-address.created' event →
 *    subscribeAddress() registers a Tatum webhook subscription for it.
 * 2. Tatum POSTs to /webhooks/tatum on a deposit → processWebhook():
 *    verify signature → record idempotently → create a PENDING_CONFIRMATION
 *    DepositEvent. Never credits synchronously here.
 * 3. A scheduled job (checkPendingConfirmations, every minute) independently
 *    re-checks each pending deposit's confirmation count against the
 *    network's current block height, and only THEN credits — decoupling
 *    "receive the webhook fast" from "trust it enough to move money".
 *
 * ⚠️ See docs/05_APIS_AND_PROVIDERS.txt §7 for what remains UNVERIFIED here
 * (the exact getCurrentBlockHeight response shape) before this is trusted
 * with real mainnet value.
 */
@Injectable()
export class DepositMonitoringService {
  private readonly logger = new Logger(DepositMonitoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tatum: TatumAdapter,
    private readonly providerLogs: ProviderLogService,
    private readonly wallet: WalletService,
    private readonly transactions: TransactionsService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('deposit-address.created')
  async handleDepositAddressCreated(payload: DepositAddressCreatedPayload): Promise<void> {
    try {
      await this.subscribeAddress(payload);
    } catch (err) {
      // Deliberately swallowed: a failed subscription must not fail the
      // user's address-creation request — the address itself is still valid
      // and safe to receive funds. Monitoring can be retried/backfilled
      // separately (see docs §7, "known gaps" — no backfill tool built yet).
      this.logger.error(`Failed to create Tatum subscription for deposit address ${payload.depositAddressId}: ${err}`);
    }
  }

  async subscribeAddress(payload: DepositAddressCreatedPayload): Promise<void> {
    const network = await this.prisma.network.findUniqueOrThrow({ where: { id: payload.networkId } });
    if (!network.tatumChainId) {
      throw new Error(`Network ${payload.networkCode}: no tatum_chain_id configured — cannot subscribe`);
    }
    const baseUrl = this.config.get<string>('PUBLIC_API_BASE_URL');
    if (!baseUrl) {
      throw new Error('PUBLIC_API_BASE_URL is not configured — cannot register a Tatum webhook URL');
    }
    const webhookUrl = `${baseUrl}/api/v1/webhooks/tatum`;
    const type = payload.networkCode === 'LTC' ? 'INCOMING_NATIVE_TX' : 'INCOMING_FUNGIBLE_TX';

    const subscriptionId = await this.tatum.createSubscription({
      type,
      chain: network.tatumChainId,
      address: payload.address,
      webhookUrl,
      contractAddress: type === 'INCOMING_FUNGIBLE_TX' ? (network.tokenContractAddress ?? undefined) : undefined,
    });

    await this.prisma.depositAddress.update({
      where: { id: payload.depositAddressId },
      data: { tatumSubscriptionId: subscriptionId },
    });
  }

  /**
   * The webhook entrypoint. Verifies signature, records idempotently, and —
   * only if genuinely new, confirmed-in-block, and incoming — creates a
   * PENDING_CONFIRMATION DepositEvent. Never credits anything here.
   */
  async processWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<void> {
    const tatumProviderId = await this.getTatumProviderId();
    const signatureValid = await this.tatum.verifyWebhookSignature(rawBody, headers);

    let parsed: {
      chain?: string;
      txId?: string;
      address?: string;
      amount?: string | number;
      tokenSymbol?: string;
      blockNumber?: number | string;
      type?: string;
      mempool?: boolean;
    };
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      await this.providerLogs.recordWebhookEvent(
        tatumProviderId,
        `unparseable:${Date.now()}:${Math.random()}`,
        { rawPreview: rawBody.toString('utf8').slice(0, 500) },
        false,
      );
      throw new BadRequestException('invalid JSON body');
    }

    // SECURITY: an UNSIGNED request must never occupy the real (provider, eventId) slot. Tx hashes and
    // addresses are public, so anyone could otherwise POST a forged event for a real deposit first,
    // and the genuine signed delivery would then be dropped as a "duplicate" (deposit never credited).
    // Invalid-signature requests are logged under a body-hash key instead and never processed.
    if (!signatureValid) {
      const bodyHash = createHash('sha256').update(rawBody).digest('hex');
      await this.providerLogs.recordWebhookEvent(tatumProviderId, `invalid-signature:${bodyHash}`, parsed, false);
      this.logger.warn(`Tatum webhook with INVALID signature (body sha256=${bodyHash.slice(0, 12)}…) — recorded, NOT processed.`);
      return;
    }

    const eventId = `${parsed.chain}:${parsed.txId}:${parsed.address}:${parsed.type}`;
    const { isNew } = await this.providerLogs.recordWebhookEvent(tatumProviderId, eventId, parsed, true);
    if (!isNew) return; // already handled this exact notification — idempotent no-op
    if (parsed.mempool === true) return; // not confirmed yet — wait for the confirmed-in-block delivery
    if (parsed.type !== 'incoming') return; // we only ever credit deposits

    const network = await this.prisma.network.findFirst({ where: { tatumChainId: parsed.chain } });
    if (!network) {
      this.logger.warn(`Tatum webhook for unrecognized chain "${parsed.chain}" — ignored`);
      return;
    }

    const normalizedAddress = network.code === 'BEP20' ? String(parsed.address).toLowerCase() : String(parsed.address);
    const depositAddress = await this.prisma.depositAddress.findUnique({ where: { address: normalizedAddress } });
    if (!depositAddress || depositAddress.networkId !== network.id) {
      this.logger.warn(`Tatum webhook for address ${normalizedAddress} on ${parsed.chain} — no matching deposit address`);
      return;
    }

    try {
      await this.prisma.depositEvent.create({
        data: {
          depositAddressId: depositAddress.id,
          networkId: network.id,
          txHash: String(parsed.txId),
          amount: String(parsed.amount),
          blockNumber: parsed.blockNumber != null ? BigInt(parsed.blockNumber) : null,
          status: 'PENDING_CONFIRMATION',
        },
      });
    } catch (err) {
      // (networkId, txHash) is UNIQUE — this is the REAL guard against ever
      // double-recording the same on-chain tx, independent of the eventId
      // dedup above (which only guards the webhook DELIVERY, not the deposit
      // itself — e.g. if Tatum ever redelivers under a slightly different eventId).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
      throw err;
    }
  }

  /** Credits any PENDING_CONFIRMATION deposit that has reached its network's required confirmations. */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkPendingConfirmations(): Promise<void> {
    const pending = await this.prisma.depositEvent.findMany({
      where: { status: 'PENDING_CONFIRMATION' },
      include: { network: true },
    });
    if (pending.length === 0) return;

    // One current-block-height lookup per network, not per pending deposit.
    const heightByNetwork = new Map<bigint, number>();
    for (const networkId of new Set(pending.map((p) => p.networkId))) {
      const network = pending.find((p) => p.networkId === networkId)!.network;
      if (!network.tatumChainId) continue;
      try {
        heightByNetwork.set(networkId, await this.tatum.getCurrentBlockHeight(network.tatumChainId));
      } catch (err) {
        this.logger.error(`Could not fetch current block height for ${network.code}: ${err}`);
      }
    }

    for (const deposit of pending) {
      if (deposit.blockNumber == null) continue; // nothing to compare against yet
      const currentHeight = heightByNetwork.get(deposit.networkId);
      if (currentHeight == null) continue;

      const confirmations = currentHeight - Number(deposit.blockNumber) + 1;
      if (confirmations < deposit.network.requiredConfirmations) continue;

      try {
        await this.creditDeposit(deposit);
      } catch (err) {
        this.logger.error(`Failed to credit deposit_event ${deposit.id} (tx ${deposit.txHash}): ${err}`);
      }
    }
  }

  private async creditDeposit(deposit: {
    id: bigint;
    depositAddressId: bigint;
    networkId: bigint;
    txHash: string;
    amount: string;
    network: { code: string };
  }): Promise<void> {
    const depositAddress = await this.prisma.depositAddress.findUniqueOrThrow({ where: { id: deposit.depositAddressId } });
    // BEP20/TRC20 both credit the same unified 'USDT' ledger asset regardless
    // of chain; LTC credits its own 'LTC' asset. See docs §7.
    const assetCode = deposit.network.code === 'LTC' ? 'LTC' : 'USDT';

    await this.prisma.$transaction(async (tx) => {
      // Row-lock the deposit_event itself so two overlapping cron ticks can
      // never both try to credit the same deposit.
      const locked = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM deposit_events WHERE id = ${deposit.id} FOR UPDATE
      `;
      if (locked[0].status !== 'PENDING_CONFIRMATION') return; // already handled by a concurrent tick

      const idempotencyKey = `deposit:${deposit.networkId}:${deposit.txHash}`;
      const { transaction, wasAlreadyProcessed } = await this.transactions.createIdempotent(tx, {
        type: TransactionType.DEPOSIT,
        idempotencyKey,
        referenceId: deposit.txHash,
        initiatedBy: depositAddress.userId,
      });

      if (!wasAlreadyProcessed) {
        await this.transactions.transitionTo(tx, transaction.id, 'PROCESSING');
        const asset = await tx.asset.findUniqueOrThrow({ where: { code: assetCode } });
        const amount = Money.fromDecimalString(deposit.amount, asset.decimals);
        await this.wallet.credit(tx, depositAddress.userId, assetCode, amount, transaction.id);
        await this.transactions.transitionTo(tx, transaction.id, 'COMPLETED');
      }

      await tx.depositEvent.update({
        where: { id: deposit.id },
        data: { status: 'CREDITED', transactionId: transaction.id },
      });
    });
  }

  private async getTatumProviderId(): Promise<bigint> {
    const provider = await this.prisma.provider.findUniqueOrThrow({ where: { code: 'tatum' } });
    return provider.id;
  }
}
