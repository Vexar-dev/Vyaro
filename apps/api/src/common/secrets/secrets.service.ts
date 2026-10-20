import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EncryptionService } from './encryption.service';

/**
 * SecretsService — the only module allowed to read/write `provider_credentials`.
 * Values are encrypted at rest via EncryptionService and are NEVER included in
 * logs, error messages, or API responses (see LoggingInterceptor redaction list).
 */
@Injectable()
export class SecretsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async setCredential(providerId: bigint, keyName: string, plaintextValue: string): Promise<void> {
    const encryptedValue = this.encryption.encrypt(plaintextValue);
    await this.prisma.providerCredential.upsert({
      where: { providerId_keyName: { providerId, keyName } },
      update: { encryptedValue },
      create: { providerId, keyName, encryptedValue },
    });
  }

  async getCredential(providerId: bigint, keyName: string): Promise<string | null> {
    const row = await this.prisma.providerCredential.findUnique({
      where: { providerId_keyName: { providerId, keyName } },
    });
    if (!row) return null;
    return this.encryption.decrypt(row.encryptedValue);
  }
}
