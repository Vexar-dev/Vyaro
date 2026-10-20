import { Module, OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ProviderRegistry } from './provider-registry.service';
import { ProviderLogService } from './provider-log.service';
import { MockProviderAdapter } from './adapters/mock/mock-provider.adapter';
import { ShamCashAdapter } from './adapters/tsa/shamcash.adapter';
import { SyriatelAdapter } from './adapters/tsa/syriatel.adapter';
import { ShahnAdapter } from './adapters/shahn/shahn.adapter';
import { TatumAdapter } from './adapters/tatum/tatum.adapter';

@Module({
  // SecretsModule is @Global() (see common/secrets/secrets.module.ts) so SecretsService
  // is available to every adapter below without importing it here explicitly.
  imports: [DatabaseModule],
  providers: [ProviderRegistry, ProviderLogService, MockProviderAdapter, ShamCashAdapter, SyriatelAdapter, TatumAdapter, ShahnAdapter],
  exports: [ProviderRegistry, ProviderLogService, TatumAdapter, ShahnAdapter],
})
export class ProvidersModule implements OnModuleInit {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly mockAdapter: MockProviderAdapter,
    private readonly shamCashAdapter: ShamCashAdapter,
    private readonly syriatelAdapter: SyriatelAdapter,
    private readonly shahnAdapter: ShahnAdapter,
    // Adding a real provider later: write AdapterX implementing the relevant
    // capability interface(s) in adapters/<name>/, add it to `providers` above,
    // inject it here, and register it below. That is the ONLY file that
    // changes — see Master Prompt §9 / §39.
  ) {}

  onModuleInit() {
    this.registry.register(this.mockAdapter);
    this.registry.register(this.shamCashAdapter);
    this.registry.register(this.syriatelAdapter);
    this.registry.register(this.shahnAdapter);
  }
}
