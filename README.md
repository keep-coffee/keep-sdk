# @keep-coffee/sdk

Non-custodial, refundable **onchain fundraising on Solana** — built for AI builders and agents.

Keep lets a builder raise USDC from their users against a fixed target. The SDK
builds the transactions; **your wallet or agent signs them.** The SDK never holds
a key and never touches funds — backers pay the contract directly.

> Status: early development (pre-release `0.0.x`). The API below is stabilizing;
> addresses and derivations are verified against the live mainnet program.

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
const tx = await keep.back(0, { usdc: 50_000_000n, backer: wallet.publicKey }); // 50 USDC
const sig = await connection.sendTransaction(tx, [wallet]);
```

Every write method returns an **unsigned** `Transaction` (or `VersionedTransaction`).
You add your signer — a `Keypair`, a browser wallet, or an agent's signer — and send it.

## Core API

```ts
// Lifecycle — Keep-native, refund-protected
keep.createRaise({ name, symbol, ... })      // a builder starts a raise
keep.back(projectId, { usdc, backer })       // fund a raise at the fixed price
keep.claim(projectId, { backer })            // collect your tokens on success
keep.claimRefund(projectId, { backer })      // get your refund on a failure path

// Secondary market — the open Raydium pool, after a raise graduates
keep.buy(projectId,  { usdcIn,  minTokenOut, trader })
keep.sell(projectId, { tokenIn, minUsdcOut,  trader })

// Reads
keep.getRaise(projectId)
keep.listRaises()
keep.getPosition(projectId, wallet)
```

`back` and `buy` are different actions, deliberately kept distinct:

- **`back`** happens during the raise, at a fixed price, and carries the failure-path
  refund protection above.
- **`buy`** is an ordinary open-market swap after the token is trading. It has **no
  refund protection** — it's a normal market trade.

## Use it from an agent

```ts
import { KeepClient } from '@keep-coffee/sdk';
// A LangChain / ELIZA tool wrapper ships in examples/.
```

## Honesty

We'd rather you trust the chain than trust us:

- Small team. The program is **governed by a multisig**, not a single key.
- **No third-party audit.** The on-chain program is closed-source. Don't take our
  word for the rules — read the contract state and verify them yourself.
- Backers **cannot** pull a refund at will. Refunds exist only on the two failure
  paths described above; a successful raise is a normal market, not a guarantee.

## License

MIT — see [LICENSE](./LICENSE). The SDK is open; the on-chain program is not.
