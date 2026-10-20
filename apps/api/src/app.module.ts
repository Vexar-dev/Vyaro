import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { SecretsModule } from './common/secrets/secrets.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { HealthModule } from './modules/health/health.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { CustodyModule } from './modules/custody/custody.module';
import { DepositAddressesModule } from './modules/deposit-addresses/deposit-addresses.module';
import { DepositMonitoringModule } from './modules/deposit-monitoring/deposit-monitoring.module';
import { WithdrawalsModule } from './modules/withdrawals/withdrawals.module';
import { StoreModule } from './modules/store/store.module';
import { AdminUsersModule } from './modules/admin/users/admin-users.module';
import { AdminOpsModule } from './modules/admin/ops/admin-ops.module';
import { ConversionModule } from './modules/conversion/conversion.module';
import { ContentModule } from './modules/content/content.module';
import { KycModule } from './modules/kyc/kyc.module';
import { MediaModule } from './modules/media/media.module';
import { SettingsModule } from './modules/site/settings.service';
import { AuditModule } from './common/audit/audit.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    EventEmitterModule.forRoot(), // powers the decoupled Auth -> Wallet "user.registered" event
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }), // global default; tighter limits set per-route
    ScheduleModule.forRoot(), // powers @Cron in DepositMonitoringModule's confirmation checker
    DatabaseModule,
    SecretsModule,
    AuthModule,
    UsersModule,
    HealthModule,
    LedgerModule,
    WalletModule,
    TransactionsModule,
    TransfersModule,
    ProvidersModule,
    CustodyModule,
    DepositAddressesModule,
    DepositMonitoringModule,
    WithdrawalsModule,
    StoreModule,
    AdminUsersModule,
    SettingsModule,
    AuditModule,
    ConversionModule,
    ContentModule,
    MediaModule,
    KycModule,
    AdminOpsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard }, // protected-by-default; @Public() opts out
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
