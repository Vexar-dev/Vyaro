import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UsernamePolicy } from './username-policy';

const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the internal numeric user id from the caller's public_id (taken from the
   * verified JWT — never from a client-supplied param). Every "me/*" endpoint MUST go
   * through this instead of trusting a route param, which is the IDOR boundary.
   */
  async requireSelf(publicId: string) {
    const user = await this.prisma.user.findUnique({ where: { publicId } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });
    return user;
  }

  async getMyProfile(publicId: string) {
    const user = await this.requireSelf(publicId);
    const [profile, roleRows] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId: user.id } }),
      this.prisma.userRole.findMany({ where: { userId: user.id }, include: { role: true } }),
    ]);
    return {
      publicId: user.publicId,
      username: user.username,
      email: user.email,
      phone: user.phone,
      shamcashAddress: user.shamcashAddress,
      roles: roleRows.map((r) => r.role.code),
      status: user.status,
      twoFactorEnabled: user.twoFactorEnabled,
      fullName: profile?.fullName ?? null,
      locale: profile?.locale ?? 'ar',
    };
  }

  async updateMyProfile(publicId: string, data: { fullName?: string; locale?: string }) {
    const user = await this.requireSelf(publicId);
    await this.prisma.userProfile.update({
      where: { userId: user.id },
      data: { ...(data.fullName !== undefined && { fullName: data.fullName }), ...(data.locale && { locale: data.locale }) },
    });
    return this.getMyProfile(publicId);
  }

  /** Public, non-sensitive lookup — used to show the recipient's display name before a transfer is confirmed. */
  async findPublicByUsername(usernameRaw: string) {
    const usernameLower = UsernamePolicy.normalizeForLookup(usernameRaw);
    const user = await this.prisma.user.findUnique({ where: { usernameLower } });
    if (!user || user.status === 'BANNED') {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });
    }
    return { publicId: user.publicId, username: user.username, status: user.status };
  }

  async changeUsername(publicId: string, newUsernameRaw: string, reason?: string) {
    const user = await this.requireSelf(publicId);
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException({ code: 'ACCOUNT_NOT_ACTIVE', message: 'لا يمكن تغيير اسم المستخدم لهذا الحساب حاليًا' });
    }

    let newUsernameLower: string;
    try {
      newUsernameLower = UsernamePolicy.validateFormat(newUsernameRaw);
    } catch {
      throw new BadRequestException({ code: 'USERNAME_INVALID', message: 'اسم المستخدم غير صالح' });
    }

    if (newUsernameLower === user.usernameLower) {
      throw new ConflictException({ code: 'USERNAME_UNCHANGED', message: 'هذا هو اسم المستخدم الحالي بالفعل' });
    }

    const lastChange = await this.prisma.usernameChangeHistory.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (lastChange) {
      const cooldownEnds = new Date(
        lastChange.createdAt.getTime() + USERNAME_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
      );
      if (cooldownEnds > new Date()) {
        throw new ForbiddenException({
          code: 'USERNAME_CHANGE_COOLDOWN',
          message: `يمكنك تغيير اسم المستخدم مرة كل ${USERNAME_CHANGE_COOLDOWN_DAYS} يومًا فقط`,
        });
      }
    }

    const reserved = await this.prisma.reservedUsername.findUnique({ where: { username: newUsernameLower } });
    if (reserved) throw new ConflictException({ code: 'USERNAME_RESERVED', message: 'اسم المستخدم غير متاح' });

    const taken = await this.prisma.user.findUnique({ where: { usernameLower: newUsernameLower } });
    if (taken) throw new ConflictException({ code: 'USERNAME_TAKEN', message: 'اسم المستخدم مستخدم بالفعل' });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { username: newUsernameRaw.trim(), usernameLower: newUsernameLower },
      }),
      this.prisma.usernameChangeHistory.create({
        data: {
          userId: user.id,
          oldUsername: user.username,
          newUsername: newUsernameRaw.trim(),
          reason,
        },
      }),
    ]);

    return this.getMyProfile(publicId);
  }

  async listMySessions(publicId: string) {
    const user = await this.requireSelf(publicId);
    const sessions = await this.prisma.session.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        publicId: true,
        deviceName: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });
    return sessions;
  }

  /** Revokes a session — but ONLY if it belongs to the caller (ownership check, not just public_id lookup). */
  async revokeMySession(publicId: string, sessionPublicId: string) {
    const user = await this.requireSelf(publicId);
    const session = await this.prisma.session.findUnique({ where: { publicId: sessionPublicId } });
    if (!session || session.userId !== user.id) {
      // Same 404 whether the session doesn't exist or belongs to someone else — no existence leak.
      throw new NotFoundException({ code: 'SESSION_NOT_FOUND', message: 'الجلسة غير موجودة' });
    }
    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return { revoked: true };
  }
}
