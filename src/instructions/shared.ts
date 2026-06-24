/** Shared instruction-building helpers. */
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '../constants';
import { ata } from '../pda';

/** AccountMeta shorthand. */
export const acctKey = (pubkey: PublicKey, isSigner: boolean, isWritable: boolean) => ({
  pubkey,
  isSigner,
  isWritable,
});

/**
 * createAssociatedTokenAccountIdempotent (ATA-program instruction byte 1). Used
 * as a leading instruction so a recipient's token/USDC ATA exists before a
 * deposit/swap pushes into it — idempotent, so a repeat is a no-op (not a revert).
 */
export function createAtaIdempotentInstruction(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      acctKey(payer, true, true),
      acctKey(ata(mint, owner), false, true),
      acctKey(owner, false, false),
      acctKey(mint, false, false),
      acctKey(SystemProgram.programId, false, false),
      acctKey(TOKEN_PROGRAM_ID, false, false),
    ],
    data: Buffer.from([1]),
  });
}
