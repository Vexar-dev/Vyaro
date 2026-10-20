import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { DatabaseModule } from '../../database/database.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [DatabaseModule, LedgerModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
