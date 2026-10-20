import { Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/roles.decorator';
import { DepositMonitoringService } from './deposit-monitoring.service';

@Controller('webhooks/tatum')
export class DepositWebhookController {
  constructor(private readonly monitoring: DepositMonitoringService) {}

  /**
   * Public by necessity (Tatum, not a logged-in user, calls this) — the ONLY
   * trust boundary is the HMAC signature verified inside processWebhook().
   * req.rawBody is populated because main.ts calls
   * NestFactory.create(AppModule, { rawBody: true }) — required for the
   * signature check to run over the exact bytes Tatum sent.
   */
  @Public()
  @Post()
  async receive(@Req() req: Request): Promise<{ received: true }> {
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    await this.monitoring.processWebhook(rawBody, req.headers as Record<string, string | string[] | undefined>);
    // Always 200 — Tatum should not see errors/retries for things we've
    // already decided not to act on (bad signature, duplicate, mempool-only,
    // unrecognized address); processWebhook() logs those internally instead.
    return { received: true };
  }
}
