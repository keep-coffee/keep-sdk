/**
 * `set_whitelist_root` — commit/refresh a Private/Hybrid raise's Merkle allowlist
 * root (4 accounts). Callable by the project owner during Fundraising. Build the
 * root with `merkleRoot(addresses)`. The root crosses the ABI as a length-prefixed
 * byte vec (Vec<u8>), pinned to 32 bytes on-chain.
 */
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { disc, borshBytes } from '../coder';
import { launchpadPda, wlRootPda } from '../pda';
import { acctKey as k } from './shared';

export interface SetWhitelistRootParams {
  programId: PublicKey;
  projectId: bigint;
  /** Project owner — signs and pays the WhitelistRoot PDA rent. */
  owner: PublicKey;
  /** 32-byte Merkle root (from merkleRoot(addresses)). */
  root: Uint8Array;
}

export function setWhitelistRootInstruction(p: SetWhitelistRootParams): TransactionInstruction {
  if (p.root.length !== 32) throw new Error('whitelist root must be 32 bytes');
  const launchpad = launchpadPda(p.programId, p.projectId);
  return new TransactionInstruction({
    programId: p.programId,
    keys: [
      k(launchpad, false, false),
      k(wlRootPda(p.programId, launchpad), false, true),
      k(p.owner, true, true),
      k(SystemProgram.programId, false, false),
    ],
    data: Buffer.concat([disc('set_whitelist_root'), borshBytes(p.root)]),
  });
}
