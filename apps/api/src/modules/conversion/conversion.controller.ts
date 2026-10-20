import { BadRequestException, Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ConversionService } from './conversion.service';
import { ConvertDto } from './dto/conversion.dto';

@Controller('conversion')
export class ConversionController {
  constructor(private readonly conversion: ConversionService) {}

  @Get('rates')
  rates() {
    return this.conversion.listRates();
  }

  @Get('quote')
  quote(@Query('from') from: string, @Query('to') to: string, @Query('amount') amount: string) {
    return this.conversion.quote(String(from ?? ''), String(to ?? ''), String(amount ?? ''));
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  convert(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConvertDto, @Headers('idempotency-key') key?: string) {
    if (!key || !key.trim()) {
      throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'يجب إرسال ترويسة Idempotency-Key' });
    }
    return this.conversion.convert({
      userPublicId: user.publicId,
      fromAssetCode: dto.fromAssetCode,
      toAssetCode: dto.toAssetCode,
      amount: dto.amount,
      idempotencyKey: key.trim().slice(0, 128),
    });
  }
}
