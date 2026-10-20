import { Injectable } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/** Key/value site configuration (see SiteSetting in schema.prisma). Server-side only; admin edits go through AdminSiteController. */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get<T = unknown>(key: string, fallback: T): Promise<T> {
    const row = await this.prisma.siteSetting.findUnique({ where: { key } });
    return row ? (row.value as unknown as T) : fallback;
  }

  async set(key: string, value: unknown, updatedBy?: bigint): Promise<void> {
    await this.prisma.siteSetting.upsert({
      where: { key },
      update: { value: value as Prisma.InputJsonValue, updatedBy },
      create: { key, value: value as Prisma.InputJsonValue, updatedBy },
    });
  }

  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.siteSetting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
}

@Global()
@Module({ providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
