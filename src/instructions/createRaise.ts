/**
 * `createRaise` — a builder deploys a new launchpad. Two on-chain instructions,
 * combined into one atomic transaction:
 *
 *   1. create_project — inits the launchpad + TWAP PDAs and the project token
 *      mint (the mint is a SIGNER: pass a fresh keypair, optionally vanity-ground
 *      to a `*keep` suffix). Authority is the launchpad PDA, freeze authority is
 *      None from birth. 9 accounts, 8 args.
 *   2. init_vaults — creates the launchpad-owned USDC + token vaults, mints the
 *      full supply into the token vault, and revokes the mint authority. 11 accounts.
 *
 * They're separate instructions because five `init` constraints in one would blow
 * the SBF 4 KB stack frame — but they fit in one transaction, so a raise comes up
 * atomically with a single signature pair (owner + mint keypair).
 *
 * The launchpad PDA seed is `factory.next_project_id`, so the caller must read the
 * FactoryConfig first (KeepClient.createRaise does this). Metaplex token metadata
 * (name/logo in wallets) is set separately via set_metadata — not required for the
 * raise to function.
 */
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { disc, u8, u16le, u64le, i64le, borshString } from '../coder';
import { ASSOCIATED_TOKEN_PROGRAM_ID, SYSVAR_RENT_PUBKEY, TOKEN_PROGRAM_ID } from '../constants';
import { ata, factoryPda, launchpadPda, poolAuthorityPda, twapPda } from '../pda';
import { AccessMode } from '../types';
import { acctKey as k } from './shared';

export interface CreateProjectParams {
  programId: PublicKey;
  /** factory.next_project_id (read from chain first). */
  projectId: bigint;
  owner: PublicKey;
  /** The new token mint — the caller signs the tx with this keypair. */
  mint: PublicKey;
  name: string;
  symbol: string;
  mode: AccessMode;
  whitelistMaxPerAddress: bigint;
  publicMaxPerAddress: bigint;
  whitelistAllocation: bigint;
  warmupSecs: bigint;
  /** 0 → program applies the default/floor (8500 = 0.85×). */
  successThresholdBps: number;
}

export function createProjectInstruction(p: CreateProjectParams): TransactionInstruction {
  const launchpad = launchpadPda(p.programId, p.projectId);
  const [poolAuthority] = poolAuthorityPda(p.programId, launchpad);
  return new TransactionInstruction({
    programId: p.programId,
    keys: [
      k(factoryPda(p.programId), false, true),
      k(launchpad, false, true),
      k(twapPda(p.programId, launchpad), false, true),
      k(p.mint, true, true), // mint keypair — signs initialize_mint
      k(p.owner, true, true),
      k(poolAuthority, false, true),
      k(TOKEN_PROGRAM_ID, false, false),
      k(SystemProgram.programId, false, false),
      k(SYSVAR_RENT_PUBKEY, false, false),
    ],
    data: Buffer.concat([
      disc('create_project'),
      borshString(p.name),
      borshString(p.symbol),
      u8(p.mode),
      u64le(p.whitelistMaxPerAddress),
      u64le(p.publicMaxPerAddress),
      u64le(p.whitelistAllocation),
      i64le(p.warmupSecs),
      u16le(p.successThresholdBps),
    ]),
  });
}

export interface InitVaultsParams {
  programId: PublicKey;
  projectId: bigint;
  /** Payer + signer (the project owner self-pays — no backend co-signer). */
  owner: PublicKey;
  mint: PublicKey;
  usdcMint: PublicKey;
}

export function initVaultsInstruction(p: InitVaultsParams): TransactionInstruction {
  const launchpad = launchpadPda(p.programId, p.projectId);
  const [poolAuthority] = poolAuthorityPda(p.programId, launchpad);
  return new TransactionInstruction({
    programId: p.programId,
    keys: [
      k(launchpad, false, true),
      k(p.mint, false, false),
      k(p.usdcMint, false, false),
      k(ata(p.usdcMint, launchpad), false, true), // usdc_vault (launchpad-owned ATA)
      k(ata(p.mint, launchpad), false, true), // token_vault
      k(p.owner, true, true), // payer
      k(poolAuthority, false, true),
      k(TOKEN_PROGRAM_ID, false, false),
      k(ASSOCIATED_TOKEN_PROGRAM_ID, false, false),
      k(SystemProgram.programId, false, false),
      k(SYSVAR_RENT_PUBKEY, false, false),
    ],
    data: disc('init_vaults'), // no args
  });
}
