/**
 * Expose Keep to an AI agent as LangChain tools — the "built for agents" path.
 *
 *   npm i @keep-coffee/sdk @solana/web3.js @langchain/core zod
 *
 * The read tools answer questions; the build tools return an unsigned, base64
 * transaction for your agent's signer to sign and send. The SDK never holds a
 * key — signing always stays on your side.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { KeepClient } from '@keep-coffee/sdk';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const keep = new KeepClient({
  network: 'mainnet',
  connection: new Connection(process.env.KEEP_RPC ?? 'https://api.mainnet-beta.solana.com'),
});

/** Read a raise's on-chain state. */
export const getRaiseTool = new DynamicStructuredTool({
  name: 'keep_get_raise',
  description: 'Read the on-chain state of a Keep fundraise by its numeric project id.',
  schema: z.object({ projectId: z.number().int().nonnegative() }),
  func: async ({ projectId }) => {
    const r = await keep.getRaise(projectId);
    if (!r) return 'raise not found';
    return JSON.stringify({
      state: r.state,
      totalRaised: r.totalRaised.toString(),
      raiseTarget: r.raiseTarget.toString(),
      backers: r.depositorCount,
    });
  },
});

/** Quote a buy/sell so the agent can pick a slippage-safe minOut. */
export const quoteTool = new DynamicStructuredTool({
  name: 'keep_quote',
  description: 'Quote the expected output of a buy or sell on a graduated Keep market.',
  schema: z.object({
    projectId: z.number().int().nonnegative(),
    side: z.enum(['buy', 'sell']),
    amountIn: z.string().describe('input amount in base units (string to preserve precision)'),
  }),
  func: async ({ projectId, side, amountIn }) => {
    const q = await keep.quote(projectId, { side, amountIn: BigInt(amountIn) });
    return JSON.stringify({ expectedOut: q.expectedOut.toString() });
  },
});

/** Build an unsigned "back this raise" transaction (the agent's signer sends it). */
export const backTool = new DynamicStructuredTool({
  name: 'keep_back',
  description:
    'Build an unsigned transaction to back (fund) a Keep raise with USDC. Returns base64; the caller signs and sends it.',
  schema: z.object({
    projectId: z.number().int().nonnegative(),
    usdc: z.string().describe('USDC to commit, in base units (6 decimals)'),
    backer: z.string().describe('the backer wallet public key'),
  }),
  func: async ({ projectId, usdc, backer }) => {
    const tx = await keep.back(projectId, { amount: BigInt(usdc), backer: new PublicKey(backer) });
    return tx.serialize({ requireAllSignatures: false }).toString('base64');
  },
});

/** Drop this array into a LangChain agent / tool-calling loop. */
export const keepTools = [getRaiseTool, quoteTool, backTool];
