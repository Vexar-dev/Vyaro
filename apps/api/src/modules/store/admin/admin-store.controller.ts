import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Roles, RequirePermissions } from '../../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { AdminStoreService } from './admin-store.service';
import { SupplierSyncService } from '../supplier-sync.service';
import { BulkActiveDto, BulkImageDto, BulkMarginDto, ImportItemsDto, SetCredentialDto, SetSupplierStatusDto, ListAdminProductsQuery, SetPricingDto, SyncSupplierDto, UpsertCategoryDto, UpsertProductDto } from './admin-store.dto';

const id = (v: string): bigint => {
  if (!/^\d+$/.test(v)) throw new BadRequestException({ code: 'BAD_ID', message: 'معرّف غير صالح' });
  return BigInt(v);
};

/** Store back office. STORE_ADMIN can reach ONLY this (and media upload); ADMIN / SUPER_ADMIN can too. */
@Controller('admin/store')
@Roles('STORE_ADMIN', 'ADMIN', 'SUPER_ADMIN')
@RequirePermissions('store.manage')
export class AdminStoreController {
  constructor(private readonly store: AdminStoreService, private readonly sync: SupplierSyncService) {}

  @Get('categories') categories() { return this.store.listCategories(); }
  @Post('categories') createCategory(@CurrentUser() u: AuthenticatedUser, @Body() dto: UpsertCategoryDto, @Req() r: Request) { return this.store.createCategory(dto, { publicId: u.publicId, ip: r.ip }); }
  @Put('categories/:id') updateCategory(@CurrentUser() u: AuthenticatedUser, @Param('id') i: string, @Body() dto: UpsertCategoryDto, @Req() r: Request) { return this.store.updateCategory(id(i), dto, { publicId: u.publicId, ip: r.ip }); }

  @Get('products') products(@Query() q: ListAdminProductsQuery) {
    return this.store.listProducts({ categoryId: q.categoryId, search: q.search, page: q.page ? Math.max(parseInt(q.page, 10), 1) : 1 });
  }
  @Get('products/:id') product(@Param('id') i: string) { return this.store.getProduct(id(i)); }
  @Post('products') createProduct(@CurrentUser() u: AuthenticatedUser, @Body() dto: UpsertProductDto, @Req() r: Request) { return this.store.createProduct(dto, { publicId: u.publicId, ip: r.ip }); }
  @Put('products/:id') updateProduct(@CurrentUser() u: AuthenticatedUser, @Param('id') i: string, @Body() dto: UpsertProductDto, @Req() r: Request) { return this.store.updateProduct(id(i), dto, { publicId: u.publicId, ip: r.ip }); }

  @Patch('products/:id/pricing') pricing(@CurrentUser() u: AuthenticatedUser, @Param('id') i: string, @Body() dto: SetPricingDto, @Req() r: Request) { return this.store.setPricing(id(i), dto, { publicId: u.publicId, ip: r.ip }); }
  @Post('products/bulk-margin') bulkMargin(@CurrentUser() u: AuthenticatedUser, @Body() dto: BulkMarginDto, @Req() r: Request) { return this.store.bulkMargin(dto, { publicId: u.publicId, ip: r.ip }); }
  @Post('products/bulk-active') bulkActive(@CurrentUser() u: AuthenticatedUser, @Body() dto: BulkActiveDto, @Req() r: Request) { return this.store.bulkActive(dto, { publicId: u.publicId, ip: r.ip }); }

  @Post('products/bulk-image') bulkImage(@CurrentUser() u: AuthenticatedUser, @Body() dto: BulkImageDto, @Req() r: Request) { return this.store.bulkImage(dto, { publicId: u.publicId, ip: r.ip }); }

  @Get('suppliers') suppliers() { return this.store.listSuppliers(); }
  @Get('suppliers/:code/catalog')
  @RequirePermissions('store.manage', 'store.suppliers')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  catalog(@Param('code') code: string) { return this.store.previewCatalog(code); }

  @Post('suppliers/:code/import')
  @RequirePermissions('store.manage', 'store.suppliers')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  importItems(@CurrentUser() u: AuthenticatedUser, @Param('code') code: string, @Body() dto: ImportItemsDto, @Req() r: Request) { return this.store.importItems(code, dto, { publicId: u.publicId, ip: r.ip }); }

  @Put('suppliers/:code/credential')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('store.manage', 'providers.manage')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  setCredential(@CurrentUser() u: AuthenticatedUser, @Param('code') code: string, @Body() dto: SetCredentialDto, @Req() r: Request) { return this.store.setSupplierCredential(code, dto.apiKey, { publicId: u.publicId, ip: r.ip }); }

  @Put('suppliers/:code/status')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('store.manage', 'providers.manage')
  setStatus(@CurrentUser() u: AuthenticatedUser, @Param('code') code: string, @Body() dto: SetSupplierStatusDto, @Req() r: Request) { return this.store.setSupplierStatus(code, dto.status, { publicId: u.publicId, ip: r.ip }); }

  @Post('suppliers/:code/sync')
  @RequirePermissions('store.manage', 'store.suppliers')
  @Throttle({ default: { limit: 3, ttl: 60_000 } }) // supplier APIs rate-limit with penalties — never hammer them
  syncSupplier(@Param('code') code: string, @Body() dto: SyncSupplierDto) { return this.sync.sync(code, dto.saleAssetCode.toUpperCase()); }
}
