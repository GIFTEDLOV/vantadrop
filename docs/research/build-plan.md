# VantaDrop — Build Plan

Based on `docs/research/tokenops-sdk-notes.md` (ground-truth, verified against installed `@tokenops/sdk@1.1.1`). Target: Zama Developer Program, Mainnet Season 3, Special Bounty Track × TokenOps. Deadline context from earlier research: submissions close **July 7, 2026** — confirm this date is still current before finalizing the timeline below, since it was found via web search rather than the SDK research pass in this document.

## Positioning

The bounty brief asks for confidential token distribution where "recipients can still verify and decrypt their own allocation." The SDK research confirms this is a **first-class, documented SDK feature** (`getClaimAmount` → ACL grant → `userDecrypt`/`useDecryptedHandle`), not something we have to build around the SDK. VantaDrop's differentiator is making that verify-before-claim step a real, polished, front-and-center UI moment — most naive integrations will skip straight to blind-claim (call `claim()` and never call `getClaimAmount()`).

Secondary differentiator: using the **testnet faucet module** (`@tokenops/sdk/testnet-faucet`) to remove all custom-contract friction from the demo — an issuer can mint a distributable confidential token (CTTT) in one click, no Solidity, no separate deployment, which keeps the whole demo inside documented SDK calls.

## Winning Product Scope

This section locks the full feature set VantaDrop is aiming for, so the contract/SDK integration isn't re-architected mid-build. It is broader than the "Frontend pages (MVP)" table further down — that table is the *sequencing* (what ships Day 1 vs Day 3); this section is the *ceiling* (everything the product should eventually cover). Every feature below must be satisfiable by APIs already confirmed in `docs/research/tokenops-sdk-notes.md`, or explicitly flagged where it isn't yet confirmed.

### 1. Distribution use-case templates

One underlying flow (confidential airdrop via `@tokenops/sdk/fhe-airdrop`), presented as named templates so issuers pick a familiar shape instead of configuring raw parameters:

- Investor distribution
- Team payout
- DAO contributor rewards
- Community rewards
- Private airdrop
- Vesting unlock — note: this one may eventually map to `@tokenops/sdk/fhe-vesting` instead of the airdrop primitive, once that module gets the same `.d.ts`-verification pass the airdrop module already got. Until then, present it as a template that reuses the airdrop flow with vesting-flavored copy, not a claim that real vesting schedules are wired up.
- Ecosystem grant payout

Templates only change copy/defaults (claim window length, wording, icon) — they must not fork the underlying SDK call sequence. One flow, seven skins.

### 2. Smart Distribution Wizard

Linear steps, each a real gate (no step lets you proceed with invalid state):

1. Choose distribution type (template from above)
2. Select confidential token (testnet faucet CTTT, or paste an existing ERC-7984 address — validated via `supportsInterface`/`isConfidentialTokenValid`-style checks before accepting it)
3. Add recipients and amounts (manual rows + CSV — see Section 3)
4. Review privacy model (Section 4 — shown before the irreversible on-chain step, not after)
5. Execute distribution (`setOperator` → `createAndFundConfidentialAirdrop` → per-recipient `encryptUint64` + `signClaimAuthorization`)
6. Share recipient portal link (Section 5/6 — the wizard's terminal state is a shareable URL, not a dead-end success toast)

### 3. CSV paste/import and validation

Paste or upload; validate client-side before any wallet interaction. Required checks:

- invalid wallet (fails `isAddress`/checksum)
- duplicate wallet (case-insensitive dedupe across the batch)
- missing amount
- zero/negative amount
- unsupported decimals (more decimal places than the selected token supports — e.g. CTTT is 6 decimals)
- too many recipients (batch-limit check — for airdrop this is per-recipient signing so the practical limit is UX/gas-driven, not a contract batch cap like disperse has; surface a soft warning past some threshold, e.g. 50, rather than a hard block, unless research turns up an actual contract-level cap)

Every row's problems are shown inline, not just an aggregate error count.

### 4. Privacy Preview

Shown as an explicit wizard step (not a footnote), listing exactly what's public vs confidential for the chosen distribution — pulled directly from the ERC-7984/TokenOps model already confirmed in the research doc:

**Public:** recipient wallet addresses, token contract address, airdrop clone address, claim window timestamps, funded total (the amount locked into the clone), transaction hashes, claim/no-claim status per address.

**Confidential:** each recipient's individual allocation amount, the token's confidential balances (`confidentialBalanceOf` handles), transfer amounts — encrypted end-to-end, decryptable only by the recipient via their own wallet signature.

This is not new copy to invent — it's a direct restatement of the "Privacy model" already reverse-engineered from `ConfidentialAirdropCloneable`'s actual behavior. Keep this section's wording in sync with the research doc if that doc's understanding is ever corrected.

### 5. Recipient Portal

- Connect wallet
- Check eligibility (does a claim authorization exist for the connected address?)
- Decrypt my allocation (`getClaimAmount` → ACL grant → permit signature → `userDecrypt`/`decryptValues` — the bounty's headline "verify before claim" requirement)
- Claim allocation (`preflightClaim` → `isSignatureValid` → `claim`)
- View proof (the claim tx hash + an Etherscan link + the decrypted amount, presented as a durable receipt, not a toast that disappears)

### 6. Distribution Room

Public, shareable page per distribution — no wallet required to view it. Contents:

- distribution name
- use case (which template)
- token (address + symbol/decimals read live from chain)
- network (Sepolia, chain id 11155111)
- status (draft / funded / live / claim window closed — derived from `hasClaimStarted()`/`isClaimWindowActive()`/`hasClaimEnded()`/`isPaused()`)
- recipient portal link
- privacy model (Section 4, reused)
- execution tx (the `createAndFundConfidentialAirdrop` hash)
- claim progress if available (see Section 8 — depends on the Smart Contract Strategy decision below, since counting "N of M claimed" without a registry means indexing `isSignatureClaimed` per known recipient, which only works if the page already knows the recipient list, which it must not expose publicly)

### 7. Live Verification Panel

A permanently-visible technical trust panel — this is what makes the "confidential" claim inspectable rather than a marketing assertion:

- Network (Sepolia / chain id)
- TokenOps SDK (package + pinned version, `@tokenops/sdk@1.1.1`)
- ERC-7984 (standard reference/link)
- distribution type (template)
- token address (linked)
- distribution/campaign address (the airdrop clone, linked)
- sender (issuer/admin address, linked)
- amounts confidential (yes — with a one-line "why," referencing `euint64` handles)
- recipient self-decryption enabled (yes — links to the Recipient Portal's decrypt step)
- Etherscan links (token, campaign, every tx hash the flow produced)

### 8. Claim Status Timeline

Per-distribution, per-recipient-if-known claim history: created → funded → claim window open → (per recipient) claimed/not yet/window missed. Depends on the Smart Contract Strategy decision — if there's no registry, this can only show aggregate/contract-level state (window timing, paused/not) plus whatever a *connected* recipient can see about themselves, not a public per-recipient grid (that would leak who's eligible, which the privacy model doesn't promise to hide but also isn't the point of the product).

### 9. Demo Distribution

A pre-seeded, always-available distribution (using the testnet faucet's CTTT) that judges/reviewers can open and claim from without needing the issuer flow — the fastest path to "does this actually work" for someone evaluating the submission cold.

### 10. Testnet Faucet Integration

Already SDK-native (`@tokenops/sdk/testnet-faucet`) — one-click "mint test CTTT" in the issuer flow so a demo never blocks on "I don't have a confidential token to distribute."

### 11. Token/Network Health Check

Before letting a user start the wizard: confirm wallet is on Sepolia (chain id 11155111), confirm the airdrop factory address resolves (`getFheAirdropFactoryAddress` isn't `undefined`), confirm the selected token address actually looks like an ERC-7984 contract. Fail fast with a specific message rather than letting a bad state cascade into a confusing revert three steps later.

### 12. Local Drafts using localStorage

Wizard progress (template choice, recipient rows, not-yet-submitted amounts) persisted to `localStorage` so a page refresh or accidental navigation doesn't lose an in-progress draft. **Plaintext allocation amounts in a draft are, by definition, still in the issuer's own browser at that point** (see Privacy Preview — the issuer necessarily knows the amounts pre-encryption) — this is consistent with the existing privacy model, not a new leak, but must never sync anywhere off-device.

### 13. CSV Template Download

A downloadable blank/example CSV (`address,amount` header, matching the parser in Section 3) so issuers don't have to guess the expected format.

### 14. Error Recovery UX

Every known `TokenOpsSdkError` code (already enumerated in the research doc) mapped to a specific, actionable message — plus recoverable-state handling: if the wizard dies after `createAndFundConfidentialAirdrop` succeeds but before all per-recipient signatures are generated, the issuer must be able to resume from the existing airdrop address rather than being forced to create a duplicate campaign.

### 15. Shareable Recipient Link

A single URL per distribution (`/claim/[airdrop]` or equivalent) that works for any recipient — the link itself carries no per-recipient secret; eligibility and allocation are resolved after wallet connect, not encoded in the URL.

## Smart Contract Strategy

**Default position: write no new distribution contract.** TokenOps' pre-deployed `ConfidentialAirdropFactory`/`ConfidentialAirdropCloneable` (Sepolia address confirmed in the research doc) already implements exactly the confidential-airdrop lifecycle this product needs. Re-implementing any part of that — signature verification, claim windows, encrypted-balance handling — would mean re-auditing FHE-handling Solidity on a 4-day clock, for no functional gain over calling the audited, already-deployed contract through the SDK. Do not do this.

**If a custom contract turns out to be needed** (most likely reason: the "Distribution Room" / "Claim Status Timeline" features need a way to enumerate distributions and know their public metadata without a backend database — see the `localStorage`-only / no-DB constraint in "Do Not Build" below), the *only* custom contract in scope is a thin `VantaDropRegistry`:

- **Stores only public metadata**, one entry per distribution:
  - `distributionId`
  - `sender`
  - `distribution type` (template)
  - `public title`
  - `token address`
  - `createdAt`
  - `status`
  - `recipient count`
  - `TokenOps campaign/contract address` (the airdrop clone address)
- **Must never store:**
  - recipient list
  - allocation amounts
  - private notes
  - any sensitive distribution data

Everything in the "must never store" list is exactly the data ERC-7984/TokenOps already keeps confidential on-chain — a registry that leaked any of it would undermine the entire product's premise, not just be a minor bug.

**Before writing `VantaDropRegistry` at all**, settle whether it's actually necessary (this is Implementation Order step 4, below) — a shareable link that already contains the airdrop clone address may make a registry unnecessary for the Distribution Room and Recipient Portal (both can read everything they show directly from the clone + token contracts). A registry only earns its keep if VantaDrop needs an "all my distributions" issuer dashboard or a public "browse all distributions" discovery page. If the product doesn't need discovery beyond "issuer shares a link," skip the registry entirely and keep the "no contracts to write" position from the research doc's original Contracts Needed section.

## Do Not Build

Explicit non-goals, to prevent scope creep from quietly turning a 4-day confidential-distribution demo into a general-purpose token-ops platform:

- **Email login** — wallet connection is the only identity model; there is no account system to build.
- **Profiles/usernames** — addresses are the only identity surface, consistent with the privacy model.
- **Backend database** — no Postgres/Mongo/etc.; state lives on-chain, in `localStorage` for drafts, and (if truly needed) in the thin registry contract above. No server-side datastore of any kind.
- **Complex compliance/KYC** — out of scope entirely; this is a confidential-distribution demo, not a regulated securities platform.
- **Cross-chain** — Sepolia only, per the research doc's confirmed scope (`fhe-airdrop`/`fhe-vesting` aren't even deployed to mainnet yet).
- **Complex vesting engine** — `fhe-vesting`'s cliff/release-curve parameters exist in the SDK, but building a full vesting-schedule UI is out of scope unless Day 1-3 finish early; don't design around it now.
- **Token launchpad** — VantaDrop distributes tokens, it does not sell/launch them; no sale mechanics, pricing, or allowlist-sale UI.
- **NFT features** — ERC-7984 is a fungible-token standard; nothing here touches ERC-721/1155.

## Implementation Order

Locked sequencing — do not reorder without a reason, since later steps assume earlier ones are settled:

1. ~~**Runtime SDK spike**~~ — **completed.** Proven on live Sepolia 2026-07-04: real tx hashes for `mintConfidential`, `createAndFundConfidentialAirdrop`, `getClaimAmount`, and `claim`. See `docs/research/tokenops-sdk-notes.md`'s "Live Sepolia Runtime Spike Result" section.
2. ~~**Minimal distribution flow**~~ — **completed in script.** Issuer side (mint → authorize operator → fund airdrop → encrypt+sign per-recipient claim payload) works end-to-end in `scripts/spike-tokenops-sepolia.ts`. No wizard UI yet — this is the proven call sequence the wizard will wrap.
3. ~~**Recipient decrypt flow**~~ — **completed in script.** `getClaimAmount` → `ZamaSDK.allow` → `ZamaSDK.userDecrypt` → `claim` → post-claim `confidentialBalanceOf` decrypt, proven end-to-end for one recipient with matching decrypted amounts before and after claim.
4. **Decide if registry is needed** — per the Smart Contract Strategy section above; resolve this before any registry Solidity gets written, since it may turn out to be unnecessary.

**Frontend can now be built around the proven TokenOps airdrop flow** — steps 1-3 are no longer theoretical or type-checked-only, they're demonstrated against real Sepolia state with transaction hashes as evidence. `scripts/spike-tokenops-sepolia.ts` is the canonical reference for the exact call sequence, argument shapes, and the account-object gotcha (pass full `Account` objects, not address strings, to any TokenOps write call) the wizard UI must replicate.
5. **Wizard UI** — wrap steps 2-3 (and the registry, if built) in the Smart Distribution Wizard's six steps.
6. **CSV import** — layer batch entry onto the wizard's recipient step once single-recipient flow is solid.
7. **Privacy Preview** — surface the already-confirmed public/confidential model as an explicit wizard step.
8. **Live Verification panel** — surface addresses/tx hashes/SDK version once there's real data to show.
9. **Premium landing page** — explicitly deferred; per standing instructions, landing page design does not start until the functional product exists to describe accurately.
10. **README/demo package** — write up and record last, once the actual built behavior is known, not the planned behavior.

## Runtime spike plan

**Status: prepared, not run.** `scripts/spike-tokenops-sepolia.ts` exists and type-checks cleanly against the real installed packages (`npx tsc --noEmit` passes). It has not been executed — no wallets have been funded yet and `.env.local` has not been filled in. See `docs/research/tokenops-sdk-notes.md`'s "Runtime spike plan" section for the full setup story, including a real peer-dependency version incompatibility discovered and fixed while preparing it (`@zama-fhe/sdk` pinned to exact `3.0.0`, not `^3.0.0`).

**To actually run it:**
1. Create two burner Sepolia wallets (sender/admin, recipient) — not your main wallet.
2. Fund both with a small amount of Sepolia ETH (a faucet amount is enough).
3. `cp .env.example .env.local` and fill in `SEPOLIA_RPC_URL`, `SENDER_PRIVATE_KEY`, `RECIPIENT_PRIVATE_KEY`, `RECIPIENT_ADDRESS`.
4. `npm run spike`.

It will not run itself and nothing in this repo runs it automatically — this is a manual, explicit step gated on you confirming the burner wallets are ready.

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
