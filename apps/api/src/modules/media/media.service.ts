import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../database/prisma.service';

const MAX_BYTES = 5 * 1024 * 1024;
export const NAME_RE = /^[a-f0-9-]{36}\.(png|jpg|webp)$/;
export const MIME_BY_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** Decides the type from the file's MAGIC BYTES, never from the client-supplied name/mime. SVG/GIF/HTML are rejected. */
export function sniff(buf: Buffer): 'png' | 'jpg' | 'webp' | null {
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

@Injectable()
export class MediaService {
  private readonly dir: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.dir = path.resolve(config.get<string>('UPLOAD_DIR') ?? './uploads');
  }

  async save(file: { buffer: Buffer; size: number } | undefined, uploadedBy: bigint | null) {
    if (!file?.buffer?.length) throw new BadRequestException({ code: 'NO_FILE', message: 'لم يتم إرفاق ملف' });
    if (file.size > MAX_BYTES) throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'الحد الأقصى للصورة 5MB' });
    const ext = sniff(file.buffer);
    if (!ext) throw new BadRequestException({ code: 'FILE_TYPE', message: 'الأنواع المسموحة: PNG أو JPG أو WEBP فقط' });

    const fileName = `${randomUUID()}.${ext}`;
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(path.join(this.dir, fileName), file.buffer, { flag: 'wx', mode: 0o640 });
    await this.prisma.mediaAsset.create({ data: { fileName, mime: MIME_BY_EXT[ext], sizeBytes: file.size, uploadedBy } });
    return { fileName, url: `/api/v1/media/${fileName}` };
  }

  async read(fileName: string): Promise<{ data: Buffer; mime: string }> {
    // strict allow-list pattern => no path traversal possible
    if (!NAME_RE.test(fileName)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'غير موجود' });
    try {
      const data = await fs.readFile(path.join(this.dir, fileName));
      return { data, mime: MIME_BY_EXT[fileName.split('.')[1]] };
    } catch {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'غير موجود' });
    }
  }

  async list(limit = 100) {
    const rows = await this.prisma.mediaAsset.findMany({ orderBy: { id: 'desc' }, take: limit });
    return rows.map((m) => ({ url: `/api/v1/media/${m.fileName}`, mime: m.mime, sizeBytes: m.sizeBytes, createdAt: m.createdAt }));
  }
}
