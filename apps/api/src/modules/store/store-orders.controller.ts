import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { StoreOrdersService } from './store-orders.service';
import { CreateStoreOrderDto } from './dto/store-orders.dto';

@Controller('store/orders')
export class StoreOrdersController {
  constructor(private readonly orders: StoreOrdersService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStoreOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'يجب إرسال ترويسة Idempotency-Key مع كل عملية شراء',
      });
    }
    if (!/^\d+$/.test(dto.productId)) {
      throw new BadRequestException({ code: 'PRODUCT_NOT_FOUND', message: 'المنتج غير موجود' });
    }

    return this.orders.createOrder({
      userPublicId: user.publicId,
      productId: BigInt(dto.productId),
      quantity: dto.quantity,
      purchaseMetadata: dto.purchaseMetadata,
      idempotencyKey: idempotencyKey.trim().slice(0, 128),
    });
  }

  @Get()
  async listMine(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : undefined;
    return this.orders.listMyOrders(user.publicId, Number.isFinite(parsed) ? parsed : undefined);
  }

  @Get(':publicId')
  async getOrder(@CurrentUser() user: AuthenticatedUser, @Param('publicId') publicId: string) {
    return this.orders.getMyOrder(user.publicId, publicId);
  }
}
