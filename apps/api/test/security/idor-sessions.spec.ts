import { NotFoundException } from '@nestjs/common';
import { UsersService } from '../../src/modules/users/users.service';

function makePrismaMock(overrides: Partial<Record<string, any>> = {}) {
  return {
    user: { findUnique: jest.fn() },
    userProfile: { findUnique: jest.fn(), update: jest.fn() },
    session: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    reservedUsername: { findUnique: jest.fn() },
    usernameChangeHistory: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
    ...overrides,
  } as any;
}

describe('UsersService — IDOR protection on sessions', () => {
  it('refuses to revoke a session that belongs to a different user (404, not 403 — no existence leak)', async () => {
    const attackerUser = { id: 1n, publicId: 'attacker-public-id' };
    const victimsSession = { id: 99n, publicId: 'victim-session-id', userId: 2n }; // belongs to user 2, not 1

    const prisma = makePrismaMock({
      user: { findUnique: jest.fn().mockResolvedValue(attackerUser) },
      session: {
        findUnique: jest.fn().mockResolvedValue(victimsSession),
        update: jest.fn(),
      },
    });

    const service = new UsersService(prisma);

    await expect(service.revokeMySession('attacker-public-id', 'victim-session-id')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  it('allows revoking a session that actually belongs to the caller', async () => {
    const ownerUser = { id: 1n, publicId: 'owner-public-id' };
    const ownSession = { id: 55n, publicId: 'own-session-id', userId: 1n };

    const prisma = makePrismaMock({
      user: { findUnique: jest.fn().mockResolvedValue(ownerUser) },
      session: {
        findUnique: jest.fn().mockResolvedValue(ownSession),
        update: jest.fn().mockResolvedValue({}),
      },
    });

    const service = new UsersService(prisma);
    const result = await service.revokeMySession('owner-public-id', 'own-session-id');

    expect(result).toEqual({ revoked: true });
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 55n },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
