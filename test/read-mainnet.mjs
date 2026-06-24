/* Read-path verification — decode the REAL mainnet project #0 and check fields
 * against known on-chain truth. Run: node test/read-mainnet.mjs */
import assert from 'node:assert';
import { KeepClient } from '../dist/index.js';

const RPCS = ['https://api.mainnet-beta.solana.com', 'https://rpc.keep.coffee'];

let raise = null, used = null;
for (const rpc of RPCS) {
  try {
    const keep = new KeepClient({ network: 'mainnet', rpcUrl: rpc });
    raise = await keep.getRaise(0);
    used = rpc;
    if (raise) break;
  } catch (e) { console.log(`  RPC ${rpc} -> ${e.message}`); }
}
assert.ok(raise, 'could not read mainnet project #0 from any RPC');

const lp = new KeepClient({ network: 'mainnet' }).launchpadAddress(0).toBase58();
console.log('RPC used         ', used);
console.log('launchpad #0     ', lp);
console.log('projectId        ', raise.projectId);
console.log('owner            ', raise.projectOwner.toBase58());
console.log('token mint       ', raise.projectTokenMint.toBase58());
console.log('state            ', raise.state);
console.log('mode             ', raise.mode);
console.log('raiseTarget      ', raise.raiseTarget, '(USDC base units)');
console.log('totalRaised      ', raise.totalRaised);
console.log('depositorCount   ', raise.depositorCount);
console.log('successThreshBps ', raise.successThresholdBps);
console.log('feeSplitProjBps  ', raise.feeSplitProjectBps);
console.log('d7Passed         ', raise.d7Passed);
console.log('finalizeCaller   ', raise.finalizeCaller ? raise.finalizeCaller.toBase58() : null);

assert.strictEqual(raise.projectId, 0n, 'projectId must be 0');
assert.strictEqual(raise.raiseTarget, 20_000_000_000n, 'raiseTarget must be 20,000 USDC');
assert.ok(raise.projectTokenMint.toBase58().endsWith('keep'), 'mint must be a *keep vanity');
assert.ok(lp.startsWith('7h1bp'), 'launchpad #0 address must match');

console.log('\nOK - decoded live mainnet project #0; fields match known on-chain truth.');
