import { Controller, Get, NotFoundException } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { WalletService } from './wallet.service';
import { PrismaService } from '../../database/prisma.service';

@Controller('wallet')
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('me')
  async getMyWallet(@CurrentUser() user: AuthenticatedUser) {
    // Same IDOR-safe pattern as UsersController: resolve the internal id from the
    // verified JWT's public_id, never trust a client-supplied id.
    const dbUser = await this.prisma.user.findUnique({ where: { publicId: user.publicId } });
    if (!dbUser) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });
    return this.wallet.getBalances(dbUser.id);
  }
}
