/**
 * `set_metadata` — set the project token's Metaplex Token Metadata (name/symbol/
 * uri shown in wallets). 6 accounts; the program does the Metaplex CPI. Cosmetic:
 * a raise functions without it, but you'll usually call it once after createRaise
 * (still Fundraising). Immutable from birth — name/symbol/uri can never change.
 *
 * The `uri` points at a hosted JSON metadata file (e.g. Arweave/IPFS) following
 * the Metaplex fungible-token schema; host it yourself.
 */
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { disc, borshString } from '../coder';
import { MPL_TOKEN_METADATA_ID, SYSVAR_RENT_PUBKEY } from '../constants';
import { launchpadPda, metadataPda } from '../pda';
import { acctKey as k } from './shared';

export interface SetMetadataParams {
  programId: PublicKey;
  projectId: bigint;
  mint: PublicKey;
  /** Project owner — signs and pays the metadata account rent. */
  owner: PublicKey;
  name: string;
  symbol: string;
  /** URI of the hosted metadata JSON (<= 200 chars). */
  uri: string;
}

export function setMetadataInstruction(p: SetMetadataParams): TransactionInstruction {
  const launchpad = launchpadPda(p.programId, p.projectId);
  return new TransactionInstruction({
    programId: p.programId,
    keys: [
      k(launchpad, false, true),
      k(p.mint, false, false),
      k(metadataPda(p.mint), false, true),
      k(p.owner, true, true),
      k(MPL_TOKEN_METADATA_ID, false, false),
      k(SystemProgram.programId, false, false),
      k(SYSVAR_RENT_PUBKEY, false, false),
    ],
    data: Buffer.concat([
      disc('set_metadata'),
      borshString(p.name),
      borshString(p.symbol),
      borshString(p.uri),
    ]),
  });
}
