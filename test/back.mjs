/* Byte-level cross-check: back() must build the SAME [createATAIdempotent,
 * deposit] instructions as the on-chain-proven frontend (keep-demo.js).
 * Run: node test/back.mjs  (no network needed) */
import assert from 'node:assert';
import { PublicKey } from '@solana/web3.js';
import {
  backInstructions, NETWORKS, ata, emergencyPda, depositorPda,
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from '../dist/index.js';

const net = NETWORKS.mainnet;
const programId = net.programId;
const SYSTEM = new PublicKey('11111111111111111111111111111111');
const launchpad = new PublicKey('7h1bpdUQtTSugBw3ByGyB5EpZvUs2hpMNLc9DA9Q19wu'); // mainnet #0
const usdcVault = new PublicKey('So11111111111111111111111111111111111111112'); // placeholder for structural check
const projectMint = new PublicKey('4qP1zBcZGTCoNzFGMctQBo3neksU6CK6KtwzYZigkeep');
const backer = new PublicKey('FXE3N1aQH9PXsmyDBgTsrtbozFtedPJ9kjhePRDnDmLb');
const amount = 50_000_000n; // 50 USDC

const [ataIx, depIx] = backInstructions({
  programId, launchpad, usdcMint: net.usdcMint, usdcVault, projectMint, backer, amount,
});

// 1) leading createAssociatedTokenAccountIdempotent
assert.ok(ataIx.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID), 'ata ix program');
assert.strictEqual(ataIx.keys.length, 6, 'ata 6 keys');
assert.deepStrictEqual([...ataIx.data], [1], 'ata data = [1] (createIdempotent)');
assert.ok(ataIx.keys[0].pubkey.equals(backer) && ataIx.keys[0].isSigner && ataIx.keys[0].isWritable, 'ata payer = backer (signer, writable)');
assert.ok(ataIx.keys[1].pubkey.equals(ata(projectMint, backer)) && ataIx.keys[1].isWritable, 'ata[1] = user project-token ATA');

// 2) deposit — 9 accounts, exact canonical order + flags
assert.ok(depIx.programId.equals(programId), 'deposit ix program');
assert.strictEqual(depIx.keys.length, 9, 'deposit 9 keys');
const userUsdc = ata(net.usdcMint, backer);
const expect = [
  [launchpad,                                  false, true ],
  [emergencyPda(programId),                    false, false],
  [depositorPda(programId, launchpad, backer), false, true ],
  [programId,                                  false, false], // wl gate = PID == Option None (Public)
  [userUsdc,                                   false, true ],
  [usdcVault,                                  false, true ],
  [backer,                                     true,  true ],
  [TOKEN_PROGRAM_ID,                           false, false],
  [SYSTEM,                                     false, false],
];
depIx.keys.forEach((m, i) => {
  assert.ok(m.pubkey.equals(expect[i][0]), `deposit key ${i} pubkey`);
  assert.strictEqual(m.isSigner, expect[i][1], `deposit key ${i} isSigner`);
  assert.strictEqual(m.isWritable, expect[i][2], `deposit key ${i} isWritable`);
});

// 3) deposit data = disc('deposit') + amount(u64 LE) + empty proof Vec (4 zero bytes) [v2.4 ABI]
const data = new Uint8Array(depIx.data);
assert.strictEqual(Buffer.from(data.slice(0, 8)).toString('hex'), 'f223c68952e1f2b6', 'deposit discriminator');
assert.strictEqual(Buffer.from(data.slice(8, 16)).readBigUInt64LE(0), amount, 'amount LE');
assert.deepStrictEqual([...data.slice(16)], [0, 0, 0, 0], 'empty proof Vec = 4 zero bytes');
assert.strictEqual(data.length, 20, 'deposit data length = 8 disc + 8 amount + 4 empty-vec');

console.log('OK - back() matches the on-chain-proven frontend deposit construction.');
console.log('  ata ix     : createAssociatedTokenAccountIdempotent (6 keys, data [1])');
console.log('  deposit    : 9 accounts (canonical order + flags), disc f223c68952e1f2b6');
console.log('  data len   :', data.length, '(disc 8 + amount 8 + empty-proof 4)  [v2.4 ABI]');
