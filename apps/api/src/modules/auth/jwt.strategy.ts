import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import type { AccessTokenPayload } from './tokens.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * Runs on every authenticated request. The signature proves the token is ours, but roles/permissions/status
   * are re-read from the DB here — NOT trusted from the token — so freezing/banning a user or demoting an admin
   * takes effect on their very next request instead of after the access token's 15-minute expiry.
   */
  async validate(payload: AccessTokenPayload) {
    const user = await this.prisma.user.findUnique({
      where: { publicId: payload.sub },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    if (!user || user.status === 'BANNED' || user.status === 'FROZEN') {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'رمز الدخول غير صالح' });
    }
    return {
      id: user.id,
      publicId: user.publicId,
      username: user.username,
      roles: user.roles.map((ur) => ur.role.code),
      permissions: Array.from(new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code)))),
    };
  }
}
