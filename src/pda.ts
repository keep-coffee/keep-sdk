/**
 * Program-derived address helpers. Seeds mirror `programs/keep/src/constants.rs`
 * and the proven derivations in `programs/keep/tests/e2e/common.mjs`.
 *
 * All take the active `programId` explicitly so a single import works across
 * mainnet / devnet / sandbox.
 */
import { PublicKey } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from './constants';

const enc = (s: string): Buffer => Buffer.from(s, 'utf8');

const SEED = {
  factory: enc('keep_factory_v1'),
  emergency: enc('keep_emergency_v1'),
  launchpad: enc('launchpad'),
  twap: enc('twap'),
  vesting: enc('vesting'),
  claimPool: enc('claim_pool'),
  depositor: enc('depositor'),
  wlRoot: enc('wl_root'),
  poolAuthority: enc('pool_authority'),
} as const;

function u64leBuf(n: bigint | number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

/** Factory singleton (governance + fee config). */
export function factoryPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEED.factory], programId)[0];
}

/** Emergency-freeze singleton. */
export function emergencyPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEED.emergency], programId)[0];
}

/** Per-project launchpad state, keyed by the sequential project id. */
export function launchpadPda(programId: PublicKey, projectId: bigint | number): PublicKey {
  return PublicKey.findProgramAddressSync([SEED.launchpad, u64leBuf(projectId)], programId)[0];
}

export function twapPda(programId: PublicKey, launchpad: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEED.twap, launchpad.toBuffer()], programId)[0];
}

export function vestingPda(programId: PublicKey, launchpad: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEED.vesting, launchpad.toBuffer()], programId)[0];
}

/** Failure-path refund pool (created by finalize on a failed gate). */
export function claimPoolPda(programId: PublicKey, launchpad: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEED.claimPool, launchpad.toBuffer()], programId)[0];
}

/** A backer's per-project deposit record. */
export function depositorPda(programId: PublicKey, launchpad: PublicKey, user: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED.depositor, launchpad.toBuffer(), user.toBuffer()],
    programId,
  )[0];
}

/** Per-project Merkle allowlist root (Private/Hybrid). */
export function wlRootPda(programId: PublicKey, launchpad: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEED.wlRoot, launchpad.toBuffer()], programId)[0];
}

/**
 * Data-less PDA that custodies the creator's SOL deposit and the LP tokens, and
 * signs the Raydium pool ops. Returned with its bump for callers that need it.
 */
export function poolAuthorityPda(programId: PublicKey, launchpad: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED.poolAuthority, launchpad.toBuffer()], programId);
}

/** Associated token account for (mint, owner). `allowOwnerOffCurve` for PDAs. */
export function ata(mint: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}
