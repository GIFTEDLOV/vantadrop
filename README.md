# VantaDrop

Confidential token distributions for teams, investors, and communities.

VantaDrop is a submission to the **Zama Developer Program — Mainnet Season 3, Special Bounty Track × TokenOps**. It's a frontend for confidential token distribution (airdrops, disperse, vesting) built on the [`@tokenops/sdk`](https://www.npmjs.com/package/@tokenops/sdk), which wraps Zama's FHEVM protocol and OpenZeppelin's [ERC-7984](https://eips.ethereum.org/EIPS/eip-7984) confidential fungible token standard.

## Status

**Full confidential-distribution flow proven live on Sepolia, end-to-end, on the actual public app pages.**

### Current Status

- ✅ TokenOps runtime spike passed on Sepolia (live transactions, not a simulation).
- ✅ Confidential airdrop create/fund passed (`createAndFundConfidentialAirdrop`).
- ✅ Recipient decrypt-and-verify (`getClaimAmount` → decrypt) and claim both passed, with the decrypted allocation matching the admin-encrypted amount exactly.
- ✅ `VantaDropRegistry` (optional public metadata registry — see `docs/research/registry-decision.md`) deployed to Sepolia at [`0x2a3dd1dff5c121b1fc24c7412e519c075bc5f8a1`](https://sepolia.etherscan.io/address/0x2a3dd1dff5c121b1fc24c7412e519c075bc5f8a1). TokenOps remains the entire confidential distribution engine — this registry only stores public metadata for Distribution Room pages.
- ✅ Browser issuer flow proven live — the `/create` wizard's sender preparation, operator approval, encryption, signing, create-and-fund, and registry registration steps all run for real from the browser and have been manually confirmed against Sepolia with real transaction hashes.
- ✅ Browser recipient portal proven live — `/recipient/demo`, the productized public recipient page (not just a developer diagnostic), successfully ran package import, eligibility check, decrypt-access grant, allocation decrypt, claim, and post-claim balance verification against Sepolia with real transaction hashes.
- ✅ End-to-end Sepolia flow proven — an issuer can create and fund a confidential distribution from the browser, and a recipient can independently import their claim package and claim their own allocation from the browser, with every step backed by a real transaction.
- ⏭️ Final polish and demo packaging (submission materials, remaining visual refinement) are next — no further functional proof is outstanding for the core lifecycle.

Full details, transaction hashes, and the account-object bug found and fixed along the way are in `docs/research/tokenops-sdk-notes.md`'s "Live Sepolia Runtime Spike Result" section and `docs/research/browser-tokenops-integration.md`'s live browser checkpoints. `scripts/spike-tokenops-sepolia.ts` is the canonical, proven SDK integration reference the browser flows were built from.

See:

- [`docs/research/tokenops-sdk-notes.md`](docs/research/tokenops-sdk-notes.md) — ground-truth SDK research (versions, exports, APIs, verified against the installed package, not guessed) plus the live Sepolia spike result.
- [`docs/research/build-plan.md`](docs/research/build-plan.md) — 4-day build plan.
- [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) — working rules for AI agents contributing to this repo.

## What this will be

An issuer connects a wallet, funds a confidential airdrop/disperse/vesting campaign for a set of recipients, and recipients can claim **and decrypt-verify their own allocation** — without any allocation amount ever being visible on-chain to anyone but its recipient.

## Network

Ethereum Sepolia only, for now. `fhe-airdrop` and `fhe-vesting` are Sepolia-only per TokenOps (mainnet pending further audits/pilots); `fhe-disperse` is live on both Sepolia and mainnet.

## Non-goals right now

- Final visual polish and demo/submission packaging are not done yet — the underlying flow is proven live, but presentation refinement is still outstanding.
- TokenOps' factories/singletons on Sepolia are pre-deployed and consumed as-is — this project does not deploy or modify any part of the confidential distribution engine. The one contract this project does deploy, `VantaDropRegistry`, is a thin, optional public-metadata layer that never touches recipient lists, allocation amounts, or anything else TokenOps keeps confidential (see `docs/research/registry-decision.md`).
- Nothing in this repo should be treated as reviewed/production-ready until the research docs have been reviewed by the project owner.
