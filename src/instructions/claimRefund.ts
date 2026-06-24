/**
 * `claimRefund` — pull a refund on a terminal raise. Two on-chain branches,
 * one instruction (11 accounts, no args), mirroring keep-demo.js:
 *
 *   • Cancelled: 1:1 USDC back to the depositor (the `depositor` account is
 *     required). A Fundraising raise whose deadline has passed self-cancels
 *     when this is called — refunds don't depend on keeper liveness.
 *   • Failed1 / Failed2: burn the backer's burnable tokens, receive USDC
 *     pro-rata from the ClaimPool. The failure-only accounts (claim_pool, mint,
 *     user_token_ata, token_vault) are real; absent ones are the program id
 *     (Anchor's Option::None placeholder).
 */
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { disc } from '../coder';
import { TOKEN_PROGRAM_ID } from '../constants';
import { ata, claimPoolPda, depositorPda } from '../pda';
import { acctKey as k } from './shared';

export interface ClaimRefundParams {
  programId: PublicKey;
  launchpad: PublicKey;
  usdcMint: PublicKey;
  /** The raise's USDC vault (from the launchpad account). */
  usdcVault: PublicKey;
  /** The raise's project-token mint (from the launchpad account). */
  projectMint: PublicKey;
  /** The raise's project-token vault (from the launchpad account). */
  tokenVault: PublicKey;
  /** The backer's wallet — signs and receives the refund. */
  backer: PublicKey;
  /** Failed1/Failed2 (burn-and-refund) vs Cancelled (1:1 USDC). */
  isFailure: boolean;
  /** Whether the backer has an on-chain DepositorAccount (required for Cancelled). */
  hasDepositor: boolean;
}

export function claimRefundInstruction(p: ClaimRefundParams): TransactionInstruction {
  const PID = p.programId;
  const W = p.isFailure;
  // Optional accounts → real address or the program id (Option::None placeholder).
  const depositor = p.hasDepositor ? depositorPda(PID, p.launchpad, p.backer) : PID;
  const claimPool = W ? claimPoolPda(PID, p.launchpad) : PID;
  const mint = W ? p.projectMint : PID;
  const userTokenAta = W ? ata(p.projectMint, p.backer) : PID;
  const tokenVault = W ? p.tokenVault : PID;

  return new TransactionInstruction({
    programId: PID,
    keys: [
      k(p.launchpad, false, true),
      k(depositor, false, p.hasDepositor), // writable only when a real depositor
      k(claimPool, false, W),
      k(p.usdcVault, false, true),
      k(ata(p.usdcMint, p.backer), false, true),
      k(mint, false, W),
      k(userTokenAta, false, W),
      k(tokenVault, false, W),
      k(p.backer, true, true),
      k(TOKEN_PROGRAM_ID, false, false),
      k(SystemProgram.programId, false, false),
    ],
    data: disc('claim_refund'), // no args
  });
}
