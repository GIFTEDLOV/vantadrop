# VantaDrop — Build Plan

Based on `docs/research/tokenops-sdk-notes.md` (ground-truth, verified against installed `@tokenops/sdk@1.1.1`). Target: Zama Developer Program, Mainnet Season 3, Special Bounty Track × TokenOps. Deadline context from earlier research: submissions close **July 7, 2026** — confirm this date is still current before finalizing the timeline below, since it was found via web search rather than the SDK research pass in this document.

## Positioning

The bounty brief asks for confidential token distribution where "recipients can still verify and decrypt their own allocation." The SDK research confirms this is a **first-class, documented SDK feature** (`getClaimAmount` → ACL grant → `userDecrypt`/`useDecryptedHandle`), not something we have to build around the SDK. VantaDrop's differentiator is making that verify-before-claim step a real, polished, front-and-center UI moment — most naive integrations will skip straight to blind-claim (call `claim()` and never call `getClaimAmount()`).

Secondary differentiator: using the **testnet faucet module** (`@tokenops/sdk/testnet-faucet`) to remove all custom-contract friction from the demo — an issuer can mint a distributable confidential token (CTTT) in one click, no Solidity, no separate deployment, which keeps the whole demo inside documented SDK calls.

## Minimal end-to-end spike (do this before any UI work)

A single Node script (not the app) that proves the full lifecycle against real Sepolia, using only the APIs verified in the research doc:

1. `createTestnetFaucetClient(...).mintConfidential({ amount })` — issuer gets distributable CTTT.
2. `setOperator({ token: CTTT, spender: airdropFactoryAddress, ... })` — authorize the factory.
3. `createConfidentialAirdropFactoryClient(...).createAndFundConfidentialAirdrop({ params, amount, encryptor })` — deploy + fund one clone.
4. `encryptUint64({ encryptor, contractAddress: airdrop, userAddress: recipient, value })` + `signClaimAuthorization(...)` — produce one recipient's claim payload.
5. As the recipient: `preflightClaim` → `isSignatureValid` → **`getClaimAmount` → decrypt the handle (prove the verify step works)** → `claim`.
6. Re-read `confidentialBalanceOf` (via the CTTT token directly) post-claim and decrypt again, to confirm the balance actually moved.

This resolves open item #1 and #4 from the research doc (claim/getClaimAmount ordering, and "no live round trip executed yet") before a single UI component exists. **Do not start Phase 1 until this script runs clean on Sepolia.**

## Frontend pages (MVP)

Next.js App Router, wagmi + viem + a wallet-connect kit, Sepolia only.

| Route | Purpose |
|---|---|
| `/` | Landing — what VantaDrop is, connect wallet |
| `/issue` | Issuer flow: mint/point-at a CTTT token (faucet button for demo, or paste existing ERC-7984 address) → enter recipients + amounts (manual + CSV) → `setOperator` → create & fund airdrop → generate + deliver per-recipient claim payloads |
| `/claim/[airdrop]` | Recipient flow: connect wallet → eligibility check → **"Preview my allocation" (getClaimAmount + decrypt)** → claim → **"Verify my balance" (post-claim decrypt)** |
| `/campaign/[airdrop]` | Public, walletless view: public campaign params (token, window, recipient count, funded total) — no individual amounts |

Out of scope for MVP unless time remains after the above is solid: vesting UI, disperse UI, multi-campaign dashboard, CSV export, admin fee management screens.

## Contracts needed

**None to write.** Per the research doc, the SDK exclusively calls TokenOps' pre-deployed factory/singleton contracts; the only "contract-shaped" decision is which ERC-7984 token to distribute, and the testnet faucet's CTTT covers that for a Sepolia demo with zero custom Solidity. If a judge wants to see a distinct branded token, `mintUnderlying` + wrapping through the standard ERC-7984 flow is still faucet-only, no new contract.

## Risk list

| Risk | Mitigation |
|---|---|
| Claim payload delivery (admin → recipient) needs *some* storage/transport, and confidential amounts must never sit in it as plaintext | Only store `{handle, inputProof, signature}` (all already opaque/non-secret-revealing) keyed by recipient address; never store the plaintext amount anywhere outside the issuer's own browser session during setup |
| `getClaimAmount` is a paid tx (not free) — doubles the recipient's gas cost if we make "preview" mandatory | Make preview opt-in ("Preview my allocation" button), not automatic, so users who don't care about the extra gas can go straight to claim |
| Relayer downtime blocks both encrypt and decrypt paths | Surface `RelayerUnreachableError` / `TOKENOPS_RELAYER_UNREACHABLE` distinctly in the UI with a retry affordance, per the SDK's typed error codes |
| Unfunded airdrop pool passes `preflightClaim` but reverts on-chain (`FheHandleNotAllowedError`) — confusing UX if not handled | Issuer flow must not let a campaign go "live"/shareable until the fund tx (bundled or separate) has confirmed; recipient UI should catch this specific error code and show "this campaign isn't funded yet, contact the issuer" rather than a generic revert |
| Deadline is tight (confirm July 7) and vesting/disperse `.d.ts` weren't deeply inspected | Keep MVP scoped to airdrop only; only pull in vesting/disperse if the spike + Phase 1/2 land early |
| `SignatureAlreadyClaimed` behavior on `getClaimAmount` after `claim` is unconfirmed (research open item #1) | Resolved by the end-to-end spike (step 6 above) before building the post-claim "Verify my balance" UI around token-level `confidentialBalanceOf` instead of assuming `getClaimAmount` keeps working post-claim |

## Testing plan

- **Spike script** (above) is the primary integration test — re-run it against Sepolia whenever SDK-facing code changes, since FHE/relayer behavior can't be meaningfully mocked for this project's core value proposition.
- **Unit-level**: pure logic only (CSV parsing/validation, amount formatting, error-code → human-message mapping) — no point unit-testing SDK calls themselves.
- **Manual E2E pass before submission**: fresh browser profile, two real wallets (issuer + recipient) funded with Sepolia ETH, full issue → claim → verify cycle, screen-recorded for the submission.
- Explicitly do **not** claim automated test coverage over the FHE/relayer round trip — it isn't meaningfully testable outside a live Sepolia + relayer environment; say this plainly in the submission rather than implying full CI coverage.

## Timeline (4 days — confirm the July 7 deadline before committing to these dates)

**Day 1** — Scaffold Next.js app; install and pin `@tokenops/sdk`, `viem`, `@zama-fhe/sdk`, wagmi stack. Write and run the minimal end-to-end spike script against Sepolia. Resolve research open items #1 and #4 concretely (not just in theory).

**Day 2** — Issuer flow (`/issue`): wallet connect, faucet mint, recipient entry (manual + CSV), `setOperator`, create+fund airdrop, per-recipient encrypt+sign, payload storage/delivery mechanism.

**Day 3** — Recipient flow (`/claim/[airdrop]` + `/campaign/[airdrop]`): eligibility check, preview (getClaimAmount+decrypt), claim, post-claim verify. Wire every known `TokenOpsSdkError` code to a human message.

**Day 4** — Polish (loading/empty/error states, responsive layout), full manual E2E pass with two real wallets, README + demo video/script, deploy to Vercel, submit.

## Immediate next step

Scaffold a throwaway Node script (not the Next.js app yet) that runs the minimal end-to-end spike on Sepolia, using a funded test wallet. This is the highest-leverage next action: it validates every uncertain claim in the research doc against reality before any UI time is spent, and directly resolves open items #1 and #4.
