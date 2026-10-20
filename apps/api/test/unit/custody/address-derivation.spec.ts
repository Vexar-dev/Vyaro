import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import {
  deriveEvmAddress,
  deriveTronAddress,
  deriveLitecoinAddress,
  toEip55Checksum,
} from '../../../src/modules/custody/address-derivation';

// Publicly documented BIP39 test mnemonic — holds no real funds, safe to
// commit/print. Used ONLY to check the derivation code itself is correct,
// independent of any real secret.
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const EXPECTED_BEP20_INDEX_0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

function privateKeyAt(path: string): Uint8Array {
  const seed = mnemonicToSeedSync(TEST_MNEMONIC);
  const node = HDKey.fromMasterSeed(seed).derive(path);
  if (!node.privateKey) throw new Error('no private key derived');
  return node.privateKey;
}

describe('address-derivation', () => {
  describe('deriveEvmAddress (BEP-20)', () => {
    it("matches the commonly published test vector for m/44'/60'/0'/0/0", () => {
      const address = deriveEvmAddress(privateKeyAt("m/44'/60'/0'/0/0"));
      expect(address.toLowerCase()).toBe(EXPECTED_BEP20_INDEX_0.toLowerCase());
    });

    it('is deterministic — same key always gives the same address', () => {
      const key = privateKeyAt("m/44'/60'/0'/0/1");
      expect(deriveEvmAddress(key)).toBe(deriveEvmAddress(key));
    });

    it('produces a distinct address for a different index', () => {
      const a = deriveEvmAddress(privateKeyAt("m/44'/60'/0'/0/0"));
      const b = deriveEvmAddress(privateKeyAt("m/44'/60'/0'/0/1"));
      expect(a).not.toBe(b);
    });

    it('is well-formed: 0x + 40 hex chars, and matches its own EIP-55 checksum', () => {
      const address = deriveEvmAddress(privateKeyAt("m/44'/60'/0'/0/2"));
      expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      const lower = address.slice(2).toLowerCase();
      expect(address).toBe('0x' + toEip55Checksum(lower));
    });
  });

  describe('deriveTronAddress (TRC-20)', () => {
    it('is deterministic and index-distinct', () => {
      const key0 = privateKeyAt("m/44'/195'/0'/0/0");
      const key1 = privateKeyAt("m/44'/195'/0'/0/1");
      expect(deriveTronAddress(key0)).toBe(deriveTronAddress(key0));
      expect(deriveTronAddress(key0)).not.toBe(deriveTronAddress(key1));
    });

    it('starts with "T" and Base58Check round-trips to a 21-byte payload with the 0x41 version byte', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const bs58check = require('bs58check');
      const address = deriveTronAddress(privateKeyAt("m/44'/195'/0'/0/0"));
      expect(address.startsWith('T')).toBe(true); // Tron mainnet addresses always start with "T"
      const decoded: Buffer = bs58check.decode(address);
      expect(decoded.length).toBe(21);
      expect(decoded[0]).toBe(0x41);
    });
  });

  describe('deriveLitecoinAddress (LTC)', () => {
    it('is deterministic, index-distinct, and starts with the "ltc1" bech32 HRP', () => {
      const key0 = privateKeyAt("m/84'/2'/0'/0/0");
      const key1 = privateKeyAt("m/84'/2'/0'/0/1");
      const addr0 = deriveLitecoinAddress(key0);
      expect(deriveLitecoinAddress(key0)).toBe(addr0);
      expect(deriveLitecoinAddress(key1)).not.toBe(addr0);
      expect(addr0.startsWith('ltc1')).toBe(true);
    });
  });

  describe('toEip55Checksum', () => {
    it('never changes digit characters, only letter casing', () => {
      const input = '0000000000000000000000000000000000000000';
      expect(toEip55Checksum(input)).toBe(input);
    });
  });
});
