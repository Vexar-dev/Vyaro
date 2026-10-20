import { Body, Controller, Delete, Get, Param, ParseEnumPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Roles, RequirePermissions } from '../../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { AdminUsersService } from './admin-users.service';
import { ListUsersQueryDto, SetUserStatusDto, AssignRoleDto } from './dto/admin-users.dto';

@Controller('admin/users')
@Roles('ADMIN', 'SUPER_ADMIN') // no one below ADMIN reaches ANY endpoint in this controller
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  @RequirePermissions('users.view')
  async list(@Query() query: ListUsersQueryDto) {
    return this.adminUsers.listUsers({
      search: query.search,
      status: query.status,
      page: query.page ? Math.max(parseInt(query.page, 10), 1) : 1,
      limit: query.limit ? Math.min(Math.max(parseInt(query.limit, 10), 1), 100) : 20,
    });
  }

  @Get(':publicId')
  @RequirePermissions('users.view')
  async get(@Param('publicId') publicId: string) {
    return this.adminUsers.getUser(publicId);
  }

  @Patch(':publicId/status')
  @RequirePermissions('users.freeze')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async setStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('publicId') publicId: string,
    @Body() dto: SetUserStatusDto,
    @Req() req: Request,
  ) {
    return this.adminUsers.setUserStatus({
      actorPublicId: actor.publicId,
      targetPublicId: publicId,
      newStatus: dto.status,
      reason: dto.reason,
      ipAddress: req.ip,
    });
  }

  @Post(':publicId/roles')
  @RequirePermissions('users.manage_roles')
  async assignRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('publicId') publicId: string,
    @Body() dto: AssignRoleDto,
    @Req() req: Request,
  ) {
    return this.adminUsers.assignRole({
      actorPublicId: actor.publicId,
      actorRoles: actor.roles,
      targetPublicId: publicId,
      roleCode: dto.roleCode,
      ipAddress: req.ip,
    });
  }

  @Delete(':publicId/roles/:roleCode')
  @RequirePermissions('users.manage_roles')
  async revokeRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('publicId') publicId: string,
    @Param('roleCode', new ParseEnumPipe(['SUPPORT', 'ADMIN', 'SUPER_ADMIN', 'STORE_ADMIN'])) roleCode: 'SUPPORT' | 'ADMIN' | 'SUPER_ADMIN' | 'STORE_ADMIN',
    @Req() req: Request,
  ) {
    return this.adminUsers.revokeRole({
      actorPublicId: actor.publicId,
      actorRoles: actor.roles,
      targetPublicId: publicId,
      roleCode,
      ipAddress: req.ip,
    });
  }
}
