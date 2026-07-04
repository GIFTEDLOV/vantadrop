# VantaDrop

Confidential token distributions for teams, investors, and communities.

VantaDrop is a submission to the **Zama Developer Program — Mainnet Season 3, Special Bounty Track × TokenOps**. It's a frontend for confidential token distribution (airdrops, disperse, vesting) built on the [`@tokenops/sdk`](https://www.npmjs.com/package/@tokenops/sdk), which wraps Zama's FHEVM protocol and OpenZeppelin's [ERC-7984](https://eips.ethereum.org/EIPS/eip-7984) confidential fungible token standard.

## Status

**Research + runtime spike phase. No frontend app code yet.**

### Current Status

- ✅ TokenOps runtime spike passed on Sepolia (live transactions, not a simulation).
- ✅ Confidential airdrop create/fund passed (`createAndFundConfidentialAirdrop`).
- ✅ Recipient decrypt-and-verify (`getClaimAmount` → decrypt) and claim both passed, with the decrypted allocation matching the admin-encrypted amount exactly.
- ✅ `VantaDropRegistry` (optional public metadata registry — see `docs/research/registry-decision.md`) deployed to Sepolia at [`0x2a3dd1dff5c121b1fc24c7412e519c075bc5f8a1`](https://sepolia.etherscan.io/address/0x2a3dd1dff5c121b1fc24c7412e519c075bc5f8a1). TokenOps remains the entire confidential distribution engine — this registry only stores public metadata for Distribution Room pages.
- ⏭️ Frontend implementation is next — see `docs/research/build-plan.md`'s Implementation Order.

Full details, transaction hashes, and the account-object bug found and fixed along the way are in `docs/research/tokenops-sdk-notes.md`'s "Live Sepolia Runtime Spike Result" section. `scripts/spike-tokenops-sepolia.ts` is the canonical, proven SDK integration reference going forward.

See:

- [`docs/research/tokenops-sdk-notes.md`](docs/research/tokenops-sdk-notes.md) — ground-truth SDK research (versions, exports, APIs, verified against the installed package, not guessed) plus the live Sepolia spike result.
- [`docs/research/build-plan.md`](docs/research/build-plan.md) — 4-day build plan.
- [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) — working rules for AI agents contributing to this repo.

## What this will be

An issuer connects a wallet, funds a confidential airdrop/disperse/vesting campaign for a set of recipients, and recipients can claim **and decrypt-verify their own allocation** — without any allocation amount ever being visible on-chain to anyone but its recipient.

## Network

Ethereum Sepolia only, for now. `fhe-airdrop` and `fhe-vesting` are Sepolia-only per TokenOps (mainnet pending further audits/pilots); `fhe-disperse` is live on both Sepolia and mainnet.

## Non-goals right now

- No UI has been designed or built yet.
- TokenOps' factories/singletons on Sepolia are pre-deployed and consumed as-is — this project does not deploy or modify any part of the confidential distribution engine. The one contract this project does deploy, `VantaDropRegistry`, is a thin, optional public-metadata layer that never touches recipient lists, allocation amounts, or anything else TokenOps keeps confidential (see `docs/research/registry-decision.md`).
- Nothing in this repo should be treated as reviewed/production-ready until the research docs have been reviewed by the project owner.
