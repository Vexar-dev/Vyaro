import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { TokensService } from './tokens.service';
import { UsernamePolicy } from '../users/username-policy';
import { RegisterDto, LoginDto } from './dto/auth.dto';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const RESET_TOKEN_TTL_MINUTES = 30;
// Real argon2id hash computed once on first use — only used to equalise timing for unknown accounts.
let dummyHashPromise: Promise<string> | undefined;
const getDummyHash = () => (dummyHashPromise ??= argon2.hash('vayro-timing-equaliser', { type: argon2.argon2id }));

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
  ) {}

  private hashResetToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  async register(dto: RegisterDto) {
    const usernameLower = UsernamePolicy.validateFormat(dto.username);

    const reserved = await this.prisma.reservedUsername.findUnique({
      where: { username: usernameLower },
    });
    if (reserved) throw new ConflictException({ code: 'USERNAME_RESERVED', message: 'اسم المستخدم غير متاح' });

    const [existingUsername, existingEmail, existingPhone, existingShamcash] = await Promise.all([
      this.prisma.user.findUnique({ where: { usernameLower } }),
      this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } }),
      this.prisma.user.findUnique({ where: { phone: dto.phone } }),
      this.prisma.user.findUnique({ where: { shamcashAddress: dto.shamcashAddress } }),
    ]);
    if (existingUsername) throw new ConflictException({ code: 'USERNAME_TAKEN', message: 'اسم المستخدم مستخدم بالفعل' });
    if (existingEmail) throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'البريد الإلكتروني مستخدم بالفعل' });
    if (existingPhone) throw new ConflictException({ code: 'PHONE_TAKEN', message: 'رقم الهاتف مستخدم بالفعل' });
    if (existingShamcash) throw new ConflictException({ code: 'SHAMCASH_TAKEN', message: 'عنوان شام كاش مستخدم بالفعل' });

    // Argon2id: memory-hard, side-channel resistant — the recommended password hash today.
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    // No email provider is wired yet, so there is no verification flow: with the default
    // (AUTO_ACTIVATE_USERS != 'false') new accounts are ACTIVE immediately. Set it to 'false' only
    // once email/phone verification exists — otherwise every account stays PENDING and can never
    // transfer, withdraw or buy (those paths require ACTIVE).
    const autoActivate = this.config.get<string>('AUTO_ACTIVATE_USERS') !== 'false';

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          username: dto.username.trim(),
          usernameLower,
          email: dto.email.toLowerCase(),
          phone: dto.phone, // already normalized to E.164 by the DTO; immutable afterwards (DB trigger)
          shamcashAddress: dto.shamcashAddress, // immutable afterwards (same trigger)
          passwordHash,
          status: autoActivate ? 'ACTIVE' : 'PENDING',
          roles: { create: { role: { connect: { code: 'USER' } } } },
          profile: { create: {} },
          // Wallet row is created by WalletService via the 'user.registered' event below.
        },
      });
    } catch (err) {
      // Two concurrent registrations can both pass the pre-checks above; the unique indexes decide.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({ code: 'ACCOUNT_EXISTS', message: 'اسم المستخدم أو البريد أو الرقم أو عنوان شام كاش مستخدم بالفعل' });
      }
      throw err;
    }

    this.events.emit('user.registered', { userId: user.id });

    return { publicId: user.publicId, username: user.username, email: user.email, phone: user.phone, shamcashAddress: user.shamcashAddress };
  }

  async login(dto: LoginDto, meta: { userAgent?: string; ipAddress?: string; deviceName?: string }) {
    const identifier = dto.emailOrUsername.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { usernameLower: identifier }] },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });

    // Generic message regardless of which check fails — never reveal account existence.
    const genericError = () =>
      new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'بيانات الدخول غير صحيحة' });

    if (!user) {
      // Burn a comparable amount of time so response latency doesn't reveal whether the account exists.
      await argon2.verify(await getDummyHash(), dto.password).catch(() => false);
      throw genericError();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message: 'الحساب مقفل مؤقتًا بسبب محاولات دخول فاشلة متكررة',
      });
    }

    if (user.status === 'BANNED' || user.status === 'FROZEN') {
      throw new UnauthorizedException({ code: 'ACCOUNT_UNAVAILABLE', message: 'لا يمكن تسجيل الدخول لهذا الحساب' });
    }

    const validPassword = await argon2.verify(user.passwordHash, dto.password).catch(() => false);
    if (!validPassword) {
      const failedCount = user.failedLoginCount + 1;
      const shouldLock = failedCount >= MAX_FAILED_LOGINS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: shouldLock ? 0 : failedCount,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
        },
      });
      throw genericError();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    const permissions = Array.from(
      new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code))),
    );
    const roles = user.roles.map((ur) => ur.role.code);

    const accessToken = this.tokens.signAccessToken({
      sub: user.publicId,
      username: user.username,
      roles,
      permissions,
    });
    const { rawRefreshToken, sessionPublicId } = await this.tokens.issueSession({
      userId: user.id,
      deviceName: meta.deviceName,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    return { accessToken, refreshToken: rawRefreshToken, sessionPublicId, user: { publicId: user.publicId, username: user.username, roles } };
  }

  async refresh(rawRefreshToken: string, meta: { userAgent?: string; ipAddress?: string }) {
    const result = await this.tokens.rotate(rawRefreshToken, meta);
    if ('error' in result) {
      throw new UnauthorizedException({ code: result.error, message: 'الجلسة غير صالحة، الرجاء تسجيل الدخول مجددًا' });
    }
    const user = await this.prisma.user.findUnique({
      where: { id: result.userId },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    if (!user) throw new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN', message: 'الجلسة غير صالحة' });

    const permissions = Array.from(
      new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code))),
    );
    const roles = user.roles.map((ur) => ur.role.code);
    const accessToken = this.tokens.signAccessToken({ sub: user.publicId, username: user.username, roles, permissions });

    return { accessToken, refreshToken: result.rawRefreshToken, sessionPublicId: result.sessionPublicId };
  }

  async logoutByRefreshToken(rawRefreshToken: string) {
    await this.tokens.revokeByRawToken(rawRefreshToken);
  }

  async logout(sessionPublicId: string, userId: bigint) {
    await this.tokens.revokeSession(sessionPublicId, userId);
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Always behave identically whether or not the account exists (timing/response-shape safe).
    if (user) {
      const rawToken = randomBytes(32).toString('hex');
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashResetToken(rawToken),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
        },
      });
      // TODO(Phase 6+): dispatch via a real email provider once documented. For now the
      // raw token is handed back only in non-production environments for manual testing.
      return { devOnlyToken: process.env.NODE_ENV !== 'production' ? rawToken : undefined };
    }
    return {};
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = this.hashResetToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: 'INVALID_RESET_TOKEN', message: 'رابط إعادة التعيين غير صالح أو منتهي' });
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Any password reset invalidates every existing session (defensive against session theft).
      this.prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }
}
