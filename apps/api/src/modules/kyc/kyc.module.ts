import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { KycService } from './kyc.service';
import { AdminKycController, KycController } from './kyc.controller';

/** Global so Withdrawals / Deposits / Store / Transfers can call KycService.assertVerified without import wiring. */
@Global()
@Module({ imports: [DatabaseModule], controllers: [KycController, AdminKycController], providers: [KycService], exports: [KycService] })
export class KycModule {}
