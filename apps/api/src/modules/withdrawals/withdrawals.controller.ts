import { BadRequestException, Body, Controller, Headers, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { WithdrawalsService } from './withdrawals.service';
import { CreateWithdrawalDto } from './dto/withdrawals.dto';

@Controller('withdrawals')
export class WithdrawalsController {
  constructor(private readonly withdrawals: WithdrawalsService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // tighter than transfers — real external money movement
  async createWithdrawal(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWithdrawalDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'يجب إرسال ترويسة Idempotency-Key مع كل عملية سحب',
      });
    }

    return this.withdrawals.createWithdrawal({
      userPublicId: user.publicId,
      providerCode: dto.providerCode,
      assetCode: dto.assetCode,
      amount: dto.amount,
      destination: dto.destination,
      action: dto.action,
      idempotencyKey: idempotencyKey.trim().slice(0, 128),
    });
  }
}
