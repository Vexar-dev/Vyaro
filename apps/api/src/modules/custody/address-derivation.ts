import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import * as bs58check from 'bs58check';
import { bech32 } from 'bech32';

/**
 * Address derivation, per chain, from a raw secp256k1 private key.
 *
 * These are PURE functions — no database, no I/O, no secrets. Given the same
 * private key they always return the same address. That is exactly what
 * makes them independently testable (see test/unit/custody/address-derivation.spec.ts)
 * WITHOUT ever touching the real master seed.
 *
 * ⚠️ UNVERIFIED AGAINST A LIVE NODE: this was written against the public
 * specifications below (BIP32/39, EIP-55, Tron's address scheme, BIP84/173)
 * in an environment with no network access to run/install these packages or
 * check output against a real chain explorer. Before ANY real deposit is
 * trusted:
 *   1. Run `npx ts-node scripts/verify-master-seed.ts` and confirm the
 *      printed BEP20 (index 0) address matches the well-known BIP39 test
 *      vector documented in that script's comments.
 *   2. Independently cross-check a few derived addresses (BEP20, TRC20, LTC)
 *      using a trusted, OFFLINE, open-source tool (e.g. iancoleman's BIP39
 *      tool, run air-gapped) against the SAME test mnemonic — never the real
 *      production one — before going anywhere near mainnet value.
 */

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function uncompressedPublicKey(privateKey: Uint8Array): Uint8Array {
  return secp256k1.getPublicKey(privateKey, false); // 65 bytes: 0x04 || X(32) || Y(32)
}

function compressedPublicKey(privateKey: Uint8Array): Uint8Array {
  return secp256k1.getPublicKey(privateKey, true); // 33 bytes
}

/** EIP-55 mixed-case checksum over a lowercase 40-hex-char address (no 0x prefix). */
export function toEip55Checksum(addressHexLower: string): string {
  const hash = toHex(keccak_256(new TextEncoder().encode(addressHexLower)));
  let out = '';
  for (let i = 0; i < addressHexLower.length; i++) {
    const c = addressHexLower[i];
    if (/[0-9]/.test(c)) {
      out += c;
    } else {
      const nibble = parseInt(hash[i], 16);
      out += nibble >= 8 ? c.toUpperCase() : c;
    }
  }
  return out;
}

/**
 * BEP-20 (BNB Smart Chain) address — identical format to plain Ethereum:
 * keccak256(uncompressed pubkey without the 0x04 prefix), last 20 bytes,
 * EIP-55 checksummed, "0x"-prefixed.
 */
export function deriveEvmAddress(privateKey: Uint8Array): string {
  const pub = uncompressedPublicKey(privateKey);
  const pubWithoutPrefix = pub.slice(1);
  const hash = keccak_256(pubWithoutPrefix);
  const addressHex = toHex(hash.slice(-20));
  return '0x' + toEip55Checksum(addressHex);
}

/**
 * TRC-20 (Tron) address — SAME key math as Ethereum (secp256k1 + keccak256),
 * different final encoding: prefix the 20-byte hash with 0x41 and
 * Base58Check-encode it (bs58check's default checksum is double-SHA256,
 * exactly what Tron/Bitcoin-style addresses use).
 */
export function deriveTronAddress(privateKey: Uint8Array): string {
  const pub = uncompressedPublicKey(privateKey);
  const pubWithoutPrefix = pub.slice(1);
  const hash = keccak_256(pubWithoutPrefix);
  const addressBytes = hash.slice(-20);
  const withVersionByte = new Uint8Array(21);
  withVersionByte[0] = 0x41;
  withVersionByte.set(addressBytes, 1);
  return bs58check.encode(Buffer.from(withVersionByte));
}

/**
 * Litecoin native SegWit address (BIP84, P2WPKH): witness program =
 * RIPEMD160(SHA256(compressed pubkey)), bech32-encoded (witness v0 — classic
 * bech32 checksum, NOT bech32m, per BIP173) with Litecoin's "ltc" HRP.
 */
export function deriveLitecoinAddress(privateKey: Uint8Array): string {
  const pub = compressedPublicKey(privateKey);
  const witnessProgram = ripemd160(sha256(pub));
  const words = [0, ...bech32.toWords(witnessProgram)]; // witness version 0 + program
  return bech32.encode('ltc', words);
}
