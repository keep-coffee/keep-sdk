/**
 * Plain Node usage: read a raise, quote the market, and back it.
 *
 *   npm i @keep-coffee/sdk @solana/web3.js
 *   KEEP_RPC=https://your-rpc KEYPAIR=./id.json npx tsx examples/read-and-back.ts
 *
 * The SDK builds an unsigned transaction; you sign + send it. It never holds a key.
 */
import { readFileSync } from 'node:fs';
import { Connection, Keypair } from '@solana/web3.js';
import { KeepClient } from '@keep-coffee/sdk';

const PROJECT_ID = 0;

async function main(): Promise<void> {
  const connection = new Connection(
    process.env.KEEP_RPC ?? 'https://api.mainnet-beta.solana.com',
    'confirmed',
  );
  const keep = new KeepClient({ network: 'mainnet', connection });

  // 1. Read the raise straight from chain.
  const raise = await keep.getRaise(PROJECT_ID);
  if (!raise) throw new Error(`raise #${PROJECT_ID} not found`);
  console.log(
    `raise #${PROJECT_ID}: ${raise.state}  ${raise.totalRaised}/${raise.raiseTarget} USDC  (${raise.depositorCount} backers)`,
  );

  if (raise.state !== 'Fundraising') {
    console.log('not fundraising — nothing to back right now.');
    return;
  }

  // 2. Back it (load your wallet however you like).
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(process.env.KEYPAIR ?? './id.json', 'utf8'))),
  );
  const tx = await keep.back(PROJECT_ID, { amount: 50_000_000n, backer: wallet.publicKey }); // 50 USDC
  const sig = await connection.sendTransaction(tx, [wallet]);
  console.log('backed — signature:', sig);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
