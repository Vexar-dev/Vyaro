import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { KycService } from '../kyc/kyc.service';
import { PrismaService } from '../../database/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { TransactionsService } from '../transactions/transactions.service';
import { ProviderLogService } from '../providers/provider-log.service';
import { ProviderRegistry } from '../providers/provider-registry.service';
import { isOrderCapable, isAmbiguousOutcomeError, ProviderOrderResult } from '../providers/provider-adapter.interface';
import { Money } from '../../common/money/money';
import { assertValidStoreOrderTransition, StoreOrderState } from './store-order-state-machine';

const MAX_QUANTITY = 100;
const RESERVED_METADATA_KEYS = new Set(['providerSkuCode', 'quantity', 'amountMinor', 'assetCode', 'reference']);

/** Client purchase params (e.g. player id): flat primitives only, bounded, no reserved keys. */
function sanitizePurchaseMetadata(input?: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!input) return out;
  for (const [k, v] of Object.entries(input).slice(0, 10)) {
    if (RESERVED_METADATA_KEYS.has(k) || !/^[A-Za-z0-9_]{1,40}$/.test(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 200);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

export interface CreateStoreOrderParams {
  userPublicId: string;
  productId: bigint;
  quantity?: number;
  /** Product-specific purchase params (e.g. target game id/phone) — passed through to the provider's createOrder() metadata, merged with providerSkuCode. */
  purchaseMetadata?: Record<string, unknown>;
  idempotencyKey: string;
}

/**
 * StoreOrdersService — Phase 8. Structurally identical to WithdrawalsService
 * (§7): hold → call provider outside any DB transaction → settle/release
 * based on outcome, with the SAME ambiguous-outcome safety property (funds
 * stay held, order stays PROCESSING, never auto-retried). The only real
 * difference is WHAT is being paid for (a Product's active ProviderService)
 * instead of a raw destination address/gsm.
 *
 * "لا تجعل المتجر مرتبطًا بمزود واحد" (§10): this service never imports or
 * mentions a concrete provider — it resolves whichever provider is currently
 * active for the product's ProviderService via ProviderRegistry, exactly
 * like WithdrawalsService does for shamcash/syriatel. Swapping a product's
 * provider is a ProviderService row change, not a code change here.
 */
@Injectable()
export class StoreOrdersService {
  private readonly logger = new Logger(StoreOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly transactions: TransactionsService,
    private readonly providerLogs: ProviderLogService,
    private readonly registry: ProviderRegistry,
    private readonly kyc: KycService,
  ) {}

  async createOrder(params: CreateStoreOrderParams) {
    const user = await this.prisma.user.findUnique({ where: { publicId: params.userPublicId } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });

    await this.kyc.assertVerified(user.id, 'store');

    const quantity = params.quantity && params.quantity > 0 ? Math.min(Math.trunc(params.quantity), MAX_QUANTITY) : 1;

    const product = await this.prisma.product.findUnique({
      where: { id: params.productId },
      include: { services: { where: { isActive: true }, take: 1 }, category: true },
    });
    if (!product || !product.isActive) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'المنتج غير موجود' });
    }
    // Fields the buyer must fill (e.g. Player_ID): refuse before any money is held.
    const required = (product.fields as { key: string; label: string }[] | null) ?? [];
    const given = sanitizePurchaseMetadata(params.purchaseMetadata);
    for (const f of required) {
      if (String(given[f.key] ?? '').trim() === '') throw new BadRequestException({ code: 'FIELD_REQUIRED', message: `الحقل مطلوب: ${f.label}` });
    }
    const providerService = product.services[0];
    if (!providerService) {
      throw new NotFoundException({ code: 'PRODUCT_UNAVAILABLE', message: 'المنتج غير متاح حاليًا' });
    }

    if (!providerService.supplierStock) {
      throw new NotFoundException({ code: 'OUT_OF_STOCK', message: 'المنتج غير متوفر لدى المزوّد حاليًا' });
    }

    const asset = await this.prisma.asset.findUnique({ where: { code: providerService.priceAssetCode } });
    if (!asset || !asset.isActive) {
      throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'العملة/الخدمة غير متاحة' });
    }

    // Snapshotted NOW, at order time — a later price change on ProviderService
    // must never retroactively affect an already-placed order.
    const unitPrice = Money.fromDecimalString(providerService.priceAmount, asset.decimals);
    if (unitPrice.isNegative() || unitPrice.isZero()) {
      // A zero-price order would be fulfilled by the provider and then fail at settle (ledger rejects 0).
      throw new NotFoundException({ code: 'PRODUCT_UNAVAILABLE', message: 'المنتج غير متاح حاليًا' });
    }
    const totalAmount = Money.fromMinorUnits(unitPrice.toMinorUnits() * BigInt(quantity), asset.decimals);

    const provider = await this.prisma.provider.findUniqueOrThrow({ where: { id: providerService.providerId } });
    await this.providerLogs.assertActiveProvider(provider.code);

    const adapter = this.registry.get(provider.code);
    if (!isOrderCapable(adapter)) {
      throw new BadRequestException({ code: 'PRODUCT_UNAVAILABLE', message: 'المنتج غير متاح حاليًا' });
    }

    const scopedIdempotencyKey = `store-order:${user.id}:${params.idempotencyKey}`;

    // ── Step 1: create Transaction + StoreOrder + HOLD funds, atomically. ──
    const { transaction, storeOrder, wasAlreadyProcessed } = await this.prisma.$transaction(async (tx) => {
      const freshUser = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (freshUser.status !== 'ACTIVE') {
        throw new ForbiddenException({ code: 'ACCOUNT_NOT_ACTIVE', message: 'حسابك غير نشط حاليًا ولا يمكنه إجراء عمليات' });
      }

      const { transaction, wasAlreadyProcessed } = await this.transactions.createIdempotent(tx, {
        type: TransactionType.ORDER,
        idempotencyKey: scopedIdempotencyKey,
        referenceId: product.id.toString(),
        initiatedBy: user.id,
      });

      if (wasAlreadyProcessed) {
        const existingOrder = await tx.storeOrder.findUnique({ where: { transactionId: transaction.id } });
        return { transaction, storeOrder: existingOrder, wasAlreadyProcessed: true };
      }

      await this.transactions.transitionTo(tx, transaction.id, 'PROCESSING');
      await this.wallet.hold(tx, user.id, asset.code, totalAmount);

      const storeOrder = await tx.storeOrder.create({
        data: {
          userId: user.id,
          productId: product.id,
          providerServiceId: providerService.id,
          status: 'PROCESSING',
          quantity,
          assetCode: asset.code,
          amount: totalAmount.toDecimalString(),
          idempotencyKey: scopedIdempotencyKey,
          transactionId: transaction.id,
          metadata: (params.purchaseMetadata as any) ?? undefined,
        },
      });

      return { transaction, storeOrder, wasAlreadyProcessed: false };
    });

    if (wasAlreadyProcessed) {
      return this.toReceipt(storeOrder!);
    }

    // ── Step 2: call the provider — OUTSIDE any DB transaction. ──
    let result: ProviderOrderResult;
    try {
      result = await this.providerLogs.logCall(
        {
          providerId: provider.id,
          action: 'CREATE_ORDER',
          requestPayload: { productId: product.id.toString(), quantity, amount: totalAmount.toDecimalString() },
        },
        () =>
          adapter.createOrder({
            amountMinor: totalAmount.toMinorUnits(),
            assetCode: asset.code,
            reference: storeOrder!.publicId,
            // Server-controlled fields LAST so client metadata can never override the SKU/quantity that
            // was actually priced (previously the spread came after and let a user buy an expensive SKU
            // at a cheap product's price).
            metadata: { ...sanitizePurchaseMetadata(params.purchaseMetadata), providerSkuCode: providerService.providerSkuCode, quantity },
          }),
      );
    } catch (err) {
      if (isAmbiguousOutcomeError(err)) {
        // Funds stay HELD, order stays PROCESSING — same as WithdrawalsService.
        // No guessing. Needs manual reconciliation before any resolution.
        this.logger.error(
          `AMBIGUOUS store order outcome for order ${storeOrder!.publicId} (provider=${provider.code}) — ` +
            'funds remain HELD. Requires manual reconciliation via the provider before any resolution. Never auto-retry this.',
        );
        return this.toReceipt(storeOrder!, 'قيد المراجعة اليدوية — لم نتمكن من تأكيد نتيجة العملية لدى المزوّد');
      }

      await this.prisma.$transaction(async (tx) => {
        await this.wallet.release(tx, user.id, asset.code, totalAmount);
        await this.transactions.transitionTo(tx, transaction.id, 'FAILED', {
          error: err instanceof Error ? err.message : String(err),
        });
        await this.transitionOrder(tx, storeOrder!.id, storeOrder!.status as StoreOrderState, 'FAILED');
      });
      const providerMessage = (err as { tsaError?: string } | undefined)?.tsaError;
      throw new BadRequestException({ code: 'ORDER_FAILED', message: providerMessage ?? 'تعذّر إتمام الطلب' });
    }

    // ── Step 3: settle or release based on the provider's reported outcome. ──
    let finalOrder = storeOrder!;
    if (result.status === 'COMPLETED') {
      await this.prisma.$transaction(async (tx) => {
        await this.wallet.settle(tx, user.id, asset.code, totalAmount, transaction.id);
        await this.transactions.transitionTo(tx, transaction.id, 'COMPLETED', { providerOrderId: result.providerOrderId });
        finalOrder = await this.updateOrderOutcome(tx, storeOrder!.id, 'COMPLETED', result);
      });
    } else if (result.status === 'FAILED' || result.status === 'CANCELLED') {
      await this.prisma.$transaction(async (tx) => {
        await this.wallet.release(tx, user.id, asset.code, totalAmount);
        await this.transactions.transitionTo(tx, transaction.id, 'FAILED', { providerOrderId: result.providerOrderId });
        finalOrder = await this.updateOrderOutcome(tx, storeOrder!.id, 'FAILED', result);
      });
    }
    // else PENDING from the provider: left as PROCESSING/held — no currently
    // registered OrderCapableProvider actually returns this (all settle
    // synchronously today), but a future truly-async one might.

    return this.toReceipt(finalOrder);
  }

  async getMyOrder(userPublicId: string, orderPublicId: string) {
    const user = await this.prisma.user.findUnique({ where: { publicId: userPublicId } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });

    const order = await this.prisma.storeOrder.findUnique({ where: { publicId: orderPublicId }, include: { product: true } });
    // Same 404 whether it doesn't exist or belongs to someone else — no existence leak.
    if (!order || order.userId !== user.id) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'الطلب غير موجود' });
    }
    return this.toReceipt(order);
  }

  async listMyOrders(userPublicId: string, limit = 20) {
    const user = await this.prisma.user.findUnique({ where: { publicId: userPublicId } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });

    const orders = await this.prisma.storeOrder.findMany({
      where: { userId: user.id },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(Math.trunc(limit) || 20, 1), 100),
    });
    return orders.map((o) => this.toReceipt(o));
  }

  /** Admin: orders stuck in PROCESSING (provider outcome unknown / process died mid-flight). */
  async listStuckOrders(olderThanMinutes = 10) {
    const before = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const orders = await this.prisma.storeOrder.findMany({
      where: { status: 'PROCESSING', createdAt: { lt: before } },
      include: { product: true, user: true, providerService: { include: { provider: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return orders.map((o) => ({
      orderId: o.publicId,
      username: o.user.username,
      product: o.product.name,
      provider: o.providerService.provider.code,
      amount: o.amount,
      assetCode: o.assetCode,
      createdAt: o.createdAt,
    }));
  }

  /**
   * Admin resolution of a stuck order, AFTER the operator has confirmed the real outcome with the supplier.
   * SUCCEEDED → settle the hold (money leaves for good); FAILED → release the hold back to the user.
   */
  async resolveStuckOrder(orderPublicId: string, outcome: 'SUCCEEDED' | 'FAILED', providerOrderId?: string) {
    const order = await this.prisma.storeOrder.findUnique({ where: { publicId: orderPublicId } });
    if (!order || order.status !== 'PROCESSING' || order.transactionId == null) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'الطلب غير موجود أو ليس قيد المعالجة' });
    }
    const asset = await this.prisma.asset.findUniqueOrThrow({ where: { code: order.assetCode } });
    const amount = Money.fromDecimalString(order.amount, asset.decimals);
    await this.prisma.$transaction(async (tx) => {
      if (outcome === 'SUCCEEDED') {
        await this.wallet.settle(tx, order.userId, order.assetCode, amount, order.transactionId!);
        await this.transactions.transitionTo(tx, order.transactionId!, 'COMPLETED', { providerOrderId, resolvedManually: true });
        await tx.storeOrder.update({ where: { id: order.id }, data: { status: 'COMPLETED', providerOrderId: providerOrderId ?? order.providerOrderId } });
      } else {
        await this.wallet.release(tx, order.userId, order.assetCode, amount);
        await this.transactions.transitionTo(tx, order.transactionId!, 'FAILED', { resolvedManually: true });
        await tx.storeOrder.update({ where: { id: order.id }, data: { status: 'FAILED' } });
      }
    });
  }

  private async transitionOrder(tx: any, orderId: bigint, from: StoreOrderState, to: StoreOrderState) {
    assertValidStoreOrderTransition(from, to);
    return tx.storeOrder.update({ where: { id: orderId }, data: { status: to } });
  }

  private async updateOrderOutcome(tx: any, orderId: bigint, to: StoreOrderState, result: ProviderOrderResult) {
    const current = await tx.storeOrder.findUniqueOrThrow({ where: { id: orderId } });
    assertValidStoreOrderTransition(current.status as StoreOrderState, to);
    return tx.storeOrder.update({
      where: { id: orderId },
      data: { status: to, providerOrderId: result.providerOrderId, providerResponse: (result.raw as any) ?? undefined },
    });
  }

  private toReceipt(order: { publicId: string; status: string; amount: string; assetCode: string; quantity: number; providerOrderId: string | null; createdAt: Date }, note?: string) {
    return {
      orderId: order.publicId,
      status: order.status,
      amount: order.amount,
      assetCode: order.assetCode,
      quantity: order.quantity,
      providerOrderId: order.providerOrderId,
      note: note ?? null,
      createdAt: order.createdAt,
    };
  }
}
