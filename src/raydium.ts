/**
 * Raydium CPMM helpers — the secondary market a raise graduates into. We resolve
 * the pool from CHAIN (never re-derive from an amm_config index: pools are created
 * under a cluster-specific config, so a guessed derivation points at vaults that
 * don't exist). The pool address is on the launchpad (raidium_pool); amm_config,
 * both vaults and token ordering are read from the pool account; observation +
 * authority are cluster-independent PDAs. Mirrors keep-demo.js loadPool/raydiumSwapIx.
 */
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { u64le } from './coder';
import { TOKEN_PROGRAM_ID } from './constants';
import { ata } from './pda';
import { acctKey } from './instructions/shared';

/** Anchor discriminator for Raydium CPMM `swap_base_input`. */
export const RAYDIUM_SWAP_BASE_INPUT_DISC = Uint8Array.from([143, 190, 90, 218, 196, 30, 51, 222]);

/** Raydium CPMM trade fee (bps) — used only for off-chain quoting. */
export const RAYDIUM_FEE_BPS = 25n;

const seed = (s: string): Buffer => Buffer.from(s, 'utf8');

export interface PoolInfo {
  raydiumProgram: PublicKey;
  poolState: PublicKey;
  ammConfig: PublicKey;
  authority: PublicKey;
  token0Vault: PublicKey;
  token1Vault: PublicKey;
  observation: PublicKey;
  /** Pool-side USDC vault. */
  usdcVault: PublicKey;
  /** Pool-side project-token vault. */
  tokenVault: PublicKey;
  usdcIsToken0: boolean;
  usdcMint: PublicKey;
  projectMint: PublicKey;
}

/**
 * Decode a Raydium CPMM PoolState account into the addresses a swap needs.
 * Layout: disc(8) amm_config@8 creator@40 token0_vault@72 token1_vault@104
 *         lp_mint@136 token0_mint@168 token1_mint@200.
 */
export function decodePool(args: {
  raydiumProgram: PublicKey;
  poolState: PublicKey;
  poolData: Uint8Array;
  usdcMint: PublicKey;
  projectMint: PublicKey;
}): PoolInfo {
  const b = Buffer.from(args.poolData);
  if (b.length < 232) throw new Error(`raydium pool: data too short (${b.length} bytes)`);
  const at = (o: number): PublicKey => new PublicKey(b.subarray(o, o + 32));
  const ammConfig = at(8);
  const token0Vault = at(72);
  const token1Vault = at(104);
  const token0Mint = at(168);
  const usdcIsToken0 = token0Mint.equals(args.usdcMint);
  const authority = PublicKey.findProgramAddressSync(
    [seed('vault_and_lp_mint_auth_seed')],
    args.raydiumProgram,
  )[0];
  const observation = PublicKey.findProgramAddressSync(
    [seed('observation'), args.poolState.toBuffer()],
    args.raydiumProgram,
  )[0];
  return {
    raydiumProgram: args.raydiumProgram,
    poolState: args.poolState,
    ammConfig,
    authority,
    token0Vault,
    token1Vault,
    observation,
    usdcVault: usdcIsToken0 ? token0Vault : token1Vault,
    tokenVault: usdcIsToken0 ? token1Vault : token0Vault,
    usdcIsToken0,
    usdcMint: args.usdcMint,
    projectMint: args.projectMint,
  };
}

/**
 * Raydium CPMM `swap_base_input` (13 accounts). `inputIsUsdc=true` → buy
 * (USDC→token); `false` → sell (token→USDC). The caller signs as `user`.
 */
export function raydiumSwapInstruction(
  pool: PoolInfo,
  user: PublicKey,
  inputIsUsdc: boolean,
  amountIn: bigint,
  minOut: bigint,
): TransactionInstruction {
  const userUsdc = ata(pool.usdcMint, user);
  const userToken = ata(pool.projectMint, user);
  return new TransactionInstruction({
    programId: pool.raydiumProgram,
    keys: [
      acctKey(user, true, true),
      acctKey(pool.authority, false, false),
      acctKey(pool.ammConfig, false, false),
      acctKey(pool.poolState, false, true),
      acctKey(inputIsUsdc ? userUsdc : userToken, false, true),
      acctKey(inputIsUsdc ? userToken : userUsdc, false, true),
      acctKey(inputIsUsdc ? pool.usdcVault : pool.tokenVault, false, true),
      acctKey(inputIsUsdc ? pool.tokenVault : pool.usdcVault, false, true),
      acctKey(TOKEN_PROGRAM_ID, false, false),
      acctKey(TOKEN_PROGRAM_ID, false, false),
      acctKey(inputIsUsdc ? pool.usdcMint : pool.projectMint, false, false),
      acctKey(inputIsUsdc ? pool.projectMint : pool.usdcMint, false, false),
      acctKey(pool.observation, false, true),
    ],
    data: Buffer.concat([Buffer.from(RAYDIUM_SWAP_BASE_INPUT_DISC), u64le(amountIn), u64le(minOut)]),
  });
}

/**
 * Constant-product output quote for a CPMM swap (off-chain, for setting minOut).
 * `out = reserveOut * inAfterFee / (reserveIn + inAfterFee)`, fee = RAYDIUM_FEE_BPS.
 */
export function quoteSwapOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const inAfterFee = (amountIn * (10_000n - RAYDIUM_FEE_BPS)) / 10_000n;
  return (reserveOut * inAfterFee) / (reserveIn + inAfterFee);
}
