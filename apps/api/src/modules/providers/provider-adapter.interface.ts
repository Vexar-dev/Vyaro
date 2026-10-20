/**
 * Provider Adapter contracts — Master Prompt §9 ("Provider Architecture").
 *
 * Deliberately split into small, capability-specific interfaces rather than one
 * big interface every adapter must implement in full. A phone-top-up provider
 * has no "getBalance"; a pure webhook receiver has no "createOrder". An adapter
 * implements only the capabilities that actually apply to it — this is what the
 * Master Prompt means by "بحسب طبيعة الخدمة" (§9).
 *
 * Adding a new real provider later (Phase 6/7) means: write one class that
 * implements the relevant interface(s) below, register it in ProvidersModule —
 * nothing else in Wallet/Ledger/Transactions/Store ever imports a concrete
 * adapter directly, only these interfaces + ProviderRegistry.
 */

export type ProviderOrderStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface ProviderOrderResult {
  /** The PROVIDER's own id for this order — never our internal bigint id. */
  providerOrderId: string;
  status: ProviderOrderStatus;
  /** Raw provider response, for ProviderLogService to persist — never logged/returned unredacted to end users. */
  raw?: unknown;
}

export interface ProviderBalance {
  assetCode: string;
  /** Decimal string — same convention as Money.toDecimalString() elsewhere in the codebase. */
  amount: string;
}

/** Every adapter, regardless of capability, has a stable `code` matching a row in `providers.code`. */
export interface ProviderAdapter {
  readonly code: string;
}

/** Providers that create/track a purchasable/payable order (top-ups, cash-in/out, store purchases). */
export interface OrderCapableProvider extends ProviderAdapter {
  createOrder(params: {
    amountMinor: bigint;
    assetCode: string;
    /** OUR internal reference (e.g. a transaction's publicId) — lets us correlate their id back to ours. */
    reference: string;
    metadata?: Record<string, unknown>;
  }): Promise<ProviderOrderResult>;

  checkOrder(providerOrderId: string): Promise<ProviderOrderResult>;

  cancelOrder(providerOrderId: string): Promise<ProviderOrderResult>;
}

/** Providers we can query for an on-hand balance (e.g. a custody/blockchain provider). */
export interface BalanceCapableProvider extends ProviderAdapter {
  getBalance(): Promise<ProviderBalance[]>;
}

/** Providers that push async notifications (deposit confirmed, order settled, etc.). */
export interface WebhookCapableProvider extends ProviderAdapter {
  /**
   * Verifies the provider's signature over the RAW request body. Must be called,
   * and must return true, before handleWebhook() is ever invoked — an
   * unverified webhook is treated as untrusted input, full stop.
   */
  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): Promise<boolean>;

  /**
   * Applies the webhook's effect. Must be safe to call more than once with the
   * same eventId (ProviderLogService.recordWebhookEvent() is what actually
   * guarantees "at most once" at the DB level — this method doesn't need its
   * own idempotency check, just its own correctness if it somehow ran twice).
   */
  handleWebhook(eventId: string, payload: unknown): Promise<void>;
}

/** One purchasable item as listed by a supplier's own catalog API. */
export interface SupplierCatalogItem {
  /** The supplier's own SKU / product id — what createOrder() must be given back as metadata.providerSkuCode. */
  sku: string;
  name: string;
  /** What the supplier charges US, decimal string, in `costAssetCode`. */
  costAmount: string;
  /** One of OUR asset codes (e.g. VYR_SCD) — the adapter maps the supplier's currency to it. */
  costAssetCode: string;
  categoryName?: string;
  imageUrl?: string;
  /** Fields the BUYER must supply when ordering this item (e.g. Player_ID). */
  params?: string[];
  inStock: boolean;
}

/** Suppliers (Shahn Store, the two bots) that can list their catalog so the admin can import/sync products. */
export interface CatalogCapableProvider extends ProviderAdapter {
  listCatalog(): Promise<SupplierCatalogItem[]>;
}

export function isCatalogCapable(adapter: ProviderAdapter): adapter is ProviderAdapter & CatalogCapableProvider {
  return typeof (adapter as any).listCatalog === 'function';
}

export function isOrderCapable(adapter: ProviderAdapter): adapter is ProviderAdapter & OrderCapableProvider {
  return typeof (adapter as any).createOrder === 'function';
}

export function isWebhookCapable(adapter: ProviderAdapter): adapter is ProviderAdapter & WebhookCapableProvider {
  return typeof (adapter as any).handleWebhook === 'function';
}

export function isBalanceCapable(adapter: ProviderAdapter): adapter is ProviderAdapter & BalanceCapableProvider {
  return typeof (adapter as any).getBalance === 'function';
}

/**
 * Duck-typed marker (a property, not a class hierarchy) so callers like
 * WithdrawalsService can react to "this money-moving call's outcome is
 * unknown — do not release or settle a hold, do not retry" WITHOUT importing
 * any specific adapter's error classes. Any adapter's error class that
 * represents this situation should set `ambiguousOutcome = true` (see
 * TsaAmbiguousOutcomeError) — that's the entire contract.
 */
export function isAmbiguousOutcomeError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { ambiguousOutcome?: unknown }).ambiguousOutcome === true;
}
