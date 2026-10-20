import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from '../../src/modules/auth/auth.service';

function makePrismaMock(overrides: Partial<Record<string, any>> = {}) {
  return {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    reservedUsername: { findUnique: jest.fn().mockResolvedValue(null) },
    passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    session: { updateMany: jest.fn() },
    $transaction: jest.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
    ...overrides,
  } as any;
}

function makeTokensMock() {
  return {
    signAccessToken: jest.fn().mockReturnValue('signed.jwt.token'),
    issueSession: jest.fn().mockResolvedValue({ rawRefreshToken: 'raw-refresh', sessionPublicId: 'session-1' }),
    rotate: jest.fn(),
  } as any;
}

describe('AuthService.register — uniqueness enforcement', () => {
  it('rejects registration when the username is already taken', async () => {
    const prisma = makePrismaMock({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 1n }) // usernameLower lookup -> taken
          .mockResolvedValueOnce(null),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    });
    const service = new AuthService(prisma, makeTokensMock());

    await expect(
      service.register({ username: 'ahmad', email: 'a@example.com', password: 'a-strong-password' }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects registration when the email is already taken', async () => {
    const prisma = makePrismaMock({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null) // username free
          .mockResolvedValueOnce({ id: 2n }), // email taken
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    });
    const service = new AuthService(prisma, makeTokensMock());

    await expect(
      service.register({ username: 'newuser', email: 'taken@example.com', password: 'a-strong-password' }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('AuthService.login — generic errors + lockout', () => {
  it('returns a generic INVALID_CREDENTIALS error for a non-existent account (no existence leak)', async () => {
    const prisma = makePrismaMock({ user: { findFirst: jest.fn().mockResolvedValue(null) } });
    const service = new AuthService(prisma, makeTokensMock());

    await expect(
      service.login({ emailOrUsername: 'nobody@example.com', password: 'whatever' }, {}),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns the SAME generic error for a wrong password as for a non-existent account', async () => {
    const passwordHash = await argon2.hash('correct-password', { type: argon2.argon2id });
    const prisma = makePrismaMock({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 1n,
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
          status: 'ACTIVE',
          roles: [],
          publicId: 'pub-1',
          username: 'ahmad',
        }),
        update: jest.fn(),
      },
    });
    const service = new AuthService(prisma, makeTokensMock());

    let wrongPasswordError: any;
    let noAccountError: any;
    try {
      await service.login({ emailOrUsername: 'ahmad', password: 'wrong-password' }, {});
    } catch (e) {
      wrongPasswordError = e;
    }
    const prisma2 = makePrismaMock({ user: { findFirst: jest.fn().mockResolvedValue(null) } });
    const service2 = new AuthService(prisma2, makeTokensMock());
    try {
      await service2.login({ emailOrUsername: 'nobody', password: 'wrong-password' }, {});
    } catch (e) {
      noAccountError = e;
    }

    expect(wrongPasswordError.getResponse()).toEqual(noAccountError.getResponse());
  });

  it('locks the account after MAX_FAILED_LOGINS consecutive failures', async () => {
    const passwordHash = await argon2.hash('correct-password', { type: argon2.argon2id });
    const update = jest.fn();
    const prisma = makePrismaMock({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 1n,
          passwordHash,
          failedLoginCount: 4, // one more failure hits the threshold of 5
          lockedUntil: null,
          status: 'ACTIVE',
          roles: [],
          publicId: 'pub-1',
          username: 'ahmad',
        }),
        update,
      },
    });
    const service = new AuthService(prisma, makeTokensMock());

    await expect(service.login({ emailOrUsername: 'ahmad', password: 'wrong' }, {})).rejects.toThrow(
      UnauthorizedException,
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lockedUntil: expect.any(Date) }) }),
    );
  });

  it('rejects login for a FROZEN account even with the correct password', async () => {
    const passwordHash = await argon2.hash('correct-password', { type: argon2.argon2id });
    const prisma = makePrismaMock({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 1n,
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
          status: 'FROZEN',
          roles: [],
          publicId: 'pub-1',
          username: 'ahmad',
        }),
      },
    });
    const service = new AuthService(prisma, makeTokensMock());

    await expect(
      service.login({ emailOrUsername: 'ahmad', password: 'correct-password' }, {}),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthService.refresh — replay handling delegates to TokensService.rotate', () => {
  it('surfaces REFRESH_TOKEN_REPLAY as a 401 to the caller', async () => {
    const tokens = makeTokensMock();
    tokens.rotate.mockResolvedValue({ error: 'REFRESH_TOKEN_REPLAY' });
    const prisma = makePrismaMock();
    const service = new AuthService(prisma, tokens);

    await expect(service.refresh('some-raw-token', {})).rejects.toThrow(UnauthorizedException);
  });
});
