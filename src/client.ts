/**
 * KeepClient — the read entry point. Builds on a Solana Connection and resolves
 * every project/backer account from the chain (no backend dependency for the
 * money-relevant reads). Write builders attach in later modules.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import type { Commitment } from '@solana/web3.js';
import { NETWORKS } from './constants';
import type { Network, NetworkConfig } from './constants';
import { launchpadPda, depositorPda, claimPoolPda } from './pda';
import {
  decodeRaise,
  decodeDepositor,
  decodeClaimPool,
} from './accounts';
import type { RaiseAccount, DepositorAccount, ClaimPoolAccount } from './accounts';

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
}
