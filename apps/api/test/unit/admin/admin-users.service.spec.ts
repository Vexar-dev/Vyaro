import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminUsersService } from '../../../src/modules/admin/users/admin-users.service';

function makeFakeDb() {
  const users = new Map<bigint, any>([
    [1n, { id: 1n, publicId: 'admin-1', username: 'admin', email: 'admin@x.com', status: 'ACTIVE' }],
    [2n, { id: 2n, publicId: 'user-1', username: 'someuser', email: 'user@x.com', status: 'ACTIVE' }],
  ]);
  const roles = new Map<string, any>([
    ['SUPPORT', { id: 1n, code: 'SUPPORT' }],
    ['ADMIN', { id: 2n, code: 'ADMIN' }],
    ['SUPER_ADMIN', { id: 3n, code: 'SUPER_ADMIN' }],
  ]);
  const userRoles = new Set<string>(); // key: `${userId}:${roleId}`
  const sessions: any[] = [{ id: 1n, userId: 2n, revokedAt: null }];
  const auditLogs: any[] = [];

  const db: any = {
    _userRoles: userRoles,
    _sessions: sessions,
    _auditLogs: auditLogs,
    _users: users,

    user: {
      findUnique: jest.fn(async ({ where }: any) => {
        const found = [...users.values()].find((u) => u.publicId === where.publicId);
        if (!found) return null;
        const userRoleCodes = [...userRoles]
          .filter((key) => key.startsWith(`${found.id}:`))
          .map((key) => key.split(':')[1])
          .map((roleId) => [...roles.values()].find((r) => r.id === BigInt(roleId)))
          .filter(Boolean);
        return { ...found, roles: userRoleCodes.map((r) => ({ role: r })), profile: null };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const u = users.get(where.id);
        Object.assign(u, data);
        return u;
      }),
    },
    role: { findUnique: jest.fn(async ({ where }: any) => roles.get(where.code) ?? null) },
    userRole: {
      findUnique: jest.fn(async ({ where }: any) => {
        const { userId, roleId } = where.userId_roleId;
        return userRoles.has(`${userId}:${roleId}`) ? { userId, roleId } : null;
      }),
      create: jest.fn(async ({ data }: any) => {
        userRoles.add(`${data.userId}:${data.roleId}`);
        return data;
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        userRoles.delete(`${where.userId}:${where.roleId}`);
        return { count: 1 };
      }),
    },
    session: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const s of sessions) {
          if (s.userId === where.userId && s.revokedAt === null) {
            Object.assign(s, data);
            count++;
          }
        }
        return { count };
      }),
    },
    auditLog: {
      create: jest.fn(async ({ data }: any) => {
        auditLogs.push(data);
        return data;
      }),
    },
    $transaction: jest.fn(async (fn: any) => fn(db)),
  };

  return db;
}

describe('AdminUsersService.setUserStatus', () => {
  it('rejects self-modification', async () => {
    const db = makeFakeDb();
    const service = new AdminUsersService(db);
    await expect(
      service.setUserStatus({ actorPublicId: 'admin-1', targetPublicId: 'admin-1', newStatus: 'FROZEN' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('freezes a user, revokes their active sessions, and writes an audit log', async () => {
    const db = makeFakeDb();
    const service = new AdminUsersService(db);

    const result = await service.setUserStatus({
      actorPublicId: 'admin-1',
      targetPublicId: 'user-1',
      newStatus: 'FROZEN',
      reason: 'suspicious activity',
      ipAddress: '1.2.3.4',
    });

    expect(result.status).toBe('FROZEN');
    expect(db._sessions[0].revokedAt).not.toBeNull();
    expect(db._auditLogs).toHaveLength(1);
    expect(db._auditLogs[0]).toMatchObject({
      action: 'USER_STATUS_CHANGE',
      entityId: 'user-1',
      reason: 'suspicious activity',
      ipAddress: '1.2.3.4',
    });
  });

  it('is idempotent: setting the same status again does not write a duplicate audit log', async () => {
    const db = makeFakeDb();
    const service = new AdminUsersService(db);
    await service.setUserStatus({ actorPublicId: 'admin-1', targetPublicId: 'user-1', newStatus: 'FROZEN' });
    await service.setUserStatus({ actorPublicId: 'admin-1', targetPublicId: 'user-1', newStatus: 'FROZEN' });
    expect(db._auditLogs).toHaveLength(1);
  });

  it('does NOT revoke sessions when reactivating (ACTIVE)', async () => {
    const db = makeFakeDb();
    const service = new AdminUsersService(db);
    await service.setUserStatus({ actorPublicId: 'admin-1', targetPublicId: 'user-1', newStatus: 'ACTIVE' });
    // status was already ACTIVE -> no-op, but confirm session untouched regardless
    expect(db._sessions[0].revokedAt).toBeNull();
  });
});

describe('AdminUsersService privilege-escalation guard', () => {
  it('an actor without SUPER_ADMIN cannot grant the ADMIN role', async () => {
    const db = makeFakeDb();
    const service = new AdminUsersService(db);
    await expect(
      service.assignRole({ actorPublicId: 'admin-1', actorRoles: ['ADMIN'], targetPublicId: 'user-1', roleCode: 'ADMIN' }),
    ).rejects.toThrow(ForbiddenException);
    expect(db._userRoles.size).toBe(0);
  });

  it('an actor without SUPER_ADMIN cannot grant SUPER_ADMIN either', async () => {
    const db = makeFakeDb();
    const service = new AdminUsersService(db);
    await expect(
      service.assignRole({ actorPublicId: 'admin-1', actorRoles: ['ADMIN'], targetPublicId: 'user-1', roleCode: 'SUPER_ADMIN' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('a SUPER_ADMIN CAN grant ADMIN, and it is recorded in the audit log', async () => {
    const db = makeFakeDb();
    const service = new AdminUsersService(db);
    const result = await service.assignRole({
      actorPublicId: 'admin-1',
      actorRoles: ['SUPER_ADMIN'],
      targetPublicId: 'user-1',
      roleCode: 'ADMIN',
    });
    expect(result.roles).toContain('ADMIN');
    expect(db._auditLogs[0].action).toBe('ROLE_ASSIGNED');
  });

  it('anyone with users.manage_roles (regardless of SUPER_ADMIN) can grant the lower-privilege SUPPORT role', async () => {
    const db = makeFakeDb();
    const service = new AdminUsersService(db);
    const result = await service.assignRole({
      actorPublicId: 'admin-1',
      actorRoles: ['ADMIN'],
      targetPublicId: 'user-1',
      roleCode: 'SUPPORT',
    });
    expect(result.roles).toContain('SUPPORT');
  });

  it('assigning a role a user already has is a no-op (no duplicate audit log)', async () => {
    const db = makeFakeDb();
    const service = new AdminUsersService(db);
    await service.assignRole({ actorPublicId: 'admin-1', actorRoles: ['SUPER_ADMIN'], targetPublicId: 'user-1', roleCode: 'SUPPORT' });
    await service.assignRole({ actorPublicId: 'admin-1', actorRoles: ['SUPER_ADMIN'], targetPublicId: 'user-1', roleCode: 'SUPPORT' });
    expect(db._auditLogs).toHaveLength(1);
  });

  it('a SUPER_ADMIN cannot revoke their OWN SUPER_ADMIN role', async () => {
    const db = makeFakeDb();
    // give admin-1 SUPER_ADMIN for this test
    db._userRoles.add('1:3');
    const service = new AdminUsersService(db);
    await expect(
      service.revokeRole({ actorPublicId: 'admin-1', actorRoles: ['SUPER_ADMIN'], targetPublicId: 'admin-1', roleCode: 'SUPER_ADMIN' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws USER_NOT_FOUND for an unknown target', async () => {
    const db = makeFakeDb();
    const service = new AdminUsersService(db);
    await expect(service.getUser('nonexistent')).rejects.toThrow(NotFoundException);
  });
});
