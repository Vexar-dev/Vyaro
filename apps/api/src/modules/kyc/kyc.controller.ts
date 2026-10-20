import { Body, Controller, Get, Param, Post, Query, Req, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { Roles, RequirePermissions } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { KycService } from './kyc.service';
import { ListKycQuery, ReviewKycDto, SubmitKycDto } from './kyc.dto';

type Upload = { buffer: Buffer; size: number };

@Controller('kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get('me')
  me(@CurrentUser() u: AuthenticatedUser) {
    return this.kyc.myStatus(u.id);
  }

  @Post('submit')
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'front', maxCount: 1 }, { name: 'back', maxCount: 1 }, { name: 'selfie', maxCount: 1 }],
      { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 3 } },
    ),
  )
  submit(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: SubmitKycDto,
    @UploadedFiles() files: { front?: Upload[]; back?: Upload[]; selfie?: Upload[] },
  ) {
    return this.kyc.submit(u.id, dto, { front: files?.front?.[0], back: files?.back?.[0], selfie: files?.selfie?.[0] });
  }
}

/** Reviewer back office. Never reachable by STORE_ADMIN. */
@Controller('admin/kyc')
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminKycController {
  constructor(private readonly kyc: KycService) {}

  @Get() @RequirePermissions('kyc.review')
  list(@Query() q: ListKycQuery) { return this.kyc.list(q.status); }

  @Get(':id') @RequirePermissions('kyc.review')
  detail(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Req() r: Request) { return this.kyc.detail(id, u.publicId, r.ip); }

  @Get(':id/file/:kind') @RequirePermissions('kyc.review') @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async file(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Param('kind') kind: string, @Req() r: Request, @Res() res: Response) {
    const { data, mime } = await this.kyc.file(id, kind, u.publicId, r.ip);
    res.set({
      'Content-Type': mime,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cache-Control': 'no-store',
    });
    res.send(data);
  }

  @Post(':id/review') @RequirePermissions('kyc.review') @Throttle({ default: { limit: 60, ttl: 60_000 } })
  review(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: ReviewKycDto, @Req() r: Request) {
    return this.kyc.review(id, dto.outcome, dto.note, u.publicId, r.ip);
  }
}
