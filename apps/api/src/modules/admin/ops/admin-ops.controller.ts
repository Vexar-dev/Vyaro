import { Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Roles, RequirePermissions } from '../../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { AuditService } from '../../../common/audit/audit.service';
import { WithdrawalsService } from '../../withdrawals/withdrawals.service';
import { StoreOrdersService } from '../../store/store-orders.service';
import { AdminOpsService } from './admin-ops.service';
import { ResolveDto, SetRateDto, SetSettingDto, StuckQuery } from './admin-ops.dto';

const minutes = (q: StuckQuery) => Math.min(Math.max(parseInt(q.minutes ?? '10', 10) || 10, 1), 10_080);

/** Site back office: money operations, wallet checks, FX rates, site settings. Never reachable by STORE_ADMIN. */
@Controller('admin/ops')
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminOpsController {
  constructor(
    private readonly ops: AdminOpsService,
    private readonly withdrawals: WithdrawalsService,
    private readonly orders: StoreOrdersService,
    private readonly audit: AuditService,
  ) {}

  @Get('withdrawals/stuck') @RequirePermissions('withdrawals.resolve')
  stuckWithdrawals(@Query() q: StuckQuery) { return this.withdrawals.listStuckWithdrawals(minutes(q)); }

  @Post('withdrawals/:id/resolve') @RequirePermissions('withdrawals.resolve') @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async resolveWithdrawal(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: ResolveDto, @Req() r: Request) {
    await this.withdrawals.resolveAmbiguousWithdrawal(id, dto.outcome, dto.providerOrderId);
    await this.audit.log({ actorPublicId: u.publicId, action: 'WITHDRAWAL_RESOLVED', entityType: 'Transaction', entityId: id, after: { outcome: dto.outcome, providerOrderId: dto.providerOrderId }, reason: dto.reason, ipAddress: r.ip });
    return { ok: true };
  }

  @Get('store-orders/stuck') @RequirePermissions('withdrawals.resolve')
  stuckOrders(@Query() q: StuckQuery) { return this.orders.listStuckOrders(minutes(q)); }

  @Post('store-orders/:id/resolve') @RequirePermissions('withdrawals.resolve') @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async resolveOrder(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: ResolveDto, @Req() r: Request) {
    await this.orders.resolveStuckOrder(id, dto.outcome, dto.providerOrderId);
    await this.audit.log({ actorPublicId: u.publicId, action: 'STORE_ORDER_RESOLVED', entityType: 'StoreOrder', entityId: id, after: { outcome: dto.outcome, providerOrderId: dto.providerOrderId }, reason: dto.reason, ipAddress: r.ip });
    return { ok: true };
  }

  @Get('wallets/:publicId') @RequirePermissions('wallets.view')
  wallet(@Param('publicId') id: string) { return this.ops.userWallet(id); }

  @Get('reconcile') @RequirePermissions('wallets.view') @Throttle({ default: { limit: 6, ttl: 60_000 } })
  reconcile() { return this.ops.reconcile(); }

  @Get('rates') @RequirePermissions('rates.manage')
  rates() { return this.ops.listRates(); }

  @Put('rates') @RequirePermissions('rates.manage')
  setRate(@CurrentUser() u: AuthenticatedUser, @Body() dto: SetRateDto, @Req() r: Request) { return this.ops.setRate(dto, u.publicId, r.ip); }

  @Get('settings') @RequirePermissions('settings.manage')
  settings() { return this.ops.getSettings(); }

  @Put('settings/:key') @RequirePermissions('settings.manage')
  setSetting(@CurrentUser() u: AuthenticatedUser, @Param('key') key: string, @Body() dto: SetSettingDto, @Req() r: Request) { return this.ops.setSetting(key, dto.value, u.publicId, r.ip); }
}
