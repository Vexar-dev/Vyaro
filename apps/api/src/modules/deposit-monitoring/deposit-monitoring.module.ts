import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ProvidersModule } from '../providers/providers.module';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { DepositMonitoringService } from './deposit-monitoring.service';
import { DepositWebhookController } from './deposit-webhook.controller';

@Module({
  // Deliberately does NOT import DepositAddressesModule — it reacts to
  // 'deposit-address.created' via EventEmitter2, not a direct import, to keep
  // the dependency direction one-way (see deposit-addresses.service.ts).
  imports: [DatabaseModule, ProvidersModule, WalletModule, TransactionsModule],
  controllers: [DepositWebhookController],
  providers: [DepositMonitoringService],
  exports: [DepositMonitoringService],
})
export class DepositMonitoringModule {}
