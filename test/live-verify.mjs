/* Live verification against the upgraded (v2.4) mainnet program: reads, factory,
 * listRaises, governance. Network test — run: node test/live-verify.mjs */
import assert from 'node:assert';
import { KeepClient } from '../dist/index.js';

const RPCS = ['https://api.mainnet-beta.solana.com', 'https://rpc.keep.coffee'];
let keep = null;
for (const rpc of RPCS) {
  try {
    const c = new KeepClient({ network: 'mainnet', rpcUrl: rpc });
    if (await c.getFactory()) { keep = c; break; }
  } catch (e) { console.log(`  RPC ${rpc} -> ${e.message}`); }
}
assert.ok(keep, 'could not reach a mainnet RPC');

const factory = await keep.getFactory();
console.log('factory.nextProjectId:', factory.nextProjectId, ' paused:', factory.paused);
console.log('isPaused:', await keep.isPaused(), ' isFrozen:', await keep.isFrozen());

const raises = await keep.listRaises();
console.log(`listRaises: ${raises.length} raise(s)`);
for (const r of raises) {
  console.log(`  #${r.projectId} ${r.state}  ${r.totalRaised}/${r.raiseTarget}  mint=${r.projectTokenMint.toBase58().slice(0, 8)}...`);
}

const r0 = await keep.getRaise(0);
assert.ok(r0 && r0.projectId === 0n, 'project #0 readable');
assert.strictEqual(r0.raiseTarget, 20_000_000_000n, '#0 raiseTarget 20,000 USDC');

console.log('\nOK - SDK reads the live v2.4 mainnet: factory + governance + listRaises + getRaise.');
