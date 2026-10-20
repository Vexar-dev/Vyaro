import { Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { Public, Roles, RequirePermissions } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { MediaService } from './media.service';

@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('admin/media')
  @Roles('STORE_ADMIN', 'ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('media.upload')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  upload(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file?: { buffer: Buffer; size: number }) {
    return this.media.save(file, user.id ?? null);
  }

  @Get('admin/media')
  @Roles('STORE_ADMIN', 'ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('media.upload')
  list() {
    return this.media.list();
  }

  @Public()
  @Get('media/:name')
  async serve(@Param('name') name: string, @Res() res: Response) {
    const { data, mime } = await this.media.read(name);
    res.set({
      'Content-Type': mime,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cross-Origin-Resource-Policy': 'cross-origin', // helmet's default would block the web app (other origin) from showing it
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.send(data);
  }
}
