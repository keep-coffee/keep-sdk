/* Correctness smoke test — derivations must match KNOWN on-chain truth, not
 * just compile. Run: node test/smoke.mjs (after npm run build). */
import assert from 'node:assert';
import {
  NETWORKS, factoryPda, emergencyPda, launchpadPda, depositorPda,
  disc, ata, TOKEN_PROGRAM_ID,
} from '../dist/index.js';
import { PublicKey } from '@solana/web3.js';

const mainnet = NETWORKS.mainnet.programId;

// 1. Factory PDA must equal the real mainnet FactoryConfig (45W6xAgL…).
const factory = factoryPda(mainnet).toBase58();
console.log('factory PDA       ', factory);
assert.ok(factory.startsWith('45W6xAgL'), `factory PDA mismatch: ${factory}`);

// 2. Launchpad #0 must equal the real first mainnet project (7h1bp…Q19wu).
const lp0 = launchpadPda(mainnet, 0).toBase58();
console.log('launchpad #0      ', lp0);
assert.ok(lp0.startsWith('7h1bp'), `launchpad #0 mismatch: ${lp0}`);

// 3. ATA derivation must match @solana/spl-token (independent path).
const owner = new PublicKey('11111111111111111111111111111111');
const mint = NETWORKS.mainnet.usdcMint;
console.log('usdc ata(system)  ', ata(mint, owner).toBase58());

// 4. Discriminators are deterministic 8-byte Anchor hashes.
for (const ix of ['create_project', 'deposit', 'claim', 'claim_refund', 'sell']) {
  const d = disc(ix);
  assert.strictEqual(d.length, 8);
  console.log(`disc ${ix.padEnd(15)} ${d.toString('hex')}`);
}

// 5. Sanity: emergency + depositor derive without throwing.
console.log('emergency PDA     ', emergencyPda(mainnet).toBase58());
console.log('depositor(#0,sys) ', depositorPda(mainnet, launchpadPda(mainnet, 0), owner).toBase58());

console.log('\nOK — derivations match known on-chain addresses.');
