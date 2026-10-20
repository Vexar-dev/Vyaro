import { Injectable } from '@nestjs/common';
import { ProviderAdapter } from './provider-adapter.interface';

/**
 * ProviderRegistry — Master Prompt §9: "أريد أن أستطيع إضافة Provider جديد عن
 * طريق إنشاء Adapter جديد وتسجيله في النظام، بدون تعديل عشرات الملفات."
 *
 * Any future consumer (TransfersService-equivalent for deposits, Store order
 * processing, an Admin "test provider" button, etc.) resolves an adapter by
 * `providers.code` through this registry — it NEVER imports a concrete adapter
 * class directly. That is the entire point: swapping "Provider A" for
 * "Provider B" behind the same code, or adding a brand-new code, touches only
 * ProvidersModule's registration list, never the callers.
 */
@Injectable()
export class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    if (this.adapters.has(adapter.code)) {
      throw new Error(`ProviderRegistry: an adapter is already registered for code "${adapter.code}"`);
    }
    this.adapters.set(adapter.code, adapter);
  }

  /** Throws if nothing is registered for this code — callers should catch and map to PROVIDER_UNAVAILABLE. */
  get<T extends ProviderAdapter = ProviderAdapter>(code: string): T {
    const adapter = this.adapters.get(code);
    if (!adapter) {
      throw new Error(`ProviderRegistry: no adapter registered for code "${code}"`);
    }
    return adapter as T;
  }

  has(code: string): boolean {
    return this.adapters.has(code);
  }

  /** Every registered provider code — used by health checks / admin tooling, never by business logic. */
  list(): string[] {
    return [...this.adapters.keys()];
  }
}
