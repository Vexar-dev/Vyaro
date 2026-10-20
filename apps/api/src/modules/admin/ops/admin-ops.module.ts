import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../database/database.module';
import { WithdrawalsModule } from '../../withdrawals/withdrawals.module';
import { StoreModule } from '../../store/store.module';
import { AdminOpsService } from './admin-ops.service';
import { AdminOpsController } from './admin-ops.controller';

@Module({
  imports: [DatabaseModule, WithdrawalsModule, StoreModule],
  controllers: [AdminOpsController],
  providers: [AdminOpsService],
})
export class AdminOpsModule {}
