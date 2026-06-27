# @keep-coffee/sdk

[![npm](https://img.shields.io/npm/v/@keep-coffee/sdk.svg)](https://www.npmjs.com/package/@keep-coffee/sdk)
[![CI](https://github.com/keep-coffee/keep-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/keep-coffee/keep-sdk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Non-custodial, refundable **onchain fundraising on Solana** — built for AI builders and agents.

Keep lets a builder raise USDC from their users against a fixed target. The SDK
builds the transactions; **your wallet or agent signs them.** The SDK never holds
a key and never touches funds — backers pay the contract directly.

> `0.1.0` — live on Solana mainnet (Keep program v2.4). Pre-1.0: the API may
> still evolve. Every instruction is byte-checked against the on-chain program.

## Why it exists

- **Non-custodial.** Backers pay the on-chain program, not a platform wallet. We
  never hold or move a cent.
- **Refundable on the failure paths only.** If a raise doesn't fill, every backer
  is refunded in full. If it later fails its on-chain price check, the contract
  refunds them automatically — ~95% at day 7, ~85% at day 30 — funded by the
  protocol mechanism itself, never a balance sheet.
- **A successful raise is a normal open market afterward** — not principal-protected.

## Install

```bash
npm i @keep-coffee/sdk @solana/web3.js
```

## Quickstart

```ts
import { Connection, Keypair } from '@solana/web3.js';
import { KeepClient } from '@keep-coffee/sdk';

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const keep = new KeepClient({ network: 'mainnet', connection });

// Read a live raise.
const raise = await keep.getRaise(0);
console.log(raise.state, raise.totalRaised, raise.raiseTarget);

// Back a raise during fundraising (fixed-price, refundable on the failure paths).
const tx = await keep.back(0, { amount: 50_000_000n, backer: wallet.publicKey }); // 50 USDC
const sig = await connection.sendTransaction(tx, [wallet]);
```

Every write method returns an **unsigned** `Transaction` (or `VersionedTransaction`).
You add your signer — a `Keypair`, a browser wallet, or an agent's signer — and send it.

## Core API

```ts
// Reads
keep.getRaise(projectId)                  // a raise's full on-chain state
keep.listRaises()                         // all raises (decoded)
keep.getPosition(projectId, wallet)       // a backer's deposit position
keep.getClaimPool(projectId)              // the failure-path refund pool
keep.getFactory()                         // global config + next project id
keep.quote(projectId, { side, amountIn }) // expected swap output (to set minOut)

// Start a raise (a builder deploys a launchpad)
keep.createRaise({ owner, mint, name, symbol })  // sign with [owner, mintKeypair]
keep.setMetadata(projectId, { owner, name, symbol, uri })  // Metaplex name/logo
keep.setWhitelistRoot(projectId, { owner, root })          // Private/Hybrid allowlist

// Back, refund, claim (Keep-native, refund-protected)
keep.back(projectId, { amount, backer })        // fund a raise at the fixed price
keep.claimRefund(projectId, { backer })         // refund on a failure / cancel path
keep.claim(projectId, { backer })               // collect your tokens on success

// Trade the graduated market
keep.buy(projectId,  { usdcIn,  minTokenOut, trader })  // open-market swap (Raydium)
keep.sell(projectId, { tokenIn, minUsdcOut,  trader })  // Keep-native in hold, Raydium after
```

Starting a raise mints a new token, so sign the returned transaction with both
the owner and the mint keypair:

```ts
import { Keypair } from '@solana/web3.js';

const mint = Keypair.generate(); // optionally vanity-ground to a *keep suffix
const { transaction, projectId } = await keep.createRaise({
  owner: owner.publicKey, mint: mint.publicKey, name: 'My Project', symbol: 'MYP',
});
await connection.sendTransaction(transaction, [owner, mint]);
```

Every write method returns an unsigned `Transaction`.

`back` and `buy` are different actions, deliberately kept distinct:

- **`back`** happens during the raise, at a fixed price, and carries the failure-path
  refund protection above.
- **`buy`** is an ordinary open-market swap after the token is trading. It has **no
  refund protection** — it's a normal market trade.

## Networks & versioning

Mainnet only. This SDK targets the Keep program **v2.4** and follows semantic
versioning — a breaking program upgrade ships as a new SDK major. Reads stay
forward-compatible with append-only account growth. For advanced or internal
testing against another deployment, pass a custom `config` to `KeepClient`.

## Use it from an agent

The SDK builds transactions; your agent's signer sends them — so it drops into any
agent framework. Full LangChain tools are in
[`examples/langchain-tools.ts`](./examples/langchain-tools.ts):

```ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { Connection, PublicKey } from '@solana/web3.js';
import { KeepClient } from '@keep-coffee/sdk';
import { z } from 'zod';

const keep = new KeepClient({ network: 'mainnet', connection: new Connection(RPC) });

const backTool = new DynamicStructuredTool({
  name: 'keep_back',
  description: 'Build an unsigned transaction to back a Keep raise with USDC.',
  schema: z.object({ projectId: z.number(), usdc: z.string(), backer: z.string() }),
  func: async ({ projectId, usdc, backer }) =>
    (await keep.back(projectId, { amount: BigInt(usdc), backer: new PublicKey(backer) }))
      .serialize({ requireAllSignatures: false }).toString('base64'),
});
```

For plain-Node usage, see [`examples/read-and-back.ts`](./examples/read-and-back.ts).

## Resources

- Product: [keep.coffee](https://keep.coffee)
- Issues & questions: [github.com/keep-coffee/keep-sdk/issues](https://github.com/keep-coffee/keep-sdk/issues)

## License

MIT — see [LICENSE](./LICENSE).
