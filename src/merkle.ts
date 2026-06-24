/**
 * Merkle allowlist helper for Private/Hybrid raises. Matches the on-chain
 * verifier (programs/keep/src/utils/merkle.rs): leaf = keccak256(pubkey[32]),
 * internal nodes = sorted-pair keccak256 (OpenZeppelin convention), odd node
 * duplicates the last. Cross-checked against the contract's fixture.
 *
 * A creator builds the root with `merkleRoot(addresses)` and commits it via
 * `setWhitelistRoot`; a backer gets their proof with `merkleProof(addresses, me)`
 * and passes it to `back({ whitelistProof })`.
 */
import { keccak_256 } from '@noble/hashes/sha3';
import type { PublicKey } from '@solana/web3.js';

function cmp(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < 32; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function hashPair(a: Uint8Array, b: Uint8Array): Uint8Array {
  const [x, y] = cmp(a, b) <= 0 ? [a, b] : [b, a];
  const buf = new Uint8Array(64);
  buf.set(x, 0);
  buf.set(y, 32);
  return keccak_256(buf);
}

function levels(leaves: Uint8Array[]): Uint8Array[][] {
  const out: Uint8Array[][] = [leaves];
  let cur = leaves;
  while (cur.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      const a = cur[i]!;
      const b = i + 1 < cur.length ? cur[i + 1]! : cur[i]!; // odd → duplicate last
      next.push(hashPair(a, b));
    }
    out.push(next);
    cur = next;
  }
  return out;
}

const leafOf = (pk: PublicKey): Uint8Array => keccak_256(pk.toBuffer());

/** Compute the 32-byte allowlist root for `addresses`. */
export function merkleRoot(addresses: PublicKey[]): Uint8Array {
  if (addresses.length === 0) throw new Error('merkle: empty allowlist');
  const ls = levels(addresses.map(leafOf));
  return ls[ls.length - 1]![0]!;
}

/** Build the membership proof for `target` (pass to back({ whitelistProof })). */
export function merkleProof(addresses: PublicKey[], target: PublicKey): Uint8Array[] {
  let idx = addresses.findIndex((a) => a.equals(target));
  if (idx < 0) throw new Error('merkle: target not in allowlist');
  const ls = levels(addresses.map(leafOf));
  const proof: Uint8Array[] = [];
  for (let l = 0; l < ls.length - 1; l++) {
    const level = ls[l]!;
    const sib = idx % 2 === 0 ? (idx + 1 < level.length ? idx + 1 : idx) : idx - 1;
    proof.push(level[sib]!);
    idx = Math.floor(idx / 2);
  }
  return proof;
}
