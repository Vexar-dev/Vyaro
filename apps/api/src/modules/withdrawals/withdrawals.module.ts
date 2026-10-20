import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { ProvidersModule } from '../providers/providers.module';
import { WithdrawalsService } from './withdrawals.service';
import { WithdrawalsController } from './withdrawals.controller';

@Module({
  imports: [DatabaseModule, WalletModule, TransactionsModule, ProvidersModule],
  controllers: [WithdrawalsController],
  providers: [WithdrawalsService],
  exports: [WithdrawalsService],
})
export class WithdrawalsModule {}
