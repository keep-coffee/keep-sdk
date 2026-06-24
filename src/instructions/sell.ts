/**
 * `sell` (Keep-native) — the hold-period sell path. It updates the TWAP from the
 * live pool reserves and then CPI-swaps token→USDC through Raydium, in one tx
 * (19 accounts). Used while the raise is in HoldPeriod1/HoldPeriod2; after a raise
 * graduates (Success) there's nothing protocol-specific to do, so selling is a
 * plain Raydium swap (see raydiumSwapInstruction). Mirrors keep-demo.js contractSellIx.
 */
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { disc, u64le } from '../coder';
import { TOKEN_PROGRAM_ID } from '../constants';
import { ata, emergencyPda, twapPda } from '../pda';
import type { PoolInfo } from '../raydium';
import { acctKey } from './shared';

export interface SellNativeParams {
  programId: PublicKey;
  launchpad: PublicKey;
  pool: PoolInfo;
  /** The seller's wallet — signs. */
  seller: PublicKey;
  /** Project tokens to sell, in base units. */
  tokenIn: bigint;
  /** Minimum USDC out (slippage floor) — never pass 0 on a real trade. */
  minUsdcOut: bigint;
}

/** Build the Keep-native `sell` instruction (19 accounts). */
export function sellNativeInstruction(p: SellNativeParams): TransactionInstruction {
  const { pool } = p;
  return new TransactionInstruction({
    programId: p.programId,
    keys: [
      acctKey(p.launchpad, false, false),
      acctKey(emergencyPda(p.programId), false, false),
      acctKey(twapPda(p.programId, p.launchpad), false, true),
      acctKey(pool.raydiumProgram, false, false),
      acctKey(pool.poolState, false, true),
      acctKey(pool.ammConfig, false, false),
      acctKey(pool.authority, false, false),
      acctKey(pool.token0Vault, false, true),
      acctKey(pool.token1Vault, false, true),
      acctKey(pool.observation, false, true),
      acctKey(ata(pool.projectMint, p.seller), false, true), // user token ata (input)
      acctKey(ata(pool.usdcMint, p.seller), false, true), // user usdc ata (output)
      acctKey(pool.projectMint, false, false),
      acctKey(pool.usdcMint, false, false),
      acctKey(TOKEN_PROGRAM_ID, false, false),
      acctKey(TOKEN_PROGRAM_ID, false, false),
      acctKey(p.seller, true, true),
      acctKey(TOKEN_PROGRAM_ID, false, false),
      acctKey(SystemProgram.programId, false, false),
    ],
    data: Buffer.concat([disc('sell'), u64le(p.tokenIn), u64le(p.minUsdcOut)]),
  });
}
