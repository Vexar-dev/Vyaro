import { Controller, Get, NotFoundException } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { DepositAddressesService } from './deposit-addresses.service';
import { NetworkCode } from '../custody/custody-key.service';
import { KycService } from '../kyc/kyc.service';

@Controller('deposit-addresses')
export class DepositAddressesController {
  constructor(
    private readonly deposits: DepositAddressesService,
    private readonly prisma: PrismaService,
    private readonly kyc: KycService,
  ) {}

  /**
   * Returns one address per currently-active network for the caller,
   * creating any that don't exist yet. IDOR-safe: the internal id is
   * resolved from the verified JWT, never from any client-supplied value.
   */
  @Get()
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    const dbUser = await this.prisma.user.findUnique({ where: { publicId: user.publicId } });
    if (!dbUser) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });

    // Addresses are only generated for verified users (admin can relax this in settings: kyc.requirements).
    await this.kyc.assertVerified(dbUser.id, 'depositAddresses');

    const networks = await this.prisma.network.findMany({ where: { isActive: true } });
    const results = [];
    for (const network of networks) {
      const address = await this.deposits.getOrCreateDepositAddress(dbUser.id, network.code as NetworkCode);
      results.push({ networkCode: network.code, networkName: network.name, address: address.address });
    }
    return results;
  }
}
