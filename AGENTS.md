# AGENTS.md

Instructions for any AI coding agent (Claude Code, Cursor, Copilot, etc.) working in this repository.

## Project

VantaDrop — confidential token distribution dApp for the Zama Developer Program, Mainnet Season 3, Special Bounty Track × TokenOps. Next.js + `@tokenops/sdk` + `@zama-fhe/sdk`, targeting Ethereum Sepolia.

## Rules

1. **No invented APIs.** Only call `@tokenops/sdk` functions that exist in the installed package's `.d.ts` files or are documented in `docs/research/tokenops-sdk-notes.md`. Verify before writing, don't pattern-match from memory or from other SDKs.
2. **No faked functionality.** Don't stub a confidential-transfer flow with fake success states. If a Sepolia interaction can't be verified in the current environment, say so.
3. **Confidentiality is the product.** Never log, persist, or render a plaintext token allocation amount anywhere except inside the recipient's own decrypt-and-verify UI, after an explicit user action. Encrypted handles, addresses, timestamps, and public totals are fine to store.
4. **Read before integrating.** `docs/research/tokenops-sdk-notes.md` is the source of truth for the SDK's actual shape (function signatures, error codes, deployed addresses, funding/claim/decrypt lifecycle) as verified against `@tokenops/sdk@1.1.1`. `docs/research/build-plan.md` has the scope and timeline.
5. **Sepolia only.** Don't add mainnet-specific logic for `fhe-airdrop` or `fhe-vesting` — TokenOps has not deployed those to mainnet yet. `fhe-disperse` is live on mainnet + Sepolia but this project targets Sepolia throughout.
6. **Off-limits path:** `C:\Users\DELL\silentrfq` — unrelated project, do not read or write there.
7. **Don't commit without review** when working through an in-progress research/design pass — check with the project owner before creating commits during exploratory phases.
