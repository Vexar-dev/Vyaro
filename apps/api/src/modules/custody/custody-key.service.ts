import { Injectable } from '@nestjs/common';
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { PrismaService } from '../../database/prisma.service';
import { EncryptionService } from '../../common/secrets/encryption.service';
import { deriveEvmAddress, deriveTronAddress, deriveLitecoinAddress } from './address-derivation';

export type NetworkCode = 'BEP20' | 'TRC20' | 'LTC';

const MASTER_SEED_LABEL = 'primary';

const DERIVATION_PATHS: Record<NetworkCode, (index: number) => string> = {
  BEP20: (i) => `m/44'/60'/0'/0/${i}`, // standard EVM path
  TRC20: (i) => `m/44'/195'/0'/0/${i}`, // standard Tron path
  LTC: (i) => `m/84'/2'/0'/0/${i}`, // standard BIP84 (native SegWit) Litecoin path
};

/**
 * CustodyKeyService — THE single place in this codebase that ever derives or
 * touches a private key. Every deposit address for every user, on every
 * chain, comes from ONE root BIP39 mnemonic via standard BIP32/44/84
 * derivation paths above. Nothing else in the app should import
 * `@scure/bip32`, `@scure/bip39`, or `address-derivation.ts` directly.
 *
 * ── SECURITY MODEL — read before changing anything in this file ──────────
 * - The plaintext mnemonic exists only: (a) once, on an operator's screen,
 *   when scripts/generate-master-seed.ts is run (to be written down OFFLINE
 *   and stored physically), and (b) transiently in this process's memory
 *   after decryption below. It is NEVER logged, NEVER returned by any API
 *   response, NEVER written to disk unencrypted.
 * - Whoever has BOTH the `wallet_master_seeds` row AND the `ENCRYPTION_KEY`
 *   env var can derive every private key this system will ever use, for
 *   every user, on every chain. That is the entire security perimeter.
 *   Treat ENCRYPTION_KEY with the same care as a bank vault combination.
 * - This is a HOT WALLET design: keys are derivable on demand by the running
 *   app process. Appropriate for receiving/sweeping deposits. It is
 *   explicitly NOT hardened for holding large standing balances long-term —
 *   see docs/05_APIS_AND_PROVIDERS.txt §6 for the full risk writeup and
 *   recommended next steps (KMS/HSM, cold sweep, multi-sig) before this ever
 *   holds meaningful value on mainnet.
 * - Losing BOTH the encrypted DB row and the offline paper backup means every
 *   derived address's funds become permanently unrecoverable. There is no
 *   "forgot password" for this.
 */
@Injectable()
export class CustodyKeyService {
  private cachedMasterSeed?: Uint8Array;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  /** Raw 32-byte private key for (network, index). Never log or return this to any client/API response. */
  async derivePrivateKey(network: NetworkCode, index: number): Promise<Uint8Array> {
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`CustodyKeyService: invalid derivation index ${index}`);
    }
    const seed = await this.getMasterSeed();
    const root = HDKey.fromMasterSeed(seed);
    const path = DERIVATION_PATHS[network](index);
    const node = root.derive(path);
    if (!node.privateKey) {
      throw new Error(`CustodyKeyService: derivation produced no private key for path ${path}`);
    }
    return node.privateKey;
  }

  async deriveAddress(network: NetworkCode, index: number): Promise<string> {
    const privateKey = await this.derivePrivateKey(network, index);
    switch (network) {
      case 'BEP20':
        return deriveEvmAddress(privateKey);
      case 'TRC20':
        return deriveTronAddress(privateKey);
      case 'LTC':
        return deriveLitecoinAddress(privateKey);
      default: {
        const exhaustiveCheck: never = network;
        throw new Error(`CustodyKeyService: unsupported network ${exhaustiveCheck}`);
      }
    }
  }

  private async getMasterSeed(): Promise<Uint8Array> {
    if (this.cachedMasterSeed) return this.cachedMasterSeed;

    const row = await this.prisma.walletMasterSeed.findUnique({ where: { label: MASTER_SEED_LABEL } });
    if (!row) {
      throw new Error(
        'CustodyKeyService: no master seed configured. Run `npx ts-node scripts/generate-master-seed.ts` once before using deposit addresses.',
      );
    }

    const mnemonic = this.encryption.decrypt(row.encryptedMnemonic);
    if (!validateMnemonic(mnemonic, wordlist)) {
      throw new Error('CustodyKeyService: stored mnemonic failed BIP39 checksum validation — refusing to use it.');
    }

    this.cachedMasterSeed = mnemonicToSeedSync(mnemonic);
    return this.cachedMasterSeed;
  }
}
