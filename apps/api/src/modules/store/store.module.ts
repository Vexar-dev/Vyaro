import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { ProvidersModule } from '../providers/providers.module';
import { StoreCatalogService } from './store-catalog.service';
import { StoreCatalogController } from './store-catalog.controller';
import { StoreOrdersService } from './store-orders.service';
import { StoreOrdersController } from './store-orders.controller';
import { PricingService } from './pricing.service';
import { SupplierSyncService } from './supplier-sync.service';
import { AdminStoreService } from './admin/admin-store.service';
import { AdminStoreController } from './admin/admin-store.controller';

@Module({
  imports: [DatabaseModule, WalletModule, TransactionsModule, ProvidersModule],
  controllers: [StoreCatalogController, StoreOrdersController, AdminStoreController],
  providers: [StoreCatalogService, StoreOrdersService, PricingService, SupplierSyncService, AdminStoreService],
  exports: [StoreOrdersService, PricingService],
})
export class StoreModule {}
