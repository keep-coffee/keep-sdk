/* Byte-level cross-check: claimRefund() must build the SAME 11-account
 * claim_refund instruction as the on-chain-proven frontend (keep-demo.js),
 * across both the Cancelled and Failed branches. Run: node test/claim-refund.mjs */
import assert from 'node:assert';
import { PublicKey } from '@solana/web3.js';
import {
  claimRefundInstruction, NETWORKS, ata, depositorPda, claimPoolPda, TOKEN_PROGRAM_ID,
} from '../dist/index.js';

const net = NETWORKS.mainnet;
const PID = net.programId;
const SYSTEM = new PublicKey('11111111111111111111111111111111');
const launchpad = new PublicKey('7h1bpdUQtTSugBw3ByGyB5EpZvUs2hpMNLc9DA9Q19wu');
const usdcVault = new PublicKey('So11111111111111111111111111111111111111112');
const projectMint = new PublicKey('4qP1zBcZGTCoNzFGMctQBo3neksU6CK6KtwzYZigkeep');
const tokenVault = new PublicKey('Gjwzd6e2j9V9d4w8x1m6h2eZ8t1f7n3k5p9q2r4s6t8u');
const backer = new PublicKey('FXE3N1aQH9PXsmyDBgTsrtbozFtedPJ9kjhePRDnDmLb');

const base = { programId: PID, launchpad, usdcMint: net.usdcMint, usdcVault, projectMint, tokenVault, backer };
const userUsdc = ata(net.usdcMint, backer);
const dep = depositorPda(PID, launchpad, backer);

function check(label, ix, expect) {
  assert.ok(ix.programId.equals(PID), `${label}: program`);
  assert.strictEqual(ix.keys.length, 11, `${label}: 11 keys`);
  assert.strictEqual(Buffer.from(ix.data).toString('hex'), '0f101ea1ffe4613c', `${label}: disc`);
  assert.strictEqual(ix.data.length, 8, `${label}: no args`);
  ix.keys.forEach((m, i) => {
    assert.ok(m.pubkey.equals(expect[i][0]), `${label} key ${i} pubkey`);
    assert.strictEqual(m.isSigner, expect[i][1], `${label} key ${i} isSigner`);
    assert.strictEqual(m.isWritable, expect[i][2], `${label} key ${i} isWritable`);
  });
}

// --- Cancelled path: depositor required; failure-only accounts = PID (readonly) ---
check('cancelled', claimRefundInstruction({ ...base, isFailure: false, hasDepositor: true }), [
  [launchpad, false, true],
  [dep,       false, true],   // depositor present
  [PID,       false, false],  // claim_pool -> None
  [usdcVault, false, true],
  [userUsdc,  false, true],
  [PID,       false, false],  // mint -> None
  [PID,       false, false],  // user_token_ata -> None
  [PID,       false, false],  // token_vault -> None
  [backer,    true,  true],
  [TOKEN_PROGRAM_ID, false, false],
  [SYSTEM,    false, false],
]);

// --- Failed path (with depositor): all failure accounts real + writable ---
check('failed', claimRefundInstruction({ ...base, isFailure: true, hasDepositor: true }), [
  [launchpad, false, true],
  [dep,       false, true],
  [claimPoolPda(PID, launchpad), false, true],
  [usdcVault, false, true],
  [userUsdc,  false, true],
  [projectMint, false, true],
  [ata(projectMint, backer), false, true],
  [tokenVault, false, true],
  [backer,    true,  true],
  [TOKEN_PROGRAM_ID, false, false],
  [SYSTEM,    false, false],
]);

// --- Failed path (no depositor, pure market buyer): depositor slot = PID readonly ---
check('failed-no-dep', claimRefundInstruction({ ...base, isFailure: true, hasDepositor: false }), [
  [launchpad, false, true],
  [PID,       false, false],  // depositor -> None
  [claimPoolPda(PID, launchpad), false, true],
  [usdcVault, false, true],
  [userUsdc,  false, true],
  [projectMint, false, true],
  [ata(projectMint, backer), false, true],
  [tokenVault, false, true],
  [backer,    true,  true],
  [TOKEN_PROGRAM_ID, false, false],
  [SYSTEM,    false, false],
]);

console.log('OK - claimRefund() matches the proven frontend claim_refund construction.');
console.log('  disc 0f101ea1ffe4613c, 11 accounts, no args');
console.log('  verified: Cancelled / Failed(+depositor) / Failed(market-buyer) branches');
