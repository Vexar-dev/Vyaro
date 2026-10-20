/**
 * Run this AFTER generate-master-seed.ts, and read its full output carefully
 * before trusting this system with any real deposit:
 *
 *   cd apps/api
 *   npx ts-node src/scripts/verify-master-seed.ts
 *
 * This does two DIFFERENT things — both matter:
 *
 * 1) A self-test using the well-known PUBLIC BIP39 test mnemonic
 *    ("abandon abandon ... about") — NOT your real one. It checks the
 *    BEP20/index-0 address this codebase derives against a commonly
 *    published test vector for that exact mnemonic + derivation path. If
 *    this fails, the derivation CODE itself is wrong — stop immediately, do
 *    not proceed, and do not trust any address this system has produced.
 *
 * 2) Prints the REAL addresses (index 0 and 1, all 3 networks) derived from
 *    YOUR actual master seed. Cross-check at least the BEP20 and TRC20 ones
 *    against an independent, OFFLINE, open-source tool (e.g. iancoleman's
 *    BIP39 tool, run air-gapped, no internet) using a TEST mnemonic that
 *    matches step 1 — never type your real production mnemonic into any
 *    third-party tool or website, offline or not.
 */
import { NestFactory } from '@nestjs/core';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import { AppModule } from '../app.module';
import { CustodyKeyService, NetworkCode } from '../modules/custody/custody-key.service';
import { deriveEvmAddress } from '../modules/custody/address-derivation';

// Publicly documented BIP39 test mnemonic — safe to print, holds no real funds.
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
// Commonly published expected value for this exact mnemonic at m/44'/60'/0'/0/0
// (plain Ethereum / BEP20 uses the identical address format). Cross-check this
// value yourself against an independent source — do not take it on faith.
const EXPECTED_TEST_BEP20_ADDRESS_INDEX_0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

const NETWORKS: NetworkCode[] = ['BEP20', 'TRC20', 'LTC'];

async function selfTestAgainstKnownVector() {
  const seed = mnemonicToSeedSync(TEST_MNEMONIC);
  const root = HDKey.fromMasterSeed(seed);
  const node = root.derive("m/44'/60'/0'/0/0");
  if (!node.privateKey) throw new Error('self-test: derivation produced no private key');
  const address = deriveEvmAddress(node.privateKey);

  console.log('── Step 1: self-test against a known public BIP39 test vector ──');
  console.log('  Derived :', address);
  console.log('  Expected:', EXPECTED_TEST_BEP20_ADDRESS_INDEX_0);
  if (address.toLowerCase() !== EXPECTED_TEST_BEP20_ADDRESS_INDEX_0.toLowerCase()) {
    console.error('\n  ❌ MISMATCH — the derivation code is producing wrong addresses.');
    console.error('  DO NOT proceed. Do not trust any address this system has produced.\n');
    process.exitCode = 1;
    return false;
  }
  console.log('  ✅ Matches the known test vector for BEP20/Ethereum.\n');
  console.log(
    '  NOTE: this only checks BEP20. TRC20 and LTC use different address\n' +
      '  encodings this repo could not independently verify offline — cross-check\n' +
      '  those two yourself (step 2 below) using this SAME test mnemonic against\n' +
      '  an independent offline tool before trusting them.\n',
  );
  return true;
}

async function printRealAddressesForManualCrossCheck() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const custody = app.get(CustodyKeyService);
    console.log('── Step 2: your REAL derived addresses (cross-check independently) ──');
    for (const network of NETWORKS) {
      for (const index of [0, 1]) {
        const address = await custody.deriveAddress(network, index);
        console.log(`  ${network} #${index}: ${address}`);
      }
    }
    console.log(
      '\n  Do NOT send real funds to any of these until you have independently\n' +
        '  verified the derivation for at least BEP20 and TRC20 using an offline\n' +
        '  tool with a TEST mnemonic (never your real one).\n',
    );
  } finally {
    await app.close();
  }
}

async function main() {
  const ok = await selfTestAgainstKnownVector();
  if (!ok) return;
  await printRealAddressesForManualCrossCheck();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
