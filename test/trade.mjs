/* Byte-level cross-check: buy/sell must match the on-chain-proven frontend trade
 * construction (keep-demo.js loadPool / raydiumSwapIx / contractSellIx) and the
 * raydium.rs (13) + sellIx (19) account orders. Run: node test/trade.mjs */
import assert from 'node:assert';
import { PublicKey, Keypair } from '@solana/web3.js';
import {
  decodePool, raydiumSwapInstruction, sellNativeInstruction, RAYDIUM_SWAP_BASE_INPUT_DISC,
  quoteSwapOut, NETWORKS, ata, emergencyPda, twapPda, TOKEN_PROGRAM_ID,
} from '../dist/index.js';

const net = NETWORKS.mainnet;
const RAY = net.raydiumCpmm;
const usdcMint = net.usdcMint;
const ammConfig = net.raydiumAmmConfig;
const projectMint = new PublicKey('4qP1zBcZGTCoNzFGMctQBo3neksU6CK6KtwzYZigkeep');
const SYSTEM = new PublicKey('11111111111111111111111111111111');
const u = () => Keypair.generate().publicKey;
const poolState = u(), t0Vault = u(), t1Vault = u(), user = u(), launchpad = u();

// --- decodePool: token0Mint @168 = USDC → usdcIsToken0 = true ---
const buf = Buffer.alloc(232);
ammConfig.toBuffer().copy(buf, 8);
t0Vault.toBuffer().copy(buf, 72);
t1Vault.toBuffer().copy(buf, 104);
usdcMint.toBuffer().copy(buf, 168);
const pool = decodePool({ raydiumProgram: RAY, poolState, poolData: buf, usdcMint, projectMint });
assert.ok(pool.ammConfig.equals(ammConfig), 'ammConfig @8');
assert.ok(pool.token0Vault.equals(t0Vault), 't0Vault @72');
assert.ok(pool.token1Vault.equals(t1Vault), 't1Vault @104');
assert.strictEqual(pool.usdcIsToken0, true, 'usdcIsToken0');
assert.ok(pool.usdcVault.equals(t0Vault) && pool.tokenVault.equals(t1Vault), 'vault sides');

const userUsdc = ata(usdcMint, user), userToken = ata(projectMint, user);
const eq = (ix, expect, label) => ix.keys.forEach((m, i) => {
  assert.ok(m.pubkey.equals(expect[i][0]), `${label} key ${i} pubkey`);
  assert.strictEqual(m.isSigner, expect[i][1], `${label} key ${i} isSigner`);
  assert.strictEqual(m.isWritable, expect[i][2], `${label} key ${i} isWritable`);
});

// --- buy: Raydium swap_base_input, USDC in (13 accounts) ---
const buy = raydiumSwapInstruction(pool, user, true, 50_000_000n, 1n);
assert.ok(buy.programId.equals(RAY) && buy.keys.length === 13, 'buy program + 13 keys');
eq(buy, [
  [user, true, true], [pool.authority, false, false], [ammConfig, false, false], [poolState, false, true],
  [userUsdc, false, true], [userToken, false, true], [t0Vault, false, true], [t1Vault, false, true],
  [TOKEN_PROGRAM_ID, false, false], [TOKEN_PROGRAM_ID, false, false],
  [usdcMint, false, false], [projectMint, false, false], [pool.observation, false, true],
], 'buy');
const bd = new Uint8Array(buy.data);
assert.deepStrictEqual([...bd.slice(0, 8)], [...RAYDIUM_SWAP_BASE_INPUT_DISC], 'buy swap disc');
assert.strictEqual(Buffer.from(bd.slice(8, 16)).readBigUInt64LE(0), 50_000_000n, 'buy amountIn');
assert.strictEqual(Buffer.from(bd.slice(16, 24)).readBigUInt64LE(0), 1n, 'buy minOut');

// --- sell direction via Raydium (token in): inputs/outputs swapped ---
const sr = raydiumSwapInstruction(pool, user, false, 1000n, 1n);
assert.ok(sr.keys[4].pubkey.equals(userToken) && sr.keys[5].pubkey.equals(userUsdc), 'sell user in/out swapped');
assert.ok(sr.keys[6].pubkey.equals(t1Vault) && sr.keys[7].pubkey.equals(t0Vault), 'sell pool vaults swapped');

// --- sell native (Keep `sell`): 19 accounts ---
const sn = sellNativeInstruction({ programId: net.programId, launchpad, pool, seller: user, tokenIn: 1000n, minUsdcOut: 1n });
assert.ok(sn.programId.equals(net.programId) && sn.keys.length === 19, 'sell-native program + 19 keys');
eq(sn, [
  [launchpad, false, false], [emergencyPda(net.programId), false, false], [twapPda(net.programId, launchpad), false, true],
  [RAY, false, false], [poolState, false, true], [ammConfig, false, false], [pool.authority, false, false],
  [t0Vault, false, true], [t1Vault, false, true], [pool.observation, false, true],
  [userToken, false, true], [userUsdc, false, true], [projectMint, false, false], [usdcMint, false, false],
  [TOKEN_PROGRAM_ID, false, false], [TOKEN_PROGRAM_ID, false, false],
  [user, true, true], [TOKEN_PROGRAM_ID, false, false], [SYSTEM, false, false],
], 'sell-native');
const snd = new Uint8Array(sn.data);
assert.strictEqual(Buffer.from(snd.slice(0, 8)).toString('hex'), '33e685a4017f83ad', 'sell disc');
assert.strictEqual(Buffer.from(snd.slice(8, 16)).readBigUInt64LE(0), 1000n, 'sell tokenIn');
assert.strictEqual(Buffer.from(snd.slice(16, 24)).readBigUInt64LE(0), 1n, 'sell minUsdcOut');

// --- quote sanity (constant product, 0.25% fee) ---
assert.ok(quoteSwapOut(1_000_000n, 1_000_000_000n, 2_000_000_000n) > 0n, 'quote > 0');

console.log('OK - buy/sell/pool match the proven frontend trade construction.');
console.log('  pool : ammConfig@8 t0@72 t1@104 token0Mint@168');
console.log('  buy  : 13-acct Raydium swap_base_input (USDC in)');
console.log('  sell : 19-acct Keep-native sell, disc 33e685a4017f83ad');
