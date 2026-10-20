import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * EncryptionService — AES-256-GCM envelope encryption for anything stored in
 * `provider_credentials.encrypted_value`, `two_factor_secrets.encrypted_secret`, etc.
 *
 * The master key is READ FROM ENVIRONMENT ONLY (`ENCRYPTION_KEY`) in development.
 * It is never persisted to MySQL, never logged, never returned by any API.
 *
 * Production note: this class is intentionally the only place that touches the
 * master key, so swapping the env-based key for AWS KMS / GCP KMS / HashiCorp Vault
 * later means changing `getMasterKey()` only — nothing else in the codebase changes.
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private masterKey!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const key = this.config.get<string>('ENCRYPTION_KEY');
    if (!key || key.length < 32) {
      throw new Error(
        'ENCRYPTION_KEY is missing or too short. Generate one with: openssl rand -hex 32',
      );
    }
    this.masterKey = Buffer.from(key, 'hex').length === 32
      ? Buffer.from(key, 'hex')
      : Buffer.from(key.padEnd(32, '0').slice(0, 32));
  }

  /** Returns "iv:authTag:ciphertext" all hex-encoded — safe to store as a single TEXT column. */
  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
  }

  decrypt(payload: string): string {
    const [ivHex, authTagHex, dataHex] = payload.split(':');
    if (!ivHex || !authTagHex || !dataHex) {
      throw new Error('EncryptionService: malformed ciphertext payload');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
