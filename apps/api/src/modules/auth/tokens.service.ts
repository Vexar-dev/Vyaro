import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';

export interface AccessTokenPayload {
  sub: string; // user public_id
  username: string;
  roles: string[];
  permissions: string[];
}

const REFRESH_TOKEN_BYTES = 64;
const ROTATION_GRACE_MS = 10_000;

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
    });
  }

  private hashRefreshToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** Creates a new session row and returns the RAW refresh token (only time it ever exists in plaintext). */
  async issueSession(params: {
    userId: bigint;
    deviceName?: string;
    userAgent?: string;
    ipAddress?: string;
    replaces?: bigint; // previous session id, for rotation chain
  }): Promise<{ rawRefreshToken: string; sessionPublicId: string }> {
    const rawRefreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const refreshTokenHash = this.hashRefreshToken(rawRefreshToken);
    const ttlDays = Number(this.config.get<string>('REFRESH_TOKEN_TTL_DAYS') ?? '30');
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const session = await this.prisma.session.create({
      data: {
        userId: params.userId,
        refreshTokenHash,
        deviceName: params.deviceName,
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
        expiresAt,
      },
    });

    if (params.replaces) {
      await this.prisma.session.update({
        where: { id: params.replaces },
        data: { replacedBySessionId: session.id, revokedAt: new Date() },
      });
    }

    return { rawRefreshToken, sessionPublicId: session.publicId };
  }

  /**
   * Validates and ROTATES a refresh token. Returns the session + a new raw token.
   * If the presented token matches a session that was already rotated away
   * (replacedBySessionId set) this is a REPLAY — every descendant session in
   * the chain is revoked defensively and the caller must force re-login.
   */
  async rotate(rawRefreshToken: string, meta: { userAgent?: string; ipAddress?: string }) {
    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    const session = await this.prisma.session.findFirst({ where: { refreshTokenHash: tokenHash } });

    if (!session) return { error: 'INVALID_REFRESH_TOKEN' as const };
    if (session.revokedAt) {
      // A legitimate client can fire two refreshes at once (two tabs, React strict mode). If this token
      // was rotated away only moments ago, just reject this call; don't treat it as theft.
      const justRotated = session.replacedBySessionId != null && Date.now() - session.revokedAt.getTime() < ROTATION_GRACE_MS;
      if (justRotated) return { error: 'REFRESH_TOKEN_ROTATED' as const };
      // Replay of an old revoked token: revoke every live session of this user.
      await this.prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { error: 'REFRESH_TOKEN_REPLAY' as const };
    }
    if (session.expiresAt < new Date()) {
      return { error: 'REFRESH_TOKEN_EXPIRED' as const };
    }

    // Claim the token atomically: only ONE concurrent request can flip revokedAt from NULL.
    const claimed = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) return { error: 'REFRESH_TOKEN_ROTATED' as const };

    const { rawRefreshToken: newToken, sessionPublicId } = await this.issueSession({
      userId: session.userId,
      deviceName: session.deviceName ?? undefined,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      replaces: session.id,
    });

    return { userId: session.userId, rawRefreshToken: newToken, sessionPublicId };
  }

  /** Logout: revokes exactly the session that owns this refresh token (not "the user's latest session"). */
  async revokeByRawToken(rawRefreshToken: string) {
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: this.hashRefreshToken(rawRefreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeSession(sessionPublicId: string, userId: bigint) {
    await this.prisma.session.updateMany({
      where: { publicId: sessionPublicId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: bigint) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
