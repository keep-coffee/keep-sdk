/**
 * `back` — deposit USDC into a raise during fundraising (the refund-protected
 * entry point). Mirrors the proven frontend construction in keep-demo.js:
 *
 *   1. a leading idempotent ATA-create for the backer's project-token account
 *      (the contract no longer inits it in-instruction — Anchor 0.30.1's ATA
 *      init blew the SBF 4 KB stack frame; the backer still pays its rent here),
 *   2. the 9-account `deposit(amount, whitelist_proof)`.
 *
 * ABI target: v2.4 (`deposit(amount, proof)`). For a Public raise the proof is
 * an empty Vec (4 zero bytes) and account #4 is the program id (Anchor's
 * Option::None placeholder).
 */
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { disc, u64le, borshVec32 } from '../coder';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '../constants';
import { ata, depositorPda, emergencyPda, wlRootPda } from '../pda';

const k = (pubkey: PublicKey, isSigner: boolean, isWritable: boolean) => ({ pubkey, isSigner, isWritable });

export interface BackParams {
  programId: PublicKey;
  launchpad: PublicKey;
  usdcMint: PublicKey;
  /** The raise's USDC vault (from the launchpad account). */
  usdcVault: PublicKey;
  /** The raise's project-token mint (from the launchpad account). */
  projectMint: PublicKey;
  /** The backer's wallet (signs + pays). */
  backer: PublicKey;
  /** USDC amount in base units (6 decimals). */
  amount: bigint;
  /**
   * Merkle proof that `backer` is on a Private/Hybrid allowlist (sorted-pair
   * keccak256, leaf = keccak256(backer)). Omit for Public raises.
   */
  whitelistProof?: Uint8Array[];
}

/**
 * Build the [createUserTokenAtaIdempotent, deposit] instruction pair. The caller
 * signs the transaction as `backer`.
 */
export function backInstructions(p: BackParams): TransactionInstruction[] {
  const proof = p.whitelistProof ?? [];
  const userTokenAta = ata(p.projectMint, p.backer);

  // 1) createAssociatedTokenAccountIdempotent (ATA-program instruction byte 1).
  const createAtaIx = new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      k(p.backer, true, true), // payer
      k(userTokenAta, false, true), // ata to create
      k(p.backer, false, false), // owner
      k(p.projectMint, false, false), // mint
      k(SystemProgram.programId, false, false),
      k(TOKEN_PROGRAM_ID, false, false),
    ],
    data: Buffer.from([1]),
  });

  // 2) deposit — account #4 is the allowlist gate: the wl_root PDA when proving
  // membership, else the program id (Option::None).
  const wlGate = proof.length > 0 ? wlRootPda(p.programId, p.launchpad) : p.programId;
  const depositIx = new TransactionInstruction({
    programId: p.programId,
    keys: [
      k(p.launchpad, false, true),
      k(emergencyPda(p.programId), false, false),
      k(depositorPda(p.programId, p.launchpad, p.backer), false, true),
      k(wlGate, false, false),
      k(ata(p.usdcMint, p.backer), false, true),
      k(p.usdcVault, false, true),
      k(p.backer, true, true),
      k(TOKEN_PROGRAM_ID, false, false),
      k(SystemProgram.programId, false, false),
    ],
    data: Buffer.concat([disc('deposit'), u64le(p.amount), borshVec32(proof)]),
  });

  return [createAtaIx, depositIx];
}
