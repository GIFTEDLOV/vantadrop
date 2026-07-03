# CLAUDE.md

Guidance for Claude Code sessions working in this repository.

## What this project is

VantaDrop — a confidential token distribution dApp for the Zama Developer Program, Mainnet Season 3, Special Bounty Track × TokenOps. Built on `@tokenops/sdk` (npm), which wraps Zama's FHEVM + `@zama-fhe/sdk` relayer for ERC-7984 confidential tokens. Next.js frontend, Sepolia only.

## Hard rules

- **Do not invent SDK APIs.** Every `@tokenops/sdk` function name, argument shape, and return type used in this codebase must be verifiable against the installed package's `.d.ts` files (`node_modules/@tokenops/sdk/dist/**/*.d.ts`) or `docs/research/tokenops-sdk-notes.md`. If you're not sure a function exists, grep `node_modules/@tokenops/sdk/dist` before writing code that calls it — do not guess from a similar-sounding pattern in another SDK.
- **Do not fake functionality.** No mocked transaction hashes, no placeholder "pretend this worked" UI states presented as if they're real. If something can't be verified against Sepolia yet, say so in code comments/PR notes.
- **Confidential amounts never touch a database or log in plaintext.** Only encrypted handles (`Hex`), addresses, timestamps, and public totals get persisted or logged. This is the entire point of the product — treat any code path that would leak a plaintext allocation as a bug, not a style nit.
- **Read `docs/research/tokenops-sdk-notes.md` before touching any TokenOps SDK integration code.** It documents the real, version-pinned API surface (as of `@tokenops/sdk@1.1.1`) including exact function signatures, error codes, and the funding/claim/decrypt lifecycle. It also lists open unknowns — check those before assuming behavior.
- **Do not touch `C:\Users\DELL\silentrfq`.** Unrelated project, off-limits.
- **Sepolia only.** `fhe-airdrop` and `fhe-vesting` are not deployed on mainnet yet (per TokenOps' own mainnet-readiness page) — don't build mainnet-specific code paths for those two products.

## Where things live

- `docs/research/tokenops-sdk-notes.md` — SDK ground truth (exports, versions, addresses, error codes, lifecycle).
- `docs/research/build-plan.md` — scope, phases, timeline, risk list.
- App code doesn't exist yet as of this writing — check the build plan for the intended structure before scaffolding.

## Verification habits specific to this project

- Prefer `npm view @tokenops/sdk <field>` and inspecting installed `.d.ts` files over web search when a question is "what does the SDK actually export/do."
- The TokenOps SDK ships fully-documented TSDoc on every exported symbol — read the `.d.ts` file directly rather than guessing from a README quickstart snippet, which may omit steps (e.g. the README's airdrop quickstart doesn't show the fund step; the `.d.ts` for `ConfidentialAirdropFactoryClient` does).
- FHE-specific gas/HCU costs and relayer behavior can't be meaningfully unit-tested locally — real verification requires a funded Sepolia wallet and a live claim/decrypt round trip. Say so explicitly rather than claiming test coverage proves the FHE flow works.
