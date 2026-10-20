import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/** One place that writes audit_logs rows for admin mutations (actor, entity, before/after, reason, IP). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    actorPublicId: string;
    action: string;
    entityType: string;
    entityId?: string;
    before?: unknown;
    after?: unknown;
    reason?: string;
    ipAddress?: string;
  }): Promise<void> {
    const actor = await this.prisma.user.findUnique({ where: { publicId: params.actorPublicId }, select: { id: true } });
    await this.prisma.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        before: (params.before as Prisma.InputJsonValue) ?? undefined,
        after: (params.after as Prisma.InputJsonValue) ?? undefined,
        reason: params.reason ?? null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
