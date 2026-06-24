/**
 * KeepClient — the SDK entry point. Reads resolve every project/backer account
 * straight from the chain (no backend dependency for money-relevant data); write
 * methods return UNSIGNED transactions for the caller (wallet or agent) to sign.
 * The SDK never holds a key.
 */
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import type { Commitment } from '@solana/web3.js';
import { NETWORKS } from './constants';
import type { Network, NetworkConfig } from './constants';
import { launchpadPda, depositorPda, claimPoolPda } from './pda';
import { decodeRaise, decodeDepositor, decodeClaimPool } from './accounts';
import type { RaiseAccount, DepositorAccount, ClaimPoolAccount } from './accounts';
import { ProjectState } from './types';
import { backInstructions } from './instructions/back';

export interface KeepClientConfig {
  /** Target network. Defaults to 'mainnet'. */
  network?: Network;
  /** Custom network config — overrides `network` (advanced/internal testing). */
  config?: NetworkConfig;
  /** Bring your own Connection (recommended in production). */
  connection?: Connection;
  /** Or just an RPC URL; a Connection is created for you. */
  rpcUrl?: string;
  /** Commitment for the created Connection (default 'confirmed'). */
  commitment?: Commitment;
}

/** Shared transaction-shaping options for write methods. */
export interface TxOpts {
  /** Compute-unit limit (default 250_000). Pass 0 to omit the budget ix. */
  computeUnitLimit?: number;
  /** Priority fee in micro-lamports per CU (default: none). */
  priorityFeeMicroLamports?: number;
  /** Override the recent blockhash (else a fresh one is fetched). */
  recentBlockhash?: string;
}

export interface BackOpts extends TxOpts {
  /** USDC amount in base units (6 decimals). */
  amount: bigint;
  /** The backer's wallet — signs and pays. */
  backer: PublicKey;
  /** Merkle proof for Private/Hybrid allowlisted backers (omit for Public). */
  whitelistProof?: Uint8Array[];
}

export class KeepClient {
  readonly config: NetworkConfig;
  readonly connection: Connection;

  constructor(opts: KeepClientConfig = {}) {
    this.config = opts.config ?? NETWORKS[opts.network ?? 'mainnet'];
    this.connection =
      opts.connection ??
      new Connection(opts.rpcUrl ?? this.config.defaultRpc, opts.commitment ?? 'confirmed');
  }

  get programId(): PublicKey {
    return this.config.programId;
  }

  /** Derive the on-chain launchpad address for a project id. */
  launchpadAddress(projectId: bigint | number): PublicKey {
    return launchpadPda(this.programId, projectId);
  }

  // ── Reads ──

  /** Read a raise by its sequential project id. Returns null if it doesn't exist. */
  async getRaise(projectId: bigint | number): Promise<RaiseAccount | null> {
    return this.getRaiseByAddress(this.launchpadAddress(projectId));
  }

  /** Read a raise directly by its launchpad account address. */
  async getRaiseByAddress(launchpad: PublicKey): Promise<RaiseAccount | null> {
    const ai = await this.connection.getAccountInfo(launchpad);
    return ai ? decodeRaise(ai.data) : null;
  }

  /** Read a backer's deposit position in a raise. Null if they never backed it. */
  async getPosition(
    projectId: bigint | number,
    user: PublicKey,
  ): Promise<DepositorAccount | null> {
    const lp = this.launchpadAddress(projectId);
    const ai = await this.connection.getAccountInfo(depositorPda(this.programId, lp, user));
    return ai ? decodeDepositor(ai.data) : null;
  }

  /**
   * Read the failure-path refund pool for a raise. Null unless the raise has
   * failed a gate (the pool is created by `finalize` only on a failure verdict).
   */
  async getClaimPool(projectId: bigint | number): Promise<ClaimPoolAccount | null> {
    const lp = this.launchpadAddress(projectId);
    const ai = await this.connection.getAccountInfo(claimPoolPda(this.programId, lp));
    return ai ? decodeClaimPool(ai.data) : null;
  }

  // ── Writes (return unsigned transactions; the caller signs) ──

  /**
   * Back (deposit into) a raise during fundraising — the refund-protected entry.
   * Returns an unsigned Transaction (fee payer = backer, blockhash set) ready to
   * sign and send. Reverts here early if the raise isn't open.
   */
  async back(projectId: bigint | number, opts: BackOpts): Promise<Transaction> {
    const launchpad = this.launchpadAddress(projectId);
    const raise = await this.getRaiseByAddress(launchpad);
    if (!raise) throw new Error(`raise #${String(projectId)} not found`);
    if (raise.state !== ProjectState.Fundraising) {
      throw new Error(`raise #${String(projectId)} is ${raise.state} — deposits are closed`);
    }
    const ixns = backInstructions({
      programId: this.programId,
      launchpad,
      usdcMint: this.config.usdcMint,
      usdcVault: raise.usdcVault,
      projectMint: raise.projectTokenMint,
      backer: opts.backer,
      amount: opts.amount,
      whitelistProof: opts.whitelistProof,
    });
    return this.buildTx(ixns, opts.backer, opts);
  }

  /** Assemble instructions into an unsigned tx with a compute budget + blockhash. */
  private async buildTx(
    instructions: TransactionInstruction[],
    feePayer: PublicKey,
    opts?: TxOpts,
  ): Promise<Transaction> {
    const tx = new Transaction();
    const cuLimit = opts?.computeUnitLimit ?? 250_000;
    if (cuLimit > 0) tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }));
    if (opts?.priorityFeeMicroLamports && opts.priorityFeeMicroLamports > 0) {
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: opts.priorityFeeMicroLamports }));
    }
    for (const ix of instructions) tx.add(ix);
    tx.feePayer = feePayer;
    tx.recentBlockhash =
      opts?.recentBlockhash ?? (await this.connection.getLatestBlockhash('confirmed')).blockhash;
    return tx;
  }
}
