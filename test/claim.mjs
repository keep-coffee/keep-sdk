/* Byte-level check: claim() must match the on-chain Claim<'info> struct order
 * (no frontend builder exists — the keeper auto-distributes). Run: node test/claim.mjs */
import assert from 'node:assert';
import { PublicKey, Keypair } from '@solana/web3.js';
import {
  claimInstruction, NETWORKS, ata, emergencyPda, depositorPda,
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SYSVAR_RENT_PUBKEY,
} from '../dist/index.js';

const net = NETWORKS.mainnet;
const PID = net.programId;
const SYSTEM = new PublicKey('11111111111111111111111111111111');
const launchpad = new PublicKey('7h1bpdUQtTSugBw3ByGyB5EpZvUs2hpMNLc9DA9Q19wu');
const tokenVault = Keypair.generate().publicKey;
const projectMint = new PublicKey('4qP1zBcZGTCoNzFGMctQBo3neksU6CK6KtwzYZigkeep');
const backer = new PublicKey('FXE3N1aQH9PXsmyDBgTsrtbozFtedPJ9kjhePRDnDmLb');

const ix = claimInstruction({ programId: PID, launchpad, tokenVault, projectMint, backer });
assert.ok(ix.programId.equals(PID), 'claim program');
assert.strictEqual(ix.keys.length, 11, 'claim 11 keys');
assert.strictEqual(Buffer.from(ix.data).toString('hex'), '3ec6d6c1d59f6cd2', 'claim disc');
assert.strictEqual(ix.data.length, 8, 'claim no args');

const expect = [
  [launchpad, false, false],
  [emergencyPda(PID), false, false],
  [depositorPda(PID, launchpad, backer), false, true],
  [tokenVault, false, true],
  [projectMint, false, true],
  [ata(projectMint, backer), false, true],          // user token ATA (init_if_needed)
  [backer, true, true],
  [TOKEN_PROGRAM_ID, false, false],
  [ASSOCIATED_TOKEN_PROGRAM_ID, false, false],
  [SYSTEM, false, false],
  [SYSVAR_RENT_PUBKEY, false, false],
];
ix.keys.forEach((m, i) => {
  assert.ok(m.pubkey.equals(expect[i][0]), `claim key ${i} pubkey`);
  assert.strictEqual(m.isSigner, expect[i][1], `claim key ${i} isSigner`);
  assert.strictEqual(m.isWritable, expect[i][2], `claim key ${i} isWritable`);
});

console.log('OK - claim() matches the on-chain Claim<\'info> struct (11 accounts, disc 3ec6d6c1d59f6cd2, no args).');
