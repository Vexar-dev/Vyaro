import { Injectable, NotFoundException } from '@nestjs/common';
import { PostKind } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { SettingsService } from '../site/settings.service';
import { UpsertPostDto } from './content.dto';

/** Keys of site_settings that are safe to expose to anonymous visitors. */
export const PUBLIC_SETTING_KEYS = ['login.images', 'site.social', 'site.announcement'] as const;

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  private view(p: { publicId: string; kind: string; status: string; title: string; excerpt: string | null; body: string; imageUrl: string | null; publishedAt: Date | null; createdAt: Date }) {
    return { id: p.publicId, kind: p.kind, status: p.status, title: p.title, excerpt: p.excerpt, body: p.body, imageUrl: p.imageUrl, publishedAt: p.publishedAt, createdAt: p.createdAt };
  }

  // ── public ──
  async listPublished(kind?: PostKind) {
    const rows = await this.prisma.newsPost.findMany({
      where: { status: 'PUBLISHED', ...(kind ? { kind } : {}) },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
    return rows.map((p) => this.view(p));
  }

  async getPublished(publicId: string) {
    const p = await this.prisma.newsPost.findUnique({ where: { publicId } });
    if (!p || p.status !== 'PUBLISHED') throw new NotFoundException({ code: 'NOT_FOUND', message: 'غير موجود' });
    return this.view(p);
  }

  async publicSite() {
    const all = await this.settings.getAll();
    return Object.fromEntries(PUBLIC_SETTING_KEYS.map((k) => [k, all[k] ?? null]));
  }

  // ── admin ──
  async adminList() {
    const rows = await this.prisma.newsPost.findMany({ orderBy: { id: 'desc' }, take: 200 });
    return rows.map((p) => this.view(p));
  }

  async create(dto: UpsertPostDto, actorPublicId: string, ip?: string) {
    const actor = await this.prisma.user.findUnique({ where: { publicId: actorPublicId }, select: { id: true } });
    const p = await this.prisma.newsPost.create({
      data: {
        kind: dto.kind, status: dto.status, title: dto.title, excerpt: dto.excerpt ?? null, body: dto.body, imageUrl: dto.imageUrl ?? null,
        publishedAt: dto.status === 'PUBLISHED' ? new Date() : null, authorId: actor?.id ?? null,
      },
    });
    await this.audit.log({ actorPublicId, action: 'POST_CREATE', entityType: 'NewsPost', entityId: p.publicId, after: { kind: dto.kind, title: dto.title, status: dto.status }, ipAddress: ip });
    return this.view(p);
  }

  async update(publicId: string, dto: UpsertPostDto, actorPublicId: string, ip?: string) {
    const before = await this.prisma.newsPost.findUnique({ where: { publicId } });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'غير موجود' });
    const p = await this.prisma.newsPost.update({
      where: { publicId },
      data: {
        kind: dto.kind, status: dto.status, title: dto.title, excerpt: dto.excerpt ?? null, body: dto.body,
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        publishedAt: dto.status === 'PUBLISHED' ? before.publishedAt ?? new Date() : null,
      },
    });
    await this.audit.log({ actorPublicId, action: 'POST_UPDATE', entityType: 'NewsPost', entityId: publicId, before: { title: before.title, status: before.status }, after: { title: dto.title, status: dto.status }, ipAddress: ip });
    return this.view(p);
  }

  async remove(publicId: string, actorPublicId: string, ip?: string) {
    const before = await this.prisma.newsPost.findUnique({ where: { publicId } });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'غير موجود' });
    await this.prisma.newsPost.delete({ where: { publicId } });
    await this.audit.log({ actorPublicId, action: 'POST_DELETE', entityType: 'NewsPost', entityId: publicId, before: { title: before.title }, ipAddress: ip });
    return { ok: true };
  }
}
