import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

type UserStatusValue = 'PENDING' | 'ACTIVE' | 'FROZEN' | 'BANNED';
type RoleCodeValue = 'SUPPORT' | 'ADMIN' | 'SUPER_ADMIN' | 'STORE_ADMIN';

/**
 * AdminUsersService — Phase 9, part 1.
 *
 * Two security properties enforced HERE, in code, not just via the
 * @RequirePermissions() on the controller (which only gates WHETHER a caller
 * reaches these methods at all):
 *
 *  1. No self-modification: a caller can never freeze/ban themselves, nor
 *     revoke their own SUPER_ADMIN role — this is a lockout guard, not a
 *     trust boundary the caller could routinely need to bypass.
 *
 *  2. Privilege escalation guard: granting or revoking the ADMIN or
 *     SUPER_ADMIN role requires the CALLER to currently hold SUPER_ADMIN —
 *     `users.manage_roles` alone is not enough. This means a compromised
 *     ADMIN account (which the seed does NOT grant users.manage_roles to by
 *     default anyway) can never mint itself — or anyone else — into
 *     SUPER_ADMIN even if that permission were somehow granted to it later.
 *
 * Every mutation here writes an AuditLog row — actor, before/after, reason,
 * IP — the same audit_logs table Phase 1 already provisioned for this.
 */
@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(params: { search?: string; status?: UserStatusValue; page: number; limit: number }) {
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [{ username: { contains: params.search } }, { email: { contains: params.search } }];
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        include: { roles: { include: { role: true } } },
      }),
    ]);

    return {
      total,
      page: params.page,
      limit: params.limit,
      users: users.map((u) => ({
        publicId: u.publicId,
        username: u.username,
        email: u.email,
        status: u.status,
        roles: u.roles.map((r) => r.role.code),
        createdAt: u.createdAt,
      })),
    };
  }

  async getUser(publicId: string) {
    const user = await this.prisma.user.findUnique({
      where: { publicId },
      include: { roles: { include: { role: true } }, profile: true },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });

    return {
      publicId: user.publicId,
      username: user.username,
      email: user.email,
      phone: user.phone,
      status: user.status,
      roles: user.roles.map((r) => r.role.code),
      fullName: user.profile?.fullName ?? null,
      createdAt: user.createdAt,
    };
  }

  async setUserStatus(params: {
    actorPublicId: string;
    targetPublicId: string;
    newStatus: 'ACTIVE' | 'FROZEN' | 'BANNED';
    reason?: string;
    ipAddress?: string;
  }) {
    const actor = await this.prisma.user.findUnique({ where: { publicId: params.actorPublicId } });
    if (!actor) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });
    const target = await this.prisma.user.findUnique({ where: { publicId: params.targetPublicId } });
    if (!target) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });

    if (actor.id === target.id) {
      throw new ForbiddenException({ code: 'CANNOT_MODIFY_SELF', message: 'لا يمكنك تغيير حالة حسابك الخاص' });
    }
    if (target.status === params.newStatus) {
      return this.getUser(params.targetPublicId); // idempotent no-op
    }

    const before = { status: target.status };
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { status: params.newStatus } });

      if (params.newStatus !== 'ACTIVE') {
        // Closes the refresh-token/long-term-session angle. The user's
        // CURRENT access token (≤15m, JWT_ACCESS_TTL) stays technically valid
        // until it naturally expires — JWTs are stateless and not re-checked
        // against the DB per-request (see docs/09_ADMIN_DASHBOARD.txt §1) —
        // but every money-moving action (Transfers/Withdrawals/StoreOrders)
        // already re-checks live status inside its own DB transaction
        // regardless, so the real financial exposure window is effectively
        // zero; this closes the read-only/long-lived-session angle.
        await tx.session.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'USER_STATUS_CHANGE',
          entityType: 'User',
          entityId: target.publicId,
          before,
          after: { status: params.newStatus },
          reason: params.reason ?? null,
          ipAddress: params.ipAddress ?? null,
        },
      });
    });

    return this.getUser(params.targetPublicId);
  }

  async assignRole(params: {
    actorPublicId: string;
    actorRoles: string[];
    targetPublicId: string;
    roleCode: RoleCodeValue;
    ipAddress?: string;
  }) {
    this.assertCanManageRole(params.roleCode, params.actorRoles);

    const actor = await this.prisma.user.findUnique({ where: { publicId: params.actorPublicId } });
    const target = await this.prisma.user.findUnique({ where: { publicId: params.targetPublicId } });
    if (!actor || !target) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });

    const role = await this.prisma.role.findUnique({ where: { code: params.roleCode } });
    if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'الدور غير موجود' });

    const existing = await this.prisma.userRole.findUnique({ where: { userId_roleId: { userId: target.id, roleId: role.id } } });
    if (existing) return this.getUser(params.targetPublicId); // idempotent no-op

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.create({ data: { userId: target.id, roleId: role.id } });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'ROLE_ASSIGNED',
          entityType: 'User',
          entityId: target.publicId,
          after: { roleCode: params.roleCode },
          ipAddress: params.ipAddress ?? null,
        },
      });
    });

    return this.getUser(params.targetPublicId);
  }

  async revokeRole(params: {
    actorPublicId: string;
    actorRoles: string[];
    targetPublicId: string;
    roleCode: RoleCodeValue;
    ipAddress?: string;
  }) {
    this.assertCanManageRole(params.roleCode, params.actorRoles);

    const actor = await this.prisma.user.findUnique({ where: { publicId: params.actorPublicId } });
    const target = await this.prisma.user.findUnique({ where: { publicId: params.targetPublicId } });
    if (!actor || !target) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });

    if (actor.id === target.id && params.roleCode === 'SUPER_ADMIN') {
      throw new ForbiddenException({ code: 'CANNOT_MODIFY_SELF', message: 'لا يمكنك سحب صلاحية SUPER_ADMIN من نفسك' });
    }

    const role = await this.prisma.role.findUnique({ where: { code: params.roleCode } });
    if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'الدور غير موجود' });

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: target.id, roleId: role.id } });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'ROLE_REVOKED',
          entityType: 'User',
          entityId: target.publicId,
          before: { roleCode: params.roleCode },
          ipAddress: params.ipAddress ?? null,
        },
      });
    });

    return this.getUser(params.targetPublicId);
  }

  /** The privilege-escalation guard described in this class's docblock. */
  private assertCanManageRole(roleCode: RoleCodeValue, actorRoles: string[]): void {
    if ((roleCode === 'ADMIN' || roleCode === 'SUPER_ADMIN') && !actorRoles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'فقط SUPER_ADMIN يمكنه منح أو سحب صلاحيات ADMIN أو SUPER_ADMIN',
      });
    }
  }
}
