/* Account-decoder checks: round-trip a synthetic account + discriminator guard.
 * Run: node test/accounts.mjs */
import assert from 'node:assert';
import { Keypair } from '@solana/web3.js';
import { decodeEmergency, decodeFactory, accountDisc, u64le, i64le } from '../dist/index.js';

// EmergencyState: i64 frozen_until_ts + Pubkey triggered_by + u8 bump (LEN 41).
const tb = Keypair.generate().publicKey;
const eBody = Buffer.alloc(41);
i64le(1234n).copy(eBody, 0);
tb.toBuffer().copy(eBody, 8);
eBody[40] = 9;
const e = decodeEmergency(Buffer.concat([accountDisc('EmergencyState'), eBody]));
assert.strictEqual(e.frozenUntilTs, 1234n, 'frozenUntilTs');
assert.ok(e.triggeredBy.equals(tb), 'triggeredBy');
assert.strictEqual(e.bump, 9, 'bump');

// FactoryConfig: owner + feeReceiver + u64 next_project_id @64 + paused + bump + u16.
const fBody = Buffer.alloc(76);
u64le(7n).copy(fBody, 64);
fBody[72] = 1; // paused = true
const f = decodeFactory(Buffer.concat([accountDisc('FactoryConfig'), fBody]));
assert.strictEqual(f.nextProjectId, 7n, 'nextProjectId');
assert.strictEqual(f.paused, true, 'paused');

// The discriminator guard rejects a wrong account type (fail loud).
assert.throws(
  () => decodeEmergency(Buffer.concat([accountDisc('FactoryConfig'), eBody])),
  /discriminator/,
  'wrong-type decode must throw',
);

console.log('OK - accounts: EmergencyState + FactoryConfig decode, discriminator guard.');
