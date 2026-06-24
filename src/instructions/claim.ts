/**
 * `claim` — a backer pulls their project-token allocation to their wallet
 * (available from HoldPeriod1 onward). In normal operation the keeper auto-
 * distributes tokens (a push), so this is a backstop a backer rarely needs —
 * the frontend doesn't even surface it. We include it for completeness.
 *
 * The instruction self-creates the backer's token ATA (init_if_needed), so no
 * leading createAta is required. 11 accounts, no args. Mirrors the on-chain
 * `Claim<'info>` struct (the authoritative order; there is no frontend builder
 * to diff against).
 */
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { disc } from '../coder';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  SYSVAR_RENT_PUBKEY,
  TOKEN_PROGRAM_ID,
} from '../constants';
import { ata, depositorPda, emergencyPda } from '../pda';
import { acctKey as k } from './shared';

export interface ClaimParams {
  programId: PublicKey;
  launchpad: PublicKey;
  /** The raise's project-token vault (from the launchpad account). */
  tokenVault: PublicKey;
  /** The raise's project-token mint (from the launchpad account). */
  projectMint: PublicKey;
  /** The backer's wallet — signs and pays the ATA rent if needed. */
  backer: PublicKey;
}

export function claimInstruction(p: ClaimParams): TransactionInstruction {
  return new TransactionInstruction({
    programId: p.programId,
    keys: [
      k(p.launchpad, false, false),
      k(emergencyPda(p.programId), false, false),
      k(depositorPda(p.programId, p.launchpad, p.backer), false, true),
      k(p.tokenVault, false, true),
      k(p.projectMint, false, true),
      k(ata(p.projectMint, p.backer), false, true), // user token ATA (init_if_needed)
      k(p.backer, true, true),
      k(TOKEN_PROGRAM_ID, false, false),
      k(ASSOCIATED_TOKEN_PROGRAM_ID, false, false),
      k(SystemProgram.programId, false, false),
      k(SYSVAR_RENT_PUBKEY, false, false),
    ],
    data: disc('claim'), // no args
  });
}
