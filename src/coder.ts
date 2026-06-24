/**
 * Hand-rolled Anchor instruction coding — no IDL, no Anchor runtime dependency.
 *
 *   discriminator = sha256("global:<ix_name>")[..8]
 *   account disc   = sha256("account:<Name>")[..8]
 *   args           = borsh-encoded, appended after the discriminator
 *
 * Mirrors `programs/keep/tests/e2e/common.mjs`, the on-chain-proven client. We
 * use @noble/hashes for a synchronous, isomorphic sha256 (Node + browser).
 */
import { sha256 } from '@noble/hashes/sha256';

/** Anchor instruction discriminator: sha256("global:<name>")[..8]. */
export function disc(ixName: string): Buffer {
  return Buffer.from(sha256(`global:${ixName}`)).subarray(0, 8);
}

/** Anchor account discriminator: sha256("account:<Name>")[..8]. */
export function accountDisc(accountName: string): Buffer {
  return Buffer.from(sha256(`account:${accountName}`)).subarray(0, 8);
}

// ── borsh-ish little-endian encoders (only what the instructions need) ──
export function u8(n: number): Buffer {
  return Buffer.from([n & 0xff]);
}
export function u16le(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
export function u64le(n: bigint | number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}
export function i64le(n: bigint | number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(n));
  return b;
}
/** Borsh String: u32 LE length prefix + utf8 bytes. */
export function borshString(s: string): Buffer {
  const body = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(body.length);
  return Buffer.concat([len, body]);
}
/** Borsh Vec<u8>: u32 LE count + raw bytes. */
export function borshBytes(bytes: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, Buffer.from(bytes)]);
}
/** Borsh Vec<[u8;32]>: u32 LE count + each 32-byte element. */
export function borshVec32(items: Uint8Array[]): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(items.length);
  return Buffer.concat([len, ...items.map((i) => Buffer.from(i))]);
}
