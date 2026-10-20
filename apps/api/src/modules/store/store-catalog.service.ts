import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * StoreCatalogService — read-only. Deliberately never returns providerId, providerSkuCode, cost, margin or
 * anything else about HOW a product is fulfilled or what it costs us — a client only needs WHAT it costs
 * and WHETHER it's available. Swapping a product's supplier is invisible to clients.
 */
@Injectable()
export class StoreCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Flat list; `parentSlug` lets the client build the two-level tree (ألعاب موبايل > ببجي). */
  async listCategories() {
    const categories = await this.prisma.productCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { parent: true },
    });
    return categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      imageUrl: c.imageUrl,
      description: c.description,
      parentSlug: c.parent?.slug ?? null,
    }));
  }

  async listProducts(categorySlug?: string) {
    let categoryFilter = {};
    if (categorySlug) {
      // a parent category shows its own products plus its children's
      categoryFilter = { category: { OR: [{ slug: categorySlug }, { parent: { slug: categorySlug } }], isActive: true } };
    }
    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        ...categoryFilter,
        services: { some: { isActive: true, supplierStock: true } }, // only products with an actual, in-stock fulfillment path
      },
      include: { category: true, services: { where: { isActive: true }, take: 1 } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    // cheapest first (decimal strings compared numerically); ties keep the admin's sort order
    return products
      .map((p) => this.toView(p, p.services[0]))
      .sort((a, b) => (parseFloat(a.priceAmount ?? '0') || 0) - (parseFloat(b.priceAmount ?? '0') || 0));
  }

  async getProduct(productId: bigint) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { category: true, services: { where: { isActive: true }, take: 1 } },
    });
    if (!product || !product.isActive) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'المنتج غير موجود' });
    }
    const activeService = product.services[0];
    if (!activeService) {
      throw new NotFoundException({ code: 'PRODUCT_UNAVAILABLE', message: 'المنتج غير متاح حاليًا' });
    }
    return { ...this.toView(product, activeService), gallery: (product.gallery as string[] | null) ?? [] };
  }

  private toView(
    p: { id: bigint; name: string; description: string | null; imageUrl: string | null; fields?: unknown; category: { slug: string; imageUrl: string | null } },
    s?: { priceAssetCode: string; priceAmount: string; supplierStock: boolean },
  ) {
    return {
      productId: p.id.toString(),
      name: p.name,
      description: p.description,
      // product image, falling back to its category's logo
      imageUrl: p.imageUrl ?? p.category.imageUrl,
      categorySlug: p.category.slug,
      fields: (p.fields as { key: string; label: string }[] | null) ?? [],
      priceAssetCode: s?.priceAssetCode ?? null,
      priceAmount: s?.priceAmount ?? null,
      inStock: s?.supplierStock ?? false,
    };
  }
}
