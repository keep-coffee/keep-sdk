/**
 * On-chain account decoders. Layouts mirror the Rust structs in
 * `programs/keep/src/state/*.rs` exactly (field order + borsh encoding). The
 * 8-byte Anchor account discriminator is verified, then the body is read.
 *
 * Money-path correctness: these are decoded directly from chain bytes and
 * cross-checked against the live mainnet program (see test/read-mainnet.mjs).
 */
import { PublicKey } from '@solana/web3.js';
import { accountDisc } from './coder';
import { AccessMode, ProjectState, STATE_NAMES } from './types';

/** Sequential little-endian borsh reader over an account body. */
class Reader {
  private o = 0;
  constructor(private readonly buf: Buffer) {}
  private take(n: number): Buffer {
    if (this.o + n > this.buf.length) throw new Error(`account decode: out of bounds at ${this.o}+${n}/${this.buf.length}`);
    const s = this.buf.subarray(this.o, this.o + n);
    this.o += n;
    return s;
  }
  u8(): number { return this.take(1)[0]!; }
  bool(): boolean { return this.u8() !== 0; }
  u16(): number { return this.take(2).readUInt16LE(0); }
  u32(): number { return this.take(4).readUInt32LE(0); }
  u64(): bigint { return this.take(8).readBigUInt64LE(0); }
  i64(): bigint { return this.take(8).readBigInt64LE(0); }
  pubkey(): PublicKey { return new PublicKey(this.take(32)); }
  /** borsh Option<bool>: 1-byte tag (0=None,1=Some) + bool if Some. */
  optionBool(): boolean | null { return this.u8() === 1 ? this.bool() : null; }
  /** borsh Option<Pubkey>: 1-byte tag + pubkey if Some. */
  optionPubkey(): PublicKey | null { return this.u8() === 1 ? this.pubkey() : null; }
}

function body(data: Uint8Array, structName: string): Buffer {
  const buf = Buffer.from(data);
  if (buf.length < 8) throw new Error(`${structName}: account data too short (${buf.length} bytes)`);
  if (!buf.subarray(0, 8).equals(accountDisc(structName))) {
    throw new Error(`${structName}: account discriminator mismatch (wrong account type?)`);
  }
  return buf.subarray(8);
}

function stateAt(i: number): ProjectState {
  const s = STATE_NAMES[i];
  if (!s) throw new Error(`unknown ProjectState discriminant ${i}`);
  return s;
}
function modeAt(i: number): AccessMode {
  if (i === 0 || i === 1 || i === 2) return i as AccessMode;
  throw new Error(`unknown AccessMode discriminant ${i}`);
}

/** `LaunchpadState` — the per-project master account. */
export interface RaiseAccount {
  projectId: bigint;
  projectOwner: PublicKey;
  projectTokenMint: PublicKey;
  usdcVault: PublicKey;
  tokenVault: PublicKey;
  raydiumPool: PublicKey;
  raydiumLpMint: PublicKey;
  raydiumLpVault: PublicKey;
  mode: AccessMode;
  state: ProjectState;
  raiseTarget: bigint;
  tokenSupply: bigint;
  launchPriceNum: bigint;
  launchPriceDen: bigint;
  totalRaised: bigint;
  depositorCount: number;
  whitelistCount: number;
  deployTs: bigint;
  fundraiseDeadlineTs: bigint;
  launchTs: bigint;
  d7JudgmentTs: bigint;
  d30JudgmentTs: bigint;
  d7Passed: boolean | null;
  d30Passed: boolean | null;
  finalizeCaller: PublicKey | null;
  bump: number;
  whitelistMaxPerAddress: bigint;
  publicMaxPerAddress: bigint;
  whitelistAllocation: bigint;
  whitelistRaised: bigint;
  fundraiseStartTs: bigint;
  feeSplitProjectBps: number;
  successThresholdBps: number;
}

export function decodeRaise(data: Uint8Array): RaiseAccount {
  const r = new Reader(body(data, 'LaunchpadState'));
  return {
    projectId: r.u64(),
    projectOwner: r.pubkey(),
    projectTokenMint: r.pubkey(),
    usdcVault: r.pubkey(),
    tokenVault: r.pubkey(),
    raydiumPool: r.pubkey(),
    raydiumLpMint: r.pubkey(),
    raydiumLpVault: r.pubkey(),
    mode: modeAt(r.u8()),
    state: stateAt(r.u8()),
    raiseTarget: r.u64(),
    tokenSupply: r.u64(),
    launchPriceNum: r.u64(),
    launchPriceDen: r.u64(),
    totalRaised: r.u64(),
    depositorCount: r.u32(),
    whitelistCount: r.u32(),
    deployTs: r.i64(),
    fundraiseDeadlineTs: r.i64(),
    launchTs: r.i64(),
    d7JudgmentTs: r.i64(),
    d30JudgmentTs: r.i64(),
    d7Passed: r.optionBool(),
    d30Passed: r.optionBool(),
    finalizeCaller: r.optionPubkey(),
    bump: r.u8(),
    whitelistMaxPerAddress: r.u64(),
    publicMaxPerAddress: r.u64(),
    whitelistAllocation: r.u64(),
    whitelistRaised: r.u64(),
    fundraiseStartTs: r.i64(),
    feeSplitProjectBps: r.u16(),
    successThresholdBps: r.u16(),
  };
}

/** `DepositorAccount` — a backer's per-project deposit ledger. */
export interface DepositorAccount {
  launchpad: PublicKey;
  user: PublicKey;
  depositedUsdc: bigint;
  tokenAllocation: bigint;
  tokenClaimed: bigint;
  refundClaimed: boolean;
  bump: number;
}

export function decodeDepositor(data: Uint8Array): DepositorAccount {
  const r = new Reader(body(data, 'DepositorAccount'));
  return {
    launchpad: r.pubkey(),
    user: r.pubkey(),
    depositedUsdc: r.u64(),
    tokenAllocation: r.u64(),
    tokenClaimed: r.u64(),
    refundClaimed: r.bool(),
    bump: r.u8(),
  };
}

/** `ClaimPool` — the failure-path refund pool (exists only after a failed gate). */
export interface ClaimPoolAccount {
  launchpad: PublicKey;
  totalUsdc: bigint;
  initialTokenSupply: bigint;
  failureTs: bigint;
  haircutPaid: boolean;
  bump: number;
  feeToPlatform: bigint;
}

export function decodeClaimPool(data: Uint8Array): ClaimPoolAccount {
  const r = new Reader(body(data, 'ClaimPool'));
  return {
    launchpad: r.pubkey(),
    totalUsdc: r.u64(),
    initialTokenSupply: r.u64(),
    failureTs: r.i64(),
    haircutPaid: r.bool(),
    bump: r.u8(),
    feeToPlatform: r.u64(),
  };
}

/** `FactoryConfig` — the global singleton (governance + the project counter). */
export interface FactoryConfigAccount {
  owner: PublicKey;
  platformFeeReceiver: PublicKey;
  /** The id the NEXT created project will get (and its launchpad PDA seed). */
  nextProjectId: bigint;
  paused: boolean;
  bump: number;
  feeSplitProjectBps: number;
}

export function decodeFactory(data: Uint8Array): FactoryConfigAccount {
  const r = new Reader(body(data, 'FactoryConfig'));
  return {
    owner: r.pubkey(),
    platformFeeReceiver: r.pubkey(),
    nextProjectId: r.u64(),
    paused: r.bool(),
    bump: r.u8(),
    feeSplitProjectBps: r.u16(),
  };
}

/** `EmergencyState` — the freeze singleton. `frozenUntilTs > now` ⟹ frozen. */
export interface EmergencyStateAccount {
  /** 0 = not frozen; else a unix ts the happy-path flows are frozen until. */
  frozenUntilTs: bigint;
  triggeredBy: PublicKey;
  bump: number;
}

export function decodeEmergency(data: Uint8Array): EmergencyStateAccount {
  const r = new Reader(body(data, 'EmergencyState'));
  return {
    frozenUntilTs: r.i64(),
    triggeredBy: r.pubkey(),
    bump: r.u8(),
  };
}
