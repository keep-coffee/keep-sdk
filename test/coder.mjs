/* Unit checks for the instruction coder: Anchor discriminators + borsh encoders.
 * Run: node test/coder.mjs */
import assert from 'node:assert';
import {
  disc, u8, u16le, u64le, i64le, borshString, borshBytes, borshVec32,
} from '../dist/index.js';

// Known discriminators (sha256("global:<ix>")[:8]).
assert.strictEqual(disc('deposit').toString('hex'), 'f223c68952e1f2b6', 'deposit disc');
assert.strictEqual(disc('claim').toString('hex'), '3ec6d6c1d59f6cd2', 'claim disc');
assert.strictEqual(disc('claim_refund').toString('hex'), '0f101ea1ffe4613c', 'claim_refund disc');
assert.strictEqual(disc('sell').toString('hex'), '33e685a4017f83ad', 'sell disc');
assert.strictEqual(disc('create_project').toString('hex'), '94dbb52add7291be', 'create_project disc');

// Little-endian integer encoders.
assert.deepStrictEqual([...u8(5)], [5]);
assert.deepStrictEqual([...u16le(513)], [1, 2]);
assert.deepStrictEqual([...u64le(1n)], [1, 0, 0, 0, 0, 0, 0, 0]);
assert.deepStrictEqual([...u64le(256n)], [0, 1, 0, 0, 0, 0, 0, 0]);
assert.deepStrictEqual([...i64le(-1n)], [255, 255, 255, 255, 255, 255, 255, 255]);

// Borsh String / Vec<u8> / Vec<[u8;32]>.
assert.deepStrictEqual([...borshString('AB')], [2, 0, 0, 0, 0x41, 0x42], 'borshString');
assert.deepStrictEqual([...borshBytes(new Uint8Array([1, 2, 3]))], [3, 0, 0, 0, 1, 2, 3], 'borshBytes');
assert.deepStrictEqual([...borshVec32([])], [0, 0, 0, 0], 'empty Vec<[u8;32]>');
const node = new Uint8Array(32).fill(7);
assert.deepStrictEqual([...borshVec32([node])], [1, 0, 0, 0, ...node], 'Vec<[u8;32]> one node');

// Every instruction discriminator is distinct.
const names = [
  'create_project', 'init_vaults', 'set_metadata', 'set_whitelist_root',
  'deposit', 'claim', 'claim_refund', 'sell', 'reclaim_deposit',
];
const hexes = names.map((n) => disc(n).toString('hex'));
assert.strictEqual(new Set(hexes).size, names.length, 'all discriminators distinct');

console.log('OK - coder: discriminators + borsh encoders verified.');
