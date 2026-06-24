/**
 * Network configs + protocol constants for the Keep launchpad.
 *
 * Every address here is the on-chain truth, mirrored from the deployed program
 * and `programs/keep/src/constants.rs` (the Rust SSOT). The on-chain program is
 * closed-source; these public addresses and the instruction interface are
 * observable on-chain regardless, so this client exposes them without exposing
 * the program internals.
 */
import { PublicKey } from '@solana/web3.js';

// Public surface = two environments only: mainnet (production) + devnet (test).
// The internal fast-clock sandbox is not exposed to external developers; for
// internal soak testing, pass a custom NetworkConfig to the client instead.
export type Network = 'mainnet' | 'devnet';

export interface NetworkConfig {
  readonly network: Network;
  readonly cluster: 'mainnet-beta' | 'devnet';
  /** Default public RPC. Pass your own Connection in production. */
  readonly defaultRpc: string;
  readonly programId: PublicKey;
  readonly usdcMint: PublicKey;
  readonly raydiumCpmm: PublicKey;
  /** Raydium 1% fee-tier amm_config (address-pinned by the program). */
  readonly raydiumAmmConfig: PublicKey;
  /** Raydium's create-pool-fee vault (validated by Raydium, not the platform). */
  readonly raydiumCreatePoolFee: PublicKey;
  /** USDC raise target baked into every project at create (6 decimals, raw). */
  readonly raiseTarget: bigint;
}

export const NETWORKS: Record<Network, NetworkConfig> = {
  mainnet: {
    network: 'mainnet',
    cluster: 'mainnet-beta',
    defaultRpc: 'https://rpc.keep.coffee',
    programId: new PublicKey('ETVtC29T7ExxYyWSkpzKPxzrL3SRyrGPRhZe3FwXmFAo'),
    usdcMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    raydiumCpmm: new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'),
    raydiumAmmConfig: new PublicKey('G95xxie3XbkCqtE39GgQ9Ggc7xBC8Uceve7HFDEFApkc'),
    raydiumCreatePoolFee: new PublicKey('DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8'),
    raiseTarget: 20_000_000_000n, // 20,000 USDC
  },
  devnet: {
    network: 'devnet',
    cluster: 'devnet',
    defaultRpc: 'https://api.devnet.solana.com',
    programId: new PublicKey('Coj4mFsEuTtki548eJxBPp4xCAauVusDf2tVzACzjoV3'),
    usdcMint: new PublicKey('MKPnXt6U8X6ngFnG2KecjzZFDHUiDsmk6gxZe4b94gV'), // devnet mock USDC
    raydiumCpmm: new PublicKey('DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb'),
    raydiumAmmConfig: new PublicKey('EsTevfacYXpuho5VBuzBjDZi8dtWidGnXoSYAr8krTvz'),
    raydiumCreatePoolFee: new PublicKey('3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy'),
    raiseTarget: 20_000_000_000n, // 20,000 USDC
  },
};

// ── Well-known program / sysvar addresses ──
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
export const SYSVAR_RENT_PUBKEY = new PublicKey('SysvarRent111111111111111111111111111111111');

// ── Protocol economics (env-independent; mirror constants.rs) ──
export const PROJECT_TOKEN_DECIMALS = 6;
export const USDC_DECIMALS = 6;
/** 1,000,000,000 tokens × 1e6 = total raw supply per project. */
export const TOTAL_TOKEN_SUPPLY = 1_000_000_000_000_000n;
/** 60% of supply → backers. */
export const USER_TOKEN_AMOUNT = 600_000_000_000_000n;
/** 30% of supply → seeded into the Raydium LP at bootstrap. */
export const LP_TOKEN_AMOUNT = 300_000_000_000_000n;
/** 10% of supply → project owner, success-path vesting only. */
export const PROJECT_TOKEN_AMOUNT = 100_000_000_000_000n;
/** Hard floor + default for the per-project success gate (0.85× launch). */
export const DEFAULT_SUCCESS_THRESHOLD_BPS = 8_500;
/** Upper sanity bound on a per-project success gate (3.0× launch). */
export const MAX_SUCCESS_THRESHOLD_BPS = 30_000;
/** Creator's up-front SOL deposit taken at create_project (0.3 SOL). */
export const CREATOR_DEPOSIT_LAMPORTS = 300_000_000n;
export const BPS_DENOMINATOR = 10_000;
export const MAX_NAME_LEN = 32;
export const MAX_SYMBOL_LEN = 8;
