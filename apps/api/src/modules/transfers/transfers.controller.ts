import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/transfers.dto';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  // Every route here reads the caller from the verified JWT (@CurrentUser), never
  // from a client-supplied id — same IDOR-safe pattern as UsersController/WalletController.

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // 10 transfers / minute / IP — financial-endpoint rate limit
  async createTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTransferDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    // Required, not optional: a financial POST with no idempotency key has no
    // protection against a double-submit (double-click, client retry on timeout).
    // The frontend must generate a fresh UUID per transfer attempt and reuse the
    // SAME one if it retries the same attempt.
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'يجب إرسال ترويسة Idempotency-Key مع كل عملية تحويل',
      });
    }

    return this.transfers.createTransfer({
      senderPublicId: user.publicId,
      toUsername: dto.toUsername,
      assetCode: dto.assetCode,
      amount: dto.amount,
      note: dto.note,
      idempotencyKey: idempotencyKey.trim().slice(0, 128),
    });
  }

  @Get()
  async listMyTransfers(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : undefined;
    return this.transfers.listMyTransfers(user.publicId, Number.isFinite(parsed) ? parsed : undefined);
  }

  @Get(':publicId')
  async getTransfer(@CurrentUser() user: AuthenticatedUser, @Param('publicId') publicId: string) {
    return this.transfers.getTransferReceipt(user.publicId, publicId);
  }
}
