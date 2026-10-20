import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { PostKind } from '@prisma/client';
import type { Request } from 'express';
import { Public, Roles, RequirePermissions } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ContentService } from './content.service';
import { UpsertPostDto } from './content.dto';

@Controller()
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Public()
  @Get('content/posts')
  list(@Query('kind') kind?: string) {
    return this.content.listPublished(kind === 'NEWS' || kind === 'OFFER' ? (kind as PostKind) : undefined);
  }

  @Public()
  @Get('content/posts/:id')
  get(@Param('id') id: string) {
    return this.content.getPublished(id);
  }

  /** Login-page images, social links, announcement — whitelisted public site settings. */
  @Public()
  @Get('content/site')
  site() {
    return this.content.publicSite();
  }

  @Get('admin/content/posts')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('news.manage')
  adminList() {
    return this.content.adminList();
  }

  @Post('admin/content/posts')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('news.manage')
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: UpsertPostDto, @Req() r: Request) {
    return this.content.create(dto, u.publicId, r.ip);
  }

  @Put('admin/content/posts/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('news.manage')
  update(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertPostDto, @Req() r: Request) {
    return this.content.update(id, dto, u.publicId, r.ip);
  }

  @Delete('admin/content/posts/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('news.manage')
  remove(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Req() r: Request) {
    return this.content.remove(id, u.publicId, r.ip);
  }
}
