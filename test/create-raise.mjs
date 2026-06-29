/* Byte-level check: create_project (9 acct, 8 args) + init_vaults (11 acct) match
 * the on-chain structs + lib.rs arg order, and FactoryConfig decodes next_project_id.
 * Run: node test/create-raise.mjs */
import assert from 'node:assert';
import { PublicKey, Keypair } from '@solana/web3.js';
import {
  createProjectInstruction, initVaultsInstruction, decodeFactory, AccessMode,
  NETWORKS, factoryPda, launchpadPda, twapPda, poolAuthorityPda, ata,
  disc, accountDisc, u64le, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SYSVAR_RENT_PUBKEY,
} from '../dist/index.js';

const net = NETWORKS.mainnet;
const PID = net.programId;
const SYSTEM = new PublicKey('11111111111111111111111111111111');
const owner = new PublicKey('FXE3N1aQH9PXsmyDBgTsrtbozFtedPJ9kjhePRDnDmLb');
const mint = Keypair.generate().publicKey;
const projectId = 5n;
const launchpad = launchpadPda(PID, projectId);
const [poolAuthority] = poolAuthorityPda(PID, launchpad);

// --- decodeFactory: next_project_id @ body offset 64 ---
const fbody = Buffer.alloc(76);
Keypair.generate().publicKey.toBuffer().copy(fbody, 0);   // owner
Keypair.generate().publicKey.toBuffer().copy(fbody, 32);  // fee receiver
u64le(42n).copy(fbody, 64);                               // next_project_id
const factory = decodeFactory(Buffer.concat([accountDisc('FactoryConfig'), fbody]));
assert.strictEqual(factory.nextProjectId, 42n, 'factory next_project_id');

// --- create_project: 9 accounts + 8 args ---
const cp = createProjectInstruction({
  programId: PID, projectId, owner, mint, name: 'Test', symbol: 'TST',
  mode: AccessMode.Public, whitelistMaxPerAddress: 0n, publicMaxPerAddress: 0n,
  whitelistAllocation: 0n, warmupSecs: 0n, successThresholdBps: 0,
});
assert.ok(cp.programId.equals(PID) && cp.keys.length === 9, 'create_project 9 keys');
const cpExpect = [
  [factoryPda(PID), false, true], [launchpad, false, true], [twapPda(PID, launchpad), false, true],
  [mint, true, true], [owner, true, true], [poolAuthority, false, true],
  [TOKEN_PROGRAM_ID, false, false], [SYSTEM, false, false], [SYSVAR_RENT_PUBKEY, false, false],
];
cp.keys.forEach((m, i) => {
  assert.ok(m.pubkey.equals(cpExpect[i][0]), `cp key ${i} pubkey`);
  assert.strictEqual(m.isSigner, cpExpect[i][1], `cp key ${i} isSigner`);
  assert.strictEqual(m.isWritable, cpExpect[i][2], `cp key ${i} isWritable`);
});
const d = new Uint8Array(cp.data);
assert.strictEqual(Buffer.from(d.slice(0, 8)).toString('hex'), '94dbb52add7291be', 'create_project disc');
// borshString("Test") = u32(4) + "Test"; borshString("TST") = u32(3) + "TST"
assert.deepStrictEqual([...d.slice(8, 16)], [4, 0, 0, 0, 0x54, 0x65, 0x73, 0x74], 'name borsh');
assert.deepStrictEqual([...d.slice(16, 23)], [3, 0, 0, 0, 0x54, 0x53, 0x54], 'symbol borsh');
assert.strictEqual(d[23], 0, 'mode = Public(0)');
// after mode: u64*3 (24) + i64 (8) + u16 (2)
assert.strictEqual(d.length, 8 + 8 + 7 + 1 + 24 + 8 + 2, 'create_project data length');

// --- init_vaults: 11 accounts, no args ---
const iv = initVaultsInstruction({ programId: PID, projectId, owner, mint, usdcMint: net.usdcMint });
assert.ok(iv.programId.equals(PID) && iv.keys.length === 11, 'init_vaults 11 keys');
const ivExpect = [
  // mint MUST be writable: init_vaults' on-chain handler runs token::mint_to (writes
  // supply) + token::set_authority (revokes mint authority). The Rust field has an
  // `address` constraint but NO `mut`, so the writable flag is caller-supplied — a
  // read-only flag reverts the whole createRaise. Matches proven e2e 01-create.mjs:87.
  [launchpad, false, true], [mint, false, true], [net.usdcMint, false, false],
  [ata(net.usdcMint, launchpad), false, true], [ata(mint, launchpad), false, true],
  [owner, true, true], [poolAuthority, false, true],
  [TOKEN_PROGRAM_ID, false, false], [ASSOCIATED_TOKEN_PROGRAM_ID, false, false],
  [SYSTEM, false, false], [SYSVAR_RENT_PUBKEY, false, false],
];
iv.keys.forEach((m, i) => {
  assert.ok(m.pubkey.equals(ivExpect[i][0]), `iv key ${i} pubkey`);
  assert.strictEqual(m.isSigner, ivExpect[i][1], `iv key ${i} isSigner`);
  assert.strictEqual(m.isWritable, ivExpect[i][2], `iv key ${i} isWritable`);
});
assert.strictEqual(Buffer.from(iv.data).equals(disc('init_vaults')), true, 'init_vaults disc, no args');

console.log('OK - createRaise (create_project + init_vaults) matches on-chain structs + arg order.');
console.log('  create_project: 9 accounts (mint=signer), disc 94dbb52add7291be, 8 borsh args');
console.log('  init_vaults   : 11 accounts, disc', disc('init_vaults').toString('hex'), ', no args');
console.log('  FactoryConfig : next_project_id @ body+64 decoded');
