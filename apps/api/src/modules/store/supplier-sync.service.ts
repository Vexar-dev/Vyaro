import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ProviderLogService } from '../providers/provider-log.service';
import { ProviderRegistry } from '../providers/provider-registry.service';
import { isCatalogCapable } from '../providers/provider-adapter.interface';
import { SettingsService } from '../site/settings.service';
import { PricingService } from './pricing.service';

/**
 * Imports/syncs a supplier's catalog into Product + ProviderService rows.
 * New items arrive as INACTIVE products (admin reviews, assigns a category/image, then enables).
 * Existing items only get their cost/stock/name refreshed and their sale price recomputed — never re-activated,
 * never recategorised, and a manualPrice set by the admin is never touched.
 */
@Injectable()
export class SupplierSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: ProviderLogService,
    private readonly registry: ProviderRegistry,
    private readonly settings: SettingsService,
    private readonly pricing: PricingService,
  ) {}

  async sync(providerCode: string, saleAssetCode: string) {
    const provider = await this.logs.assertActiveProvider(providerCode);
    if (!this.registry.has(providerCode)) {
      throw new BadRequestException({ code: 'SUPPLIER_NOT_IMPLEMENTED', message: 'لا يوجد محوّل لهذا المزوّد بعد' });
    }
    const adapter = this.registry.get(providerCode);
    if (!isCatalogCapable(adapter)) {
      throw new BadRequestException({ code: 'SUPPLIER_NO_CATALOG', message: 'هذا المزوّد لا يدعم جلب الكتالوج' });
    }
    const sale = await this.prisma.asset.findUnique({ where: { code: saleAssetCode } });
    if (!sale || !sale.isActive) throw new BadRequestException({ code: 'ASSET_NOT_FOUND', message: 'عملة البيع غير موجودة' });

    const items = await this.logs.logCall({ providerId: provider.id, action: 'LIST_CATALOG' }, () => adapter.listCatalog());
    const defaultMargin = await this.settings.get<{ type?: string; value?: string } | null>('store.defaultMargin', null);

    const inbox = await this.prisma.productCategory.upsert({
      where: { slug: 'unsorted' },
      update: {},
      create: { name: 'غير مصنّف', slug: 'unsorted', isActive: false },
    });

    let created = 0;
    let updated = 0;
    const errors: { sku: string; error: string }[] = [];
    for (const item of items) {
      try {
        const existing = await this.prisma.providerService.findFirst({ where: { providerId: provider.id, providerSkuCode: item.sku } });
        if (existing) {
          await this.prisma.providerService.update({
            where: { id: existing.id },
            data: { costAmount: item.costAmount, costAssetCode: item.costAssetCode, supplierStock: item.inStock, externalName: item.name, lastSyncedAt: new Date() },
          });
          await this.pricing.recompute(existing.id);
          updated++;
        } else {
          const product = await this.prisma.product.create({
            data: { categoryId: inbox.id, name: item.name, imageUrl: item.imageUrl ?? null, isActive: false },
          });
          const ps = await this.prisma.providerService.create({
            data: {
              productId: product.id,
              providerId: provider.id,
              providerSkuCode: item.sku,
              priceAssetCode: sale.code,
              priceAmount: item.costAmount, // placeholder; recomputed just below if a margin exists
              costAmount: item.costAmount,
              costAssetCode: item.costAssetCode,
              marginType: defaultMargin?.type ?? null,
              marginValue: defaultMargin?.value ?? null,
              supplierStock: item.inStock,
              externalName: item.name,
              lastSyncedAt: new Date(),
              isActive: true,
            },
          });
          await this.pricing.recompute(ps.id);
          created++;
        }
      } catch (e) {
        errors.push({ sku: item.sku, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { fetched: items.length, created, updated, errors };
  }
}
