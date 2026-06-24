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
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import type { Commitment } from '@solana/web3.js';
import { NETWORKS } from './constants';
import type { Network, NetworkConfig } from './constants';
import { launchpadPda, depositorPda, claimPoolPda, factoryPda } from './pda';
import { decodeRaise, decodeDepositor, decodeClaimPool, decodeFactory } from './accounts';
import type {
  RaiseAccount,
  DepositorAccount,
  ClaimPoolAccount,
  FactoryConfigAccount,
} from './accounts';
import { ProjectState, AccessMode, isTradable } from './types';
import { backInstructions } from './instructions/back';
import { claimRefundInstruction } from './instructions/claimRefund';
import { claimInstruction } from './instructions/claim';
import { createProjectInstruction, initVaultsInstruction } from './instructions/createRaise';
import { setWhitelistRootInstruction } from './instructions/setWhitelistRoot';
import { setMetadataInstruction } from './instructions/setMetadata';
import { createAtaIdempotentInstruction } from './instructions/shared';
import { sellNativeInstruction } from './instructions/sell';
import { decodePool, raydiumSwapInstruction, quoteSwapOut } from './raydium';
import type { PoolInfo } from './raydium';

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

export interface RefundOpts extends TxOpts {
  /** The backer's wallet — signs and receives the refund. */
  backer: PublicKey;
}

export interface ClaimOpts extends TxOpts {
  /** The backer's wallet — signs and receives the tokens. */
  backer: PublicKey;
}

export interface BuyOpts extends TxOpts {
  /** USDC to spend, in base units. */
  usdcIn: bigint;
  /** Minimum project tokens out (slippage floor) — never 0 on a real trade. */
  minTokenOut: bigint;
  /** The trader's wallet — signs and pays. */
  trader: PublicKey;
}

export interface SellOpts extends TxOpts {
  /** Project tokens to sell, in base units. */
  tokenIn: bigint;
  /** Minimum USDC out (slippage floor) — never 0 on a real trade. */
  minUsdcOut: bigint;
  /** The trader's wallet — signs. */
  trader: PublicKey;
}

export interface SwapQuote {
  amountIn: bigint;
  /** Expected output before slippage — derive your minOut from this. */
  expectedOut: bigint;
  usdcReserve: bigint;
  tokenReserve: bigint;
}

export interface CreateRaiseOpts extends TxOpts {
  /** Project owner — signs and pays. */
  owner: PublicKey;
  /**
   * The new token mint. Generate a Keypair (optionally vanity `*keep`) and sign
   * the returned transaction with BOTH the owner and this mint keypair.
   */
  mint: PublicKey;
  /** Display name (<= 32 chars). */
  name: string;
  /** Token symbol (<= 8 chars). */
  symbol: string;
  /** Access mode (default Public). */
  mode?: AccessMode;
  /** Per-address USDC cap for allowlisted backers (0 = unlimited). */
  whitelistMaxPerAddress?: bigint;
  /** Per-address USDC cap for public backers (0 = unlimited). */
  publicMaxPerAddress?: bigint;
  /** Hybrid reserved allocation in USDC base units (0 = none). */
  whitelistAllocation?: bigint;
  /** Warmup/Upcoming window before deposits open, in seconds (0 = immediate). */
  warmupSecs?: bigint | number;
  /** Success gate in bps of launch price (0 = program default/floor 8500). */
  successThresholdBps?: number;
}

export interface CreateRaiseResult {
  /** Unsigned tx — sign with [owner, mintKeypair] and send. */
  transaction: Transaction;
  /** The id assigned to this raise (valid only if this tx lands next). */
  projectId: bigint;
  /** The launchpad account address this raise will live at. */
  launchpad: PublicKey;
}

export interface SetWhitelistRootOpts extends TxOpts {
  /** Project owner — signs and pays. */
  owner: PublicKey;
  /** 32-byte Merkle root from `merkleRoot(addresses)`. */
  root: Uint8Array;
}

export interface SetMetadataOpts extends TxOpts {
  /** Project owner — signs and pays. */
  owner: PublicKey;
  name: string;
  symbol: string;
  /** URI of the hosted metadata JSON (Metaplex schema, <= 200 chars). */
  uri: string;
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

  /** Read the global FactoryConfig singleton (governance + the project counter). */
  async getFactory(): Promise<FactoryConfigAccount | null> {
    const ai = await this.connection.getAccountInfo(factoryPda(this.programId));
    return ai ? decodeFactory(ai.data) : null;
  }

  /**
   * List raises by reading the factory's project counter and batch-fetching each
   * launchpad (no getProgramAccounts — RPC-friendly). Returns decoded raises with
   * their launchpad address; undecodable/missing slots are skipped.
   */
  async listRaises(opts?: {
    fromId?: bigint;
    limit?: number;
  }): Promise<Array<RaiseAccount & { address: PublicKey }>> {
    const factory = await this.getFactory();
    if (!factory) return [];
    const ids: bigint[] = [];
    for (let i = opts?.fromId ?? 0n; i < factory.nextProjectId; i++) {
      ids.push(i);
      if (opts?.limit && ids.length >= opts.limit) break;
    }
    const out: Array<RaiseAccount & { address: PublicKey }> = [];
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const pdas = batch.map((id) => this.launchpadAddress(id));
      const infos = await this.connection.getMultipleAccountsInfo(pdas);
      infos.forEach((ai, j) => {
        const address = pdas[j];
        if (ai && address) {
          try {
            out.push({ ...decodeRaise(ai.data), address });
          } catch {
            /* skip undecodable */
          }
        }
      });
    }
    return out;
  }

  // ── Writes (return unsigned transactions; the caller signs) ──

  /**
   * Create a new raise — a builder deploys a launchpad. Reads the FactoryConfig
   * for the next project id, then builds an atomic create_project + init_vaults
   * transaction. Sign it with BOTH the owner and the mint keypair:
   *
   *   const { transaction } = await keep.createRaise({ owner, mint: mintKp.publicKey, name, symbol });
   *   await connection.sendTransaction(transaction, [ownerKp, mintKp]);
   *
   * The returned `projectId` is only valid if this tx lands next — a concurrent
   * create bumps the counter and this tx fails the seeds check; just retry.
   */
  async createRaise(opts: CreateRaiseOpts): Promise<CreateRaiseResult> {
    const factory = await this.getFactory();
    if (!factory) throw new Error('factory not initialized on this network');
    if (factory.paused) throw new Error('factory is paused — new raises are disabled');
    const projectId = factory.nextProjectId;
    const launchpad = this.launchpadAddress(projectId);
    const createIx = createProjectInstruction({
      programId: this.programId,
      projectId,
      owner: opts.owner,
      mint: opts.mint,
      name: opts.name,
      symbol: opts.symbol,
      mode: opts.mode ?? AccessMode.Public,
      whitelistMaxPerAddress: opts.whitelistMaxPerAddress ?? 0n,
      publicMaxPerAddress: opts.publicMaxPerAddress ?? 0n,
      whitelistAllocation: opts.whitelistAllocation ?? 0n,
      warmupSecs: BigInt(opts.warmupSecs ?? 0),
      successThresholdBps: opts.successThresholdBps ?? 0,
    });
    const initIx = initVaultsInstruction({
      programId: this.programId,
      projectId,
      owner: opts.owner,
      mint: opts.mint,
      usdcMint: this.config.usdcMint,
    });
    const transaction = await this.buildTx([createIx, initIx], opts.owner, {
      ...opts,
      computeUnitLimit: opts.computeUnitLimit ?? 400_000,
    });
    return { transaction, projectId, launchpad };
  }

  /**
   * Commit a Private/Hybrid raise's allowlist root (build it with
   * `merkleRoot(addresses)`). Owner-signed, during Fundraising.
   */
  async setWhitelistRoot(
    projectId: bigint | number,
    opts: SetWhitelistRootOpts,
  ): Promise<Transaction> {
    const ix = setWhitelistRootInstruction({
      programId: this.programId,
      projectId: BigInt(projectId),
      owner: opts.owner,
      root: opts.root,
    });
    return this.buildTx([ix], opts.owner, opts);
  }

  /**
   * Set the project token's Metaplex metadata (name/symbol/uri in wallets).
   * Cosmetic; call once after createRaise (still Fundraising). Reads the raise
   * for the mint. `uri` must point at a hosted metadata JSON you host.
   */
  async setMetadata(projectId: bigint | number, opts: SetMetadataOpts): Promise<Transaction> {
    const raise = await this.getRaise(projectId);
    if (!raise) throw new Error(`raise #${String(projectId)} not found`);
    const ix = setMetadataInstruction({
      programId: this.programId,
      projectId: BigInt(projectId),
      mint: raise.projectTokenMint,
      owner: opts.owner,
      name: opts.name,
      symbol: opts.symbol,
      uri: opts.uri,
    });
    return this.buildTx([ix], opts.owner, opts);
  }

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

  /**
   * Claim a refund on a terminal raise. Works on Cancelled (1:1) and Failed1/
   * Failed2 (burn-and-refund); a Fundraising raise past its deadline self-cancels
   * when this runs. Returns an unsigned Transaction. Throws if not refundable.
   */
  async claimRefund(projectId: bigint | number, opts: RefundOpts): Promise<Transaction> {
    const launchpad = this.launchpadAddress(projectId);
    const raise = await this.getRaiseByAddress(launchpad);
    if (!raise) throw new Error(`raise #${String(projectId)} not found`);

    const now = Math.floor(Date.now() / 1000);
    const isFailure =
      raise.state === ProjectState.Failed1 || raise.state === ProjectState.Failed2;
    const expired =
      raise.state === ProjectState.Fundraising && now >= Number(raise.fundraiseDeadlineTs);
    const isCancelled = raise.state === ProjectState.Cancelled || expired;
    if (!isFailure && !isCancelled) {
      throw new Error(`raise #${String(projectId)} is ${raise.state} — not refundable`);
    }

    const depAi = await this.connection.getAccountInfo(
      depositorPda(this.programId, launchpad, opts.backer),
    );
    const hasDepositor = !!depAi;
    if (isCancelled && !hasDepositor) {
      throw new Error('this wallet has no deposit to refund');
    }

    const ix = claimRefundInstruction({
      programId: this.programId,
      launchpad,
      usdcMint: this.config.usdcMint,
      usdcVault: raise.usdcVault,
      projectMint: raise.projectTokenMint,
      tokenVault: raise.tokenVault,
      backer: opts.backer,
      isFailure,
      hasDepositor,
    });
    return this.buildTx([ix], opts.backer, opts);
  }

  /**
   * Claim a successful raise's token allocation to the backer's wallet. Normally
   * unnecessary — the keeper auto-distributes tokens — but available as a backstop
   * from HoldPeriod1 onward. The instruction self-creates the backer's token ATA.
   */
  async claim(projectId: bigint | number, opts: ClaimOpts): Promise<Transaction> {
    const launchpad = this.launchpadAddress(projectId);
    const raise = await this.getRaiseByAddress(launchpad);
    if (!raise) throw new Error(`raise #${String(projectId)} not found`);
    if (!isTradable(raise.state)) {
      throw new Error(`raise #${String(projectId)} is ${raise.state} — tokens not claimable yet`);
    }
    const ix = claimInstruction({
      programId: this.programId,
      launchpad,
      tokenVault: raise.tokenVault,
      projectMint: raise.projectTokenMint,
      backer: opts.backer,
    });
    return this.buildTx([ix], opts.backer, opts);
  }

  /**
   * Buy the project token on the open market (Raydium) — works in any trading
   * state (HoldPeriod1/2 or graduated Success). This is a normal swap with NO
   * refund protection, distinct from `back`. Returns an unsigned Transaction.
   */
  async buy(projectId: bigint | number, opts: BuyOpts): Promise<Transaction> {
    const raise = await this.requireTradable(projectId);
    const pool = await this.loadPoolForRaise(raise);
    const ixns = [
      createAtaIdempotentInstruction(opts.trader, opts.trader, raise.projectTokenMint),
      raydiumSwapInstruction(pool, opts.trader, true, opts.usdcIn, opts.minTokenOut),
    ];
    return this.buildTx(ixns, opts.trader, opts);
  }

  /**
   * Sell the project token. During HoldPeriod the Keep-native `sell` is used (it
   * refreshes the TWAP that drives the D+7/D+30 judgment, then swaps); once
   * graduated (Success) it's a plain Raydium swap. Returns an unsigned Transaction.
   */
  async sell(projectId: bigint | number, opts: SellOpts): Promise<Transaction> {
    const raise = await this.requireTradable(projectId);
    const launchpad = this.launchpadAddress(projectId);
    const pool = await this.loadPoolForRaise(raise);
    const createUsdcAta = createAtaIdempotentInstruction(opts.trader, opts.trader, this.config.usdcMint);
    const inHold =
      raise.state === ProjectState.HoldPeriod1 || raise.state === ProjectState.HoldPeriod2;
    const swapIx = inHold
      ? sellNativeInstruction({
          programId: this.programId,
          launchpad,
          pool,
          seller: opts.trader,
          tokenIn: opts.tokenIn,
          minUsdcOut: opts.minUsdcOut,
        })
      : raydiumSwapInstruction(pool, opts.trader, false, opts.tokenIn, opts.minUsdcOut);
    return this.buildTx([createUsdcAta, swapIx], opts.trader, opts);
  }

  /**
   * Off-chain swap quote from the live pool reserves — use it to set a sane
   * `minTokenOut` / `minUsdcOut` with your own slippage tolerance.
   */
  async quote(
    projectId: bigint | number,
    args: { side: 'buy' | 'sell'; amountIn: bigint },
  ): Promise<SwapQuote> {
    const pool = await this.loadPool(projectId);
    const [r0, r1] = await Promise.all([
      this.connection.getTokenAccountBalance(pool.token0Vault),
      this.connection.getTokenAccountBalance(pool.token1Vault),
    ]);
    const a0 = BigInt(r0.value.amount);
    const a1 = BigInt(r1.value.amount);
    const usdcReserve = pool.usdcIsToken0 ? a0 : a1;
    const tokenReserve = pool.usdcIsToken0 ? a1 : a0;
    const expectedOut =
      args.side === 'buy'
        ? quoteSwapOut(args.amountIn, usdcReserve, tokenReserve)
        : quoteSwapOut(args.amountIn, tokenReserve, usdcReserve);
    return { amountIn: args.amountIn, expectedOut, usdcReserve, tokenReserve };
  }

  /** Load + decode the raise's Raydium pool. Throws if it isn't bootstrapped. */
  async loadPool(projectId: bigint | number): Promise<PoolInfo> {
    const raise = await this.getRaise(projectId);
    if (!raise) throw new Error(`raise #${String(projectId)} not found`);
    return this.loadPoolForRaise(raise);
  }

  private async requireTradable(projectId: bigint | number): Promise<RaiseAccount> {
    const raise = await this.getRaise(projectId);
    if (!raise) throw new Error(`raise #${String(projectId)} not found`);
    if (!isTradable(raise.state)) {
      throw new Error(`raise #${String(projectId)} is ${raise.state} — not trading yet`);
    }
    return raise;
  }

  private async loadPoolForRaise(raise: RaiseAccount): Promise<PoolInfo> {
    if (raise.raydiumPool.equals(SystemProgram.programId)) {
      throw new Error('raise has no Raydium pool yet (not bootstrapped)');
    }
    const ai = await this.connection.getAccountInfo(raise.raydiumPool);
    if (!ai) throw new Error('Raydium pool account not found');
    return decodePool({
      raydiumProgram: this.config.raydiumCpmm,
      poolState: raise.raydiumPool,
      poolData: ai.data,
      usdcMint: this.config.usdcMint,
      projectMint: raise.projectTokenMint,
    });
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
