import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { ConversionService } from './conversion.service';
import { ConversionController } from './conversion.controller';

@Module({
  imports: [DatabaseModule, WalletModule, TransactionsModule],
  controllers: [ConversionController],
  providers: [ConversionService],
  exports: [ConversionService],
})
export class ConversionModule {}
