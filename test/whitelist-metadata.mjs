/* Cross-language merkle check against the contract's fixture (merkle.rs
 * js_built_proof_verifies) + setWhitelistRoot/setMetadata byte-checks.
 * Run: node test/whitelist-metadata.mjs */
import assert from 'node:assert';
import { PublicKey } from '@solana/web3.js';
import {
  merkleRoot, merkleProof, setWhitelistRootInstruction, setMetadataInstruction,
  NETWORKS, launchpadPda, wlRootPda, metadataPda, MPL_TOKEN_METADATA_ID,
  SYSVAR_RENT_PUBKEY, disc, borshString,
} from '../dist/index.js';

const net = NETWORKS.mainnet;
const PID = net.programId;
const SYSTEM = new PublicKey('11111111111111111111111111111111');
const owner = new PublicKey('FXE3N1aQH9PXsmyDBgTsrtbozFtedPJ9kjhePRDnDmLb');
const projectId = 5n;
const launchpad = launchpadPda(PID, projectId);

// --- merkle vs contract fixture (members [1..5;32], target [3;32]) ---
const members = [1, 2, 3, 4, 5].map((n) => new PublicKey(new Uint8Array(32).fill(n)));
const target = new PublicKey(new Uint8Array(32).fill(3));
const FIXTURE_ROOT = [253, 221, 240, 225, 167, 115, 59, 70, 199, 46, 184, 53, 183, 224, 183, 244, 175, 188, 167, 241, 101, 47, 219, 172, 63, 129, 213, 246, 244, 2, 193, 140];
const FIXTURE_PROOF = [
  [184, 191, 30, 51, 211, 93, 34, 142, 139, 248, 250, 189, 213, 164, 249, 1, 64, 56, 130, 157, 217, 13, 191, 89, 18, 124, 160, 149, 173, 101, 199, 204],
  [89, 107, 240, 10, 206, 156, 160, 240, 108, 95, 46, 48, 127, 116, 242, 193, 218, 38, 159, 174, 36, 97, 66, 29, 21, 211, 123, 109, 15, 213, 101, 225],
  [135, 226, 55, 149, 150, 27, 201, 246, 150, 163, 201, 7, 2, 87, 72, 34, 1, 196, 71, 125, 112, 231, 12, 129, 112, 234, 82, 171, 31, 243, 198, 39],
];
assert.deepStrictEqual([...merkleRoot(members)], FIXTURE_ROOT, 'merkle root matches contract fixture');
const proof = merkleProof(members, target);
assert.strictEqual(proof.length, 3, 'proof length');
proof.forEach((node, i) => assert.deepStrictEqual([...node], FIXTURE_PROOF[i], `proof node ${i}`));

// --- set_whitelist_root: 4 accounts, data = disc + Vec<u8>(32 bytes) ---
const root = merkleRoot(members);
const wl = setWhitelistRootInstruction({ programId: PID, projectId, owner, root });
assert.ok(wl.programId.equals(PID) && wl.keys.length === 4, 'set_whitelist_root 4 keys');
const wlExpect = [
  [launchpad, false, false], [wlRootPda(PID, launchpad), false, true],
  [owner, true, true], [SYSTEM, false, false],
];
wl.keys.forEach((m, i) => {
  assert.ok(m.pubkey.equals(wlExpect[i][0]), `wl key ${i} pubkey`);
  assert.strictEqual(m.isSigner, wlExpect[i][1], `wl key ${i} isSigner`);
  assert.strictEqual(m.isWritable, wlExpect[i][2], `wl key ${i} isWritable`);
});
const wd = new Uint8Array(wl.data);
assert.ok(Buffer.from(wd.slice(0, 8)).equals(disc('set_whitelist_root')), 'wl disc');
assert.deepStrictEqual([...wd.slice(8, 12)], [32, 0, 0, 0], 'root Vec len = 32');
assert.deepStrictEqual([...wd.slice(12)], [...root], 'root bytes');

// --- set_metadata: 7 accounts (Metaplex CPI), 3 string args ---
const mint = new PublicKey('4qP1zBcZGTCoNzFGMctQBo3neksU6CK6KtwzYZigkeep');
const md = setMetadataInstruction({ programId: PID, projectId, mint, owner, name: 'My Project', symbol: 'MYP', uri: 'https://x/y.json' });
assert.ok(md.programId.equals(PID) && md.keys.length === 7, 'set_metadata 7 keys');
const mdExpect = [
  [launchpad, false, true], [mint, false, false], [metadataPda(mint), false, true],
  [owner, true, true], [MPL_TOKEN_METADATA_ID, false, false], [SYSTEM, false, false], [SYSVAR_RENT_PUBKEY, false, false],
];
md.keys.forEach((m, i) => {
  assert.ok(m.pubkey.equals(mdExpect[i][0]), `md key ${i} pubkey`);
  assert.strictEqual(m.isSigner, mdExpect[i][1], `md key ${i} isSigner`);
  assert.strictEqual(m.isWritable, mdExpect[i][2], `md key ${i} isWritable`);
});
const mdData = new Uint8Array(md.data);
assert.ok(Buffer.from(mdData.slice(0, 8)).equals(disc('set_metadata')), 'md disc');
const expectData = Buffer.concat([disc('set_metadata'), borshString('My Project'), borshString('MYP'), borshString('https://x/y.json')]);
assert.ok(Buffer.from(md.data).equals(expectData), 'md data = disc + 3 borsh strings');

console.log('OK - merkle matches the contract fixture; setWhitelistRoot/setMetadata byte-checked.');
console.log('  merkle root + 3-node proof == merkle.rs js_built_proof_verifies fixture');
console.log('  set_whitelist_root: 4 accounts, Vec<u8>(32) root');
console.log('  set_metadata     : 7 accounts (Metaplex PDA), 3 borsh strings');
