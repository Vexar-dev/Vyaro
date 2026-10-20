import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../database/prisma.service';
import { EncryptionService } from '../../common/secrets/encryption.service';
import { AuditService } from '../../common/audit/audit.service';
import { SettingsService } from '../site/settings.service';
import { MIME_BY_EXT, sniff } from '../media/media.service';
import { SubmitKycDto } from './kyc.dto';

export type KycAction = 'depositAddresses' | 'withdrawals' | 'shamcashWithdrawals' | 'store' | 'transfers';
const DEFAULT_REQUIREMENTS: Record<KycAction, boolean> = { depositAddresses: false, withdrawals: false, shamcashWithdrawals: false, store: false, transfers: false };
const ACTION_LABEL: Record<KycAction, string> = {
  depositAddresses: 'الحصول على عناوين الإيداع',
  withdrawals: 'السحب',
  shamcashWithdrawals: 'السحب عبر Sham Cash',
  store: 'الشراء من المتجر',
  transfers: 'التحويل بين المستخدمين',
};
const FILE_RE = /^[a-f0-9-]{36}\.(png|jpg|webp)$/;
const MAX_BYTES = 5 * 1024 * 1024;
type Upload = { buffer: Buffer; size: number } | undefined;

/**
 * KYC: users submit a document + selfie; a reviewer approves/rejects. Which features REQUIRE an approved
 * verification is an admin setting ("kyc.requirements"); by default nothing does (the admin switches it on).
 * Images are written to a private folder that no public route can reach.
 */
@Injectable()
export class KycService {
  private readonly dir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly enc: EncryptionService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    config: ConfigService,
  ) {
    this.dir = path.resolve(config.get<string>('UPLOAD_DIR') ?? './uploads', '_kyc');
  }

  async requirements(): Promise<Record<KycAction, boolean>> {
    const stored = await this.settings.get<Partial<Record<KycAction, boolean>>>('kyc.requirements', {});
    return { ...DEFAULT_REQUIREMENTS, ...stored };
  }

  async isVerified(userId: bigint): Promise<boolean> {
    return (await this.prisma.kycSubmission.count({ where: { userId, status: 'APPROVED' } })) > 0;
  }

  /** Throws KYC_REQUIRED if this action requires verification and the user has no approved submission. */
  async assertVerified(userId: bigint, action: KycAction): Promise<void> {
    if (!(await this.requirements())[action]) return;
    if (await this.isVerified(userId)) return;
    throw new ForbiddenException({ code: 'KYC_REQUIRED', message: `يلزم توثيق هويتك قبل ${ACTION_LABEL[action]}` });
  }

  // ── user ──
  async myStatus(userId: bigint) {
    const latest = await this.prisma.kycSubmission.findFirst({ where: { userId }, orderBy: { id: 'desc' } });
    return {
      status: latest ? latest.status : 'NONE',
      note: latest?.status === 'REJECTED' ? latest.reviewNote : null,
      submittedAt: latest?.createdAt ?? null,
      requirements: await this.requirements(),
    };
  }

  private async saveImage(file: Upload, label: string, required: boolean): Promise<string | null> {
    if (!file?.buffer?.length) {
      if (required) throw new BadRequestException({ code: 'KYC_FILE_MISSING', message: `الصورة مطلوبة: ${label}` });
      return null;
    }
    if (file.size > MAX_BYTES) throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: `الحد الأقصى للصورة 5MB (${label})` });
    const ext = sniff(file.buffer);
    if (!ext) throw new BadRequestException({ code: 'FILE_TYPE', message: `الأنواع المسموحة: PNG أو JPG أو WEBP (${label})` });
    const name = `${randomUUID()}.${ext}`;
    await fs.mkdir(this.dir, { recursive: true, mode: 0o750 });
    await fs.writeFile(path.join(this.dir, name), file.buffer, { flag: 'wx', mode: 0o640 });
    return name;
  }

  async submit(userId: bigint, dto: SubmitKycDto, files: { front?: Upload; back?: Upload; selfie?: Upload }) {
    const open = await this.prisma.kycSubmission.findFirst({ where: { userId, status: { in: ['PENDING', 'APPROVED'] } } });
    if (open) {
      throw new ConflictException({
        code: open.status === 'APPROVED' ? 'KYC_ALREADY_APPROVED' : 'KYC_ALREADY_PENDING',
        message: open.status === 'APPROVED' ? 'هويتك موثّقة مسبقاً' : 'طلبك قيد المراجعة، انتظر النتيجة',
      });
    }
    const needsBack = dto.docType !== 'PASSPORT';
    const front = await this.saveImage(files.front, 'وجه الوثيقة', true);
    const back = await this.saveImage(files.back, 'ظهر الوثيقة', needsBack);
    const selfie = await this.saveImage(files.selfie, 'صورة شخصية مع الوثيقة', true);
    const number = dto.docNumber.trim();
    await this.prisma.kycSubmission.create({
      data: {
        userId,
        fullName: dto.fullName.trim(),
        docType: dto.docType,
        docNumberEnc: this.enc.encrypt(number),
        docNumberLast4: number.slice(-4),
        frontFile: front!,
        backFile: back,
        selfieFile: selfie!,
      },
    });
    return { status: 'PENDING' };
  }

  // ── reviewer ──
  async list(status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    const rows = await this.prisma.kycSubmission.findMany({
      where: status ? { status } : {},
      orderBy: { id: status === 'PENDING' ? 'asc' : 'desc' },
      take: 100,
      include: { user: { select: { username: true, email: true, phone: true } } },
    });
    return rows.map((r) => ({
      id: r.publicId, status: r.status, fullName: r.fullName, docType: r.docType, docNumberLast4: r.docNumberLast4,
      username: r.user.username, email: r.user.email, phone: r.user.phone, createdAt: r.createdAt, reviewNote: r.reviewNote,
    }));
  }

  private async byPublicId(publicId: string) {
    const row = await this.prisma.kycSubmission.findUnique({ where: { publicId }, include: { user: { select: { username: true, email: true, phone: true } } } });
    if (!row) throw new NotFoundException({ code: 'KYC_NOT_FOUND', message: 'الطلب غير موجود' });
    return row;
  }

  async detail(publicId: string, actorPublicId: string, ip?: string) {
    const r = await this.byPublicId(publicId);
    await this.audit.log({ actorPublicId, action: 'KYC_VIEWED', entityType: 'KycSubmission', entityId: publicId, ipAddress: ip });
    return {
      id: r.publicId, status: r.status, fullName: r.fullName, docType: r.docType, docNumber: this.enc.decrypt(r.docNumberEnc),
      username: r.user.username, email: r.user.email, phone: r.user.phone, createdAt: r.createdAt, reviewNote: r.reviewNote,
      hasBack: !!r.backFile,
    };
  }

  async file(publicId: string, kind: string, actorPublicId: string, ip?: string): Promise<{ data: Buffer; mime: string }> {
    const r = await this.byPublicId(publicId);
    const name = kind === 'front' ? r.frontFile : kind === 'back' ? r.backFile : kind === 'selfie' ? r.selfieFile : null;
    if (!name || !FILE_RE.test(name)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'غير موجود' });
    await this.audit.log({ actorPublicId, action: 'KYC_FILE_VIEWED', entityType: 'KycSubmission', entityId: publicId, after: { kind }, ipAddress: ip });
    try {
      return { data: await fs.readFile(path.join(this.dir, name)), mime: MIME_BY_EXT[name.split('.')[1]] };
    } catch {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'الملف غير موجود' });
    }
  }

  async review(publicId: string, outcome: 'APPROVED' | 'REJECTED', note: string | undefined, actorPublicId: string, ip?: string) {
    if (outcome === 'REJECTED' && !note?.trim()) {
      throw new BadRequestException({ code: 'NOTE_REQUIRED', message: 'اكتب سبب الرفض ليراه المستخدم' });
    }
    const r = await this.byPublicId(publicId);
    if (r.status !== 'PENDING') throw new ConflictException({ code: 'KYC_NOT_PENDING', message: 'تمت مراجعة هذا الطلب مسبقاً' });
    const actor = await this.prisma.user.findUnique({ where: { publicId: actorPublicId }, select: { id: true } });
    // The compare-and-set on status makes a double click / two reviewers racing harmless.
    const res = await this.prisma.kycSubmission.updateMany({
      where: { id: r.id, status: 'PENDING' },
      data: { status: outcome, reviewNote: note?.trim() || null, reviewedBy: actor?.id ?? null, reviewedAt: new Date() },
    });
    if (res.count !== 1) throw new ConflictException({ code: 'KYC_NOT_PENDING', message: 'تمت مراجعة هذا الطلب مسبقاً' });
    await this.audit.log({ actorPublicId, action: outcome === 'APPROVED' ? 'KYC_APPROVED' : 'KYC_REJECTED', entityType: 'KycSubmission', entityId: publicId, after: { outcome }, reason: note, ipAddress: ip });
    return { ok: true };
  }
}
