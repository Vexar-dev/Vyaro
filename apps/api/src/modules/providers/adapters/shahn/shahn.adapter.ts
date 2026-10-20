import { Injectable } from '@nestjs/common';
import { BalanceCapableProvider, CatalogCapableProvider, OrderCapableProvider, ProviderOrderResult, SupplierCatalogItem } from '../../provider-adapter.interface';
import { SecretsService } from '../../../../common/secrets/secrets.service';
import { PrismaService } from '../../../../database/prisma.service';

const BASE_URL = 'https://shahnstore.click/api/merchant';

/** Clean rejection from the supplier: the call definitely did not create an order. */
export class ShahnApiError extends Error {
  constructor(message: string, public readonly httpStatus: number, public readonly tsaError?: string) {
    super(message);
    this.name = 'ShahnApiError';
  }
}
/** Outcome unknown (network failure / 5xx). The order uuid is ours, so checkOrder(uuid) can reconcile it. Never auto-retry. */
export class ShahnAmbiguousOutcomeError extends ShahnApiError {
  readonly ambiguousOutcome = true as const;
}

export interface ShahnCatalogCategory { id: number; name: string; image?: string | null }
export interface ShahnProduct {
  id: number; name: string; categoryId: number; categoryName?: string; price: number; currency: string;
  available: boolean; params?: string[]; productType?: string;
}

/**
 * Shahn Store merchant API (https://shahnstore.click/api/merchant), built from the supplier's own documentation:
 *   auth: `api-key` header; GET /profile, GET /products[?categoryId=], GET /product/{id},
 *   POST /order {product_id, qty, params, uuid}, GET /order/{uuid}.
 * The order `uuid` is the idempotency key: we send OUR store-order id, so re-sending can never double-buy.
 * Only status "completed" is documented; any other status is treated as still pending (funds stay held) unless it clearly
 * says failed/cancelled/rejected/refunded.
 */
@Injectable()
export class ShahnAdapter implements BalanceCapableProvider, OrderCapableProvider, CatalogCapableProvider {
  readonly code = 'shahnstore';

  constructor(private readonly secrets: SecretsService, private readonly prisma: PrismaService) {}

  private async apiKey(): Promise<string> {
    const p = await this.prisma.provider.findUnique({ where: { code: this.code } });
    const key = p ? await this.secrets.getCredential(p.id, 'api_key') : null;
    if (!key) throw new ShahnApiError('مفتاح Shahn Store غير مضبوط', 0);
    return key;
  }

  /** Which of OUR assets the supplier's USD prices are recorded in (credential `cost_asset_code`, default USDT). */
  async costAsset(): Promise<string> {
    const p = await this.prisma.provider.findUnique({ where: { code: this.code } });
    return (p && (await this.secrets.getCredential(p.id, 'cost_asset_code'))) || 'USDT';
  }

  private async call<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }, moneyMoving: boolean): Promise<T> {
    const key = await this.apiKey();
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        method: init.method,
        headers: { 'api-key': key, Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; VAYRO/1.0)' },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'network error';
      if (moneyMoving) throw new ShahnAmbiguousOutcomeError(`Shahn network error (outcome unknown): ${m}`, 0);
      throw new ShahnApiError(`Shahn network error: ${m}`, 0);
    }
    let json: any;
    const text = await res.text().catch(() => '');
    try { json = JSON.parse(text); } catch {
      if (moneyMoving && res.status >= 500) throw new ShahnAmbiguousOutcomeError(`Shahn non-JSON ${res.status} (outcome unknown)`, res.status);
      throw new ShahnApiError(`رد غير متوقع من المورد (HTTP ${res.status}): ${text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)}`, res.status);
    }
    if (res.ok && json?.success !== false) return json as T;
    const msg = typeof json?.error === 'string' ? json.error : typeof json?.message === 'string' ? json.message : `Shahn request failed (HTTP ${res.status})`;
    if (moneyMoving && res.status >= 500) throw new ShahnAmbiguousOutcomeError(msg, res.status, msg);
    throw new ShahnApiError(msg, res.status, msg);
  }

  async getBalance() {
    const j = await this.call<{ balance: number; currency: string }>('/profile', { method: 'GET' }, false);
    return [{ assetCode: await this.costAsset(), amount: String(j.balance) }];
  }

  /** Raw categories + products (used by the admin import screen, which also needs `params`). */
  async fetchProducts(): Promise<{ categories: ShahnCatalogCategory[]; products: ShahnProduct[] }> {
    const j = await this.call<{ categories?: ShahnCatalogCategory[]; products?: ShahnProduct[] }>('/products', { method: 'GET' }, false);
    return { categories: j.categories ?? [], products: j.products ?? [] };
  }

  async listCatalog(): Promise<SupplierCatalogItem[]> {
    const asset = await this.costAsset();
    const { products } = await this.fetchProducts();
    return products.map((p) => ({
      sku: String(p.id), name: p.name, costAmount: String(p.price), costAssetCode: asset, categoryName: p.categoryName, params: p.params ?? [], inStock: !!p.available,
    }));
  }

  async createOrder(params: { amountMinor: bigint; assetCode: string; reference: string; metadata?: Record<string, unknown> }): Promise<ProviderOrderResult> {
    const { providerSkuCode, quantity, ...rest } = (params.metadata ?? {}) as Record<string, unknown>;
    const productId = Number(providerSkuCode);
    if (!Number.isInteger(productId) || productId <= 0) throw new ShahnApiError('معرّف المنتج لدى المزوّد غير صالح', 0);
    const j = await this.call<{ status?: string }>(
      '/order',
      { method: 'POST', body: { product_id: productId, qty: Number(quantity) || 1, params: rest, uuid: params.reference } },
      true,
    );
    return { providerOrderId: params.reference, status: mapStatus(j.status), raw: j };
  }

  async checkOrder(providerOrderId: string): Promise<ProviderOrderResult> {
    const j = await this.call<{ status?: string }>(`/order/${encodeURIComponent(providerOrderId)}`, { method: 'GET' }, false);
    return { providerOrderId, status: mapStatus(j.status), raw: j };
  }

  async cancelOrder(providerOrderId: string): Promise<ProviderOrderResult> {
    return this.checkOrder(providerOrderId); // the supplier documents no cancel endpoint
  }
}

function mapStatus(s?: string): ProviderOrderResult['status'] {
  const v = String(s ?? '').toLowerCase();
  if (v === 'completed' || v === 'success' || v === 'done') return 'COMPLETED';
  if (['failed', 'rejected', 'error'].includes(v)) return 'FAILED';
  if (['cancelled', 'canceled', 'refunded'].includes(v)) return 'CANCELLED';
  return 'PENDING';
}
