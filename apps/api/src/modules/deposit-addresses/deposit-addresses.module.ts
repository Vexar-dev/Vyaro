import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CustodyModule } from '../custody/custody.module';
import { DepositAddressesService } from './deposit-addresses.service';
import { DepositAddressesController } from './deposit-addresses.controller';

@Module({
  imports: [DatabaseModule, CustodyModule],
  controllers: [DepositAddressesController],
  providers: [DepositAddressesService],
  exports: [DepositAddressesService],
})
export class DepositAddressesModule {}
