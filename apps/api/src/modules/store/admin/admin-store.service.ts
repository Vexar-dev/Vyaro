import { BadGatewayException, BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../../common/audit/audit.service';
import { PricingService } from '../pricing.service';
import { ProviderRegistry } from '../../providers/provider-registry.service';
import { ProviderLogService } from '../../providers/provider-log.service';
import { SecretsService } from '../../../common/secrets/secrets.service';
import { CatalogCapableProvider, ProviderAdapter, isCatalogCapable } from '../../providers/provider-adapter.interface';
import { BulkActiveDto, BulkImageDto, BulkMarginDto, ImportItemsDto, SetPricingDto, UpsertCategoryDto, UpsertProductDto } from './admin-store.dto';

type Actor = { publicId: string; ip?: string };

const FIELD_LABELS: Record<string, string> = { player_id: 'معرّف اللاعب (ID)', playerid: 'معرّف اللاعب (ID)', user_id: 'معرّف الحساب', userid: 'معرّف الحساب', phone: 'رقم الهاتف', email: 'البريد الإلكتروني', zone_id: 'رقم السيرفر (Zone ID)', server: 'السيرفر' };
const labelFor = (key: string) => FIELD_LABELS[key.toLowerCase()] ?? key.replace(/_/g, ' ');
/** Buyer-field definitions: keys are restricted to the same safe shape the order sanitiser accepts. */
function cleanFields(input?: { key: string; label: string }[] | null) {
  if (!input) return undefined;
  return input
    .filter((f) => f && /^[A-Za-z0-9_]{1,40}$/.test(String(f.key)))
    .slice(0, 5)
    .map((f) => ({ key: String(f.key), label: String(f.label || labelFor(String(f.key))).slice(0, 60) }));
}

@Injectable()
export class AdminStoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
    private readonly registry: ProviderRegistry,
    private readonly logs: ProviderLogService,
    private readonly secrets: SecretsService,
  ) {}

  // ───── categories ─────
  async listCategories() {
    const rows = await this.prisma.productCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { _count: { select: { products: true } } } });
    return rows.map((c) => ({
      id: c.id.toString(), parentId: c.parentId?.toString() ?? null, name: c.name, slug: c.slug, imageUrl: c.imageUrl,
      description: c.description, isActive: c.isActive, sortOrder: c.sortOrder, productCount: c._count.products,
    }));
  }

  private async assertParentOk(parentId: bigint | null, selfId?: bigint) {
    if (parentId == null) return;
    if (selfId != null && parentId === selfId) throw new BadRequestException({ code: 'CATEGORY_CYCLE', message: 'لا يمكن أن يكون القسم أباً لنفسه' });
    const parent = await this.prisma.productCategory.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'القسم الأب غير موجود' });
    // two levels are enough for the UI (games > PUBG); also prevents cycles
    if (parent.parentId != null) throw new BadRequestException({ code: 'CATEGORY_DEPTH', message: 'مستويان فقط: قسم رئيسي ثم قسم فرعي' });
    if (selfId != null) {
      const kids = await this.prisma.productCategory.count({ where: { parentId: selfId } });
      if (kids > 0) throw new BadRequestException({ code: 'CATEGORY_DEPTH', message: 'هذا القسم عنده أقسام فرعية فلا يمكن جعله فرعياً' });
    }
  }

  async createCategory(dto: UpsertCategoryDto, a: Actor) {
    const parentId = dto.parentId ? BigInt(dto.parentId) : null;
    await this.assertParentOk(parentId);
    try {
      const c = await this.prisma.productCategory.create({
        data: { name: dto.name, slug: dto.slug, parentId, imageUrl: dto.imageUrl ?? null, description: dto.description ?? null, isActive: dto.isActive ?? true, sortOrder: dto.sortOrder ?? 0 },
      });
      await this.audit.log({ actorPublicId: a.publicId, action: 'CATEGORY_CREATE', entityType: 'ProductCategory', entityId: c.id.toString(), after: dto, ipAddress: a.ip });
      return { id: c.id.toString() };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException({ code: 'SLUG_TAKEN', message: 'هذا المعرّف (slug) مستخدم' });
      throw e;
    }
  }

  async updateCategory(id: bigint, dto: UpsertCategoryDto, a: Actor) {
    const before = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'القسم غير موجود' });
    const parentId = dto.parentId === undefined ? before.parentId : dto.parentId ? BigInt(dto.parentId) : null;
    await this.assertParentOk(parentId, id);
    try {
      await this.prisma.productCategory.update({
        where: { id },
        data: {
          name: dto.name, slug: dto.slug, parentId,
          ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException({ code: 'SLUG_TAKEN', message: 'هذا المعرّف (slug) مستخدم' });
      throw e;
    }
    await this.audit.log({ actorPublicId: a.publicId, action: 'CATEGORY_UPDATE', entityType: 'ProductCategory', entityId: id.toString(), before, after: dto, ipAddress: a.ip });
    return { ok: true };
  }

  // ───── products ─────
  async listProducts(q: { categoryId?: string; search?: string; page: number }) {
    const where: Prisma.ProductWhereInput = {
      ...(q.categoryId ? { categoryId: BigInt(q.categoryId) } : {}),
      ...(q.search ? { name: { contains: q.search } } : {}),
    };
    const limit = 50;
    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where, skip: (q.page - 1) * limit, take: limit, orderBy: { id: 'desc' },
        include: { category: true, services: { orderBy: { id: 'desc' }, include: { provider: true } } },
      }),
    ]);
    return {
      total, page: q.page, limit,
      products: rows.map((p) => {
        const s = p.services.find((x) => x.isActive) ?? p.services[0];
        return {
          id: p.id.toString(), name: p.name, categoryId: p.categoryId.toString(), categoryName: p.category.name,
          imageUrl: p.imageUrl, isActive: p.isActive, fields: (p.fields as { key: string; label: string }[] | null) ?? [],
          supplier: s ? {
            providerCode: s.provider.code, sku: s.providerSkuCode, costAmount: s.costAmount, costAssetCode: s.costAssetCode,
            marginType: s.marginType, marginValue: s.marginValue, manualPrice: s.manualPrice,
            priceAmount: s.priceAmount, priceAssetCode: s.priceAssetCode, inStock: s.supplierStock, serviceActive: s.isActive,
          } : null,
        };
      }),
    };
  }

  async getProduct(id: bigint) {
    const p = await this.prisma.product.findUnique({ where: { id }, include: { services: { include: { provider: true } } } });
    if (!p) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'المنتج غير موجود' });
    return {
      id: p.id.toString(), name: p.name, description: p.description, categoryId: p.categoryId.toString(),
      imageUrl: p.imageUrl, gallery: (p.gallery as string[] | null) ?? [], fields: (p.fields as { key: string; label: string }[] | null) ?? [], isActive: p.isActive, sortOrder: p.sortOrder,
      services: p.services.map((s) => ({ id: s.id.toString(), provider: s.provider.code, sku: s.providerSkuCode, isActive: s.isActive, priceAmount: s.priceAmount, priceAssetCode: s.priceAssetCode })),
    };
  }

  async createProduct(dto: UpsertProductDto, a: Actor) {
    const cat = await this.prisma.productCategory.findUnique({ where: { id: BigInt(dto.categoryId) } });
    if (!cat) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'القسم غير موجود' });
    const p = await this.prisma.product.create({
      data: {
        name: dto.name, categoryId: cat.id, description: dto.description ?? null, imageUrl: dto.imageUrl ?? null,
        gallery: dto.gallery ?? undefined, fields: cleanFields(dto.fields), isActive: dto.isActive ?? false, sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.log({ actorPublicId: a.publicId, action: 'PRODUCT_CREATE', entityType: 'Product', entityId: p.id.toString(), after: dto, ipAddress: a.ip });
    return { id: p.id.toString() };
  }

  async updateProduct(id: bigint, dto: UpsertProductDto, a: Actor) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'المنتج غير موجود' });
    await this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name, categoryId: BigInt(dto.categoryId),
        ...(dto.fields !== undefined && { fields: cleanFields(dto.fields) }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.gallery !== undefined && { gallery: dto.gallery }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
    await this.audit.log({ actorPublicId: a.publicId, action: 'PRODUCT_UPDATE', entityType: 'Product', entityId: id.toString(), before, after: dto, ipAddress: a.ip });
    return { ok: true };
  }

  // ───── pricing ─────
  private async activeService(productId: bigint) {
    const s = await this.prisma.providerService.findFirst({ where: { productId, isActive: true } });
    if (!s) throw new NotFoundException({ code: 'PRODUCT_UNAVAILABLE', message: 'لا يوجد مزوّد فعّال لهذا المنتج' });
    return s;
  }

  async setPricing(productId: bigint, dto: SetPricingDto, a: Actor) {
    const s = await this.activeService(productId);
    const data = {
      ...(dto.marginType !== undefined && { marginType: dto.marginType }),
      ...(dto.marginValue !== undefined && { marginValue: dto.marginValue }),
      ...(dto.manualPrice !== undefined && { manualPrice: dto.manualPrice }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    };
    // validate by computing BEFORE persisting
    const merged = { ...s, ...data };
    const price = await this.pricing.compute(merged);
    await this.prisma.providerService.update({ where: { id: s.id }, data: { ...data, priceAmount: price } });
    await this.audit.log({
      actorPublicId: a.publicId, action: 'PRICING_SET', entityType: 'ProviderService', entityId: s.id.toString(),
      before: { marginType: s.marginType, marginValue: s.marginValue, manualPrice: s.manualPrice, priceAmount: s.priceAmount }, after: { ...data, priceAmount: price }, ipAddress: a.ip,
    });
    return { priceAmount: price };
  }

  /** The "select many products → apply an instant margin" tool. Products without a synced cost are skipped and reported. */
  async bulkMargin(dto: BulkMarginDto, a: Actor) {
    const clear = dto.clearManualPrice !== false;
    const applied: string[] = [];
    const skipped: { productId: string; reason: string }[] = [];
    for (const pid of dto.productIds) {
      try {
        const s = await this.activeService(BigInt(pid));
        if (!s.costAmount || !s.costAssetCode) { skipped.push({ productId: pid, reason: 'لا توجد تكلفة من المزوّد' }); continue; }
        const next = { ...s, marginType: dto.marginType, marginValue: dto.marginValue, manualPrice: clear ? null : s.manualPrice };
        const price = await this.pricing.compute(next);
        await this.prisma.providerService.update({
          where: { id: s.id },
          data: { marginType: dto.marginType, marginValue: dto.marginValue, manualPrice: clear ? null : undefined, priceAmount: price },
        });
        applied.push(pid);
      } catch (e) {
        skipped.push({ productId: pid, reason: e instanceof Error ? e.message : 'خطأ' });
      }
    }
    await this.audit.log({ actorPublicId: a.publicId, action: 'PRICING_BULK_MARGIN', entityType: 'Product', after: { ...dto, applied: applied.length, skipped: skipped.length }, ipAddress: a.ip });
    return { applied: applied.length, skipped };
  }

  async bulkActive(dto: BulkActiveDto, a: Actor) {
    const ids = dto.productIds.map((x) => BigInt(x));
    const r = await this.prisma.product.updateMany({ where: { id: { in: ids } }, data: { isActive: dto.isActive } });
    await this.audit.log({ actorPublicId: a.publicId, action: 'PRODUCT_BULK_ACTIVE', entityType: 'Product', after: { count: r.count, isActive: dto.isActive }, ipAddress: a.ip });
    return { updated: r.count };
  }

  private catalogAdapter(code: string) {
    if (!this.registry.has(code)) throw new BadRequestException({ code: 'SUPPLIER_NOT_IMPLEMENTED', message: 'لا يوجد محوّل لهذا المزوّد بعد' });
    const adapter = this.registry.get(code);
    if (!isCatalogCapable(adapter)) throw new BadRequestException({ code: 'SUPPLIER_NO_CATALOG', message: 'هذا المزوّد لا يدعم جلب الكتالوج' });
    return adapter;
  }

  /** Supplier failures become a readable 502 for the admin instead of an opaque 500. */
  private async fetchCatalog(providerId: bigint, adapter: ProviderAdapter & CatalogCapableProvider) {
    try {
      return await this.logs.logCall({ providerId, action: 'LIST_CATALOG' }, () => adapter.listCatalog());
    } catch (e) {
      const status = (e as { httpStatus?: number }).httpStatus;
      const hint = status === 401 || status === 403 ? ' (تأكد من المفتاح، وأن المورد لا يشترط عنوان IP محدداً)' : '';
      throw new BadGatewayException({ code: 'SUPPLIER_ERROR', message: `${e instanceof Error ? e.message : 'تعذّر الاتصال بالمورد'}${hint}` });
    }
  }

  /** Live supplier catalog for the import screen, marking what is already imported. */
  async previewCatalog(code: string) {
    const provider = await this.logs.assertActiveProvider(code);
    const adapter = this.catalogAdapter(code);
    const items = await this.fetchCatalog(provider.id, adapter);
    const have = await this.prisma.providerService.findMany({ where: { providerId: provider.id }, select: { providerSkuCode: true } });
    const imported = new Set(have.map((h) => h.providerSkuCode));
    return items.map((i) => ({ ...i, imported: imported.has(i.sku) }));
  }

  /** Imports several supplier items at once: one category, one margin and one shared image for all (each editable afterwards). */
  async importItems(code: string, dto: ImportItemsDto, a: Actor) {
    const provider = await this.logs.assertActiveProvider(code);
    const adapter = this.catalogAdapter(code);
    const category = await this.prisma.productCategory.findUnique({ where: { id: BigInt(dto.categoryId) } });
    if (!category) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'القسم غير موجود' });
    const sale = await this.prisma.asset.findUnique({ where: { code: dto.saleAssetCode.toUpperCase() } });
    if (!sale || !sale.isActive) throw new BadRequestException({ code: 'ASSET_NOT_FOUND', message: 'عملة البيع غير موجودة' });

    const items = await this.fetchCatalog(provider.id, adapter);
    const bySku = new Map(items.map((i) => [i.sku, i]));
    const created: string[] = [];
    const skipped: { sku: string; reason: string }[] = [];
    for (const sku of new Set(dto.skus)) {
      const item = bySku.get(sku);
      if (!item) { skipped.push({ sku, reason: 'غير موجود لدى المزوّد' }); continue; }
      const exists = await this.prisma.providerService.findFirst({ where: { providerId: provider.id, providerSkuCode: sku } });
      if (exists) { skipped.push({ sku, reason: 'مستورد مسبقاً' }); continue; }
      try {
        const product = await this.prisma.product.create({
          data: {
            categoryId: category.id, name: item.name, imageUrl: dto.imageUrl ?? null, isActive: dto.activate ?? false,
            fields: cleanFields((item.params ?? []).map((k) => ({ key: k, label: labelFor(k) }))),
          },
        });
        const ps = await this.prisma.providerService.create({
          data: {
            productId: product.id, providerId: provider.id, providerSkuCode: sku, priceAssetCode: sale.code, priceAmount: item.costAmount,
            costAmount: item.costAmount, costAssetCode: item.costAssetCode, marginType: dto.marginType, marginValue: dto.marginValue,
            supplierStock: item.inStock, externalName: item.name, lastSyncedAt: new Date(), isActive: true,
          },
        });
        await this.pricing.recompute(ps.id);
        created.push(product.id.toString());
      } catch (e) {
        skipped.push({ sku, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    await this.audit.log({ actorPublicId: a.publicId, action: 'SUPPLIER_IMPORT', entityType: 'Provider', entityId: code, after: { categoryId: dto.categoryId, margin: `${dto.marginType}:${dto.marginValue}`, created: created.length, skipped: skipped.length }, ipAddress: a.ip });
    return { created: created.length, skipped };
  }

  async setSupplierCredential(code: string, apiKey: string, a: Actor) {
    const p = await this.prisma.provider.findUnique({ where: { code } });
    if (!p || !['shahnstore', 'shamekh_bot', 'canboso'].includes(code)) throw new NotFoundException({ code: 'PROVIDER_NOT_FOUND', message: 'المزوّد غير موجود' });
    await this.secrets.setCredential(p.id, 'api_key', apiKey.trim());
    await this.audit.log({ actorPublicId: a.publicId, action: 'SUPPLIER_KEY_SET', entityType: 'Provider', entityId: code, ipAddress: a.ip });
    return { ok: true };
  }

  async setSupplierStatus(code: string, status: 'ACTIVE' | 'DISABLED', a: Actor) {
    const p = await this.prisma.provider.findUnique({ where: { code } });
    if (!p || !['shahnstore', 'shamekh_bot', 'canboso'].includes(code)) throw new NotFoundException({ code: 'PROVIDER_NOT_FOUND', message: 'المزوّد غير موجود' });
    if (status === 'ACTIVE' && !(await this.secrets.getCredential(p.id, 'api_key'))) throw new BadRequestException({ code: 'NO_KEY', message: 'احفظ مفتاح المزوّد أولاً' });
    await this.prisma.provider.update({ where: { id: p.id }, data: { status } });
    await this.audit.log({ actorPublicId: a.publicId, action: 'SUPPLIER_STATUS', entityType: 'Provider', entityId: code, after: { status }, ipAddress: a.ip });
    return { ok: true };
  }

  async bulkImage(dto: BulkImageDto, a: Actor) {
    const ids = dto.productIds.map((x) => BigInt(x));
    const r = await this.prisma.product.updateMany({ where: { id: { in: ids } }, data: { imageUrl: dto.imageUrl ?? null } });
    await this.audit.log({ actorPublicId: a.publicId, action: 'PRODUCT_BULK_IMAGE', entityType: 'Product', after: { count: r.count, imageUrl: dto.imageUrl ?? null }, ipAddress: a.ip });
    return { updated: r.count };
  }

  async listSuppliers() {
    const rows = await this.prisma.provider.findMany({ where: { code: { in: ['shahnstore', 'shamekh_bot', 'canboso', 'mock'] } } });
    const out = [];
    for (const p of rows) out.push({ code: p.code, name: p.name, status: p.status, hasKey: !!(await this.secrets.getCredential(p.id, 'api_key')), implemented: this.registry.has(p.code) });
    return out;
  }
}
