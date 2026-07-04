# VantaDropRegistry — Architecture Decision

Implementation Order step 4. **Status: APPROVED and built.** Contract written, compiled, and fully tested locally (14/14 passing) against an in-memory Hardhat network. Not yet deployed to Sepolia or anywhere else — deployment is a separate, later step.

**Toolchain selected: Hardhat (3.x), with `@nomicfoundation/hardhat-toolbox-viem`.** Reason: Windows reliability and continuity with a setup already known to work well (SilentRFQ), over Foundry's external-binary install path. Concretely, the classic `@nomicfoundation/hardhat-toolbox` package (as commonly referenced) does not work with the Hardhat version that installs today — Hardhat 3 split its toolbox into viem- and ethers-based variants, and `@nomicfoundation/hardhat-toolbox@latest` is now a stub that refuses to run under Hardhat 3. `@nomicfoundation/hardhat-toolbox-viem` was used instead, which also keeps the project on a single Ethereum library (viem) end to end — the contract test suite, the deploy script, and `scripts/spike-tokenops-sepolia.ts` all use viem, with no ethers.js dependency introduced anywhere.

## 1. Decision

Build a **thin, optional** `VantaDropRegistry` contract.

- TokenOps' pre-deployed, audited contracts (`ConfidentialAirdropFactory` / `ConfidentialAirdropCloneable`, confirmed live on Sepolia in the runtime spike) remain the **entire** confidential distribution engine — creation, funding, encrypted allocations, signature-gated claims, recipient decrypt/verify. VantaDropRegistry does not touch any of that and does not duplicate any of it.
- The registry's only job is recording **public metadata** about a distribution that already exists on TokenOps, so the frontend has something to read for pages that need to *list* or *describe* distributions without a backend database (per the "Do Not Build: backend database" constraint already locked in `build-plan.md`).
- It is explicitly **optional**: a distribution is fully valid and fully claimable via TokenOps whether or not it was ever registered here. The registry is a discovery/display convenience, not a dependency of the privacy-critical path.

## 2. Why this helps

- **Gives VantaDrop a smart contract codebase.** A pure frontend-calls-TokenOps submission has zero Solidity of its own to show a judge. One small, readable, purpose-limited contract demonstrates engineering judgment (knowing what *not* to build) as much as writing it does.
- **Supports Distribution Room pages** (`docs/research/build-plan.md`'s Winning Product Scope, item 6) — a public, shareable, walletless page needs *some* place to resolve "what distributions exist and what are their public parameters" without a server DB.
- **Improves public verification** — the Live Verification Panel (Winning Product Scope item 7) can point at a registry entry as a second, independent on-chain confirmation of the distribution's public parameters, alongside the TokenOps clone itself.
- **Avoids leaking private data** — by construction: the schema below has no field capable of holding a recipient list, an amount, or anything else TokenOps keeps encrypted. This isn't a policy we have to remember to follow; it's a schema that can't hold the wrong thing.
- **Keeps TokenOps as the privacy layer** — the registry is downstream and read-only with respect to confidentiality. If the registry contract had a bug, or was skipped entirely, or was queried by an attacker, nothing about any recipient's allocation is exposed, because none of it was ever written there.

## 3. What the registry may store

Per distribution, all sender-supplied public data or already-public TokenOps facts:

- `distributionId`
- `sender` (the issuer/admin address — already public as the TokenOps clone's admin)
- `public title` (sender-chosen display name)
- `use case` (which template — Investor distribution, Team payout, etc.)
- `token address` (the ERC-7984 token — already public)
- `TokenOps airdrop clone address` (already public)
- `recipient count` (a **count**, not a list — already inferable by anyone willing to count `ConfidentialTransfer`/claim events on the TokenOps clone, so the registry adds convenience, not new exposure)
- `createdAt`
- `status` (draft/funded/active/closed — derived from already-public TokenOps state like `hasClaimStarted()`/`isClaimWindowActive()`/`hasClaimEnded()`, just cached here for cheap reads)
- `optional public metadata URI/hash` (e.g. an IPFS pointer to a longer public description — not eligibility data)

## 4. What the registry must never store

Absolute list — any future PR adding one of these to this contract should be rejected on sight:

- recipient wallet list
- allocation amounts
- private notes
- CSV contents
- claim signatures
- encrypted allocation handles
- anything needed to identify hidden recipients beyond what TokenOps itself already publicly exposes

Every one of these already lives, correctly, inside TokenOps' encrypted/signature-gated layer. Duplicating any of them here would not make the product more useful — it would just create a second, unaudited place for the exact data the whole product exists to protect.

## 5. Contract shape (built — `contracts/VantaDropRegistry.sol`, flat layout, not nested under `contracts/src/`)

See `contracts/VantaDropRegistry.sol` for the full source (reproduced here matches it exactly as of this writing — treat the `.sol` file as authoritative if they ever drift).

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract VantaDropRegistry {
    struct Distribution {
        uint256 id;
        address sender;
        address token;
        address tokenOpsAirdrop;
        string title;
        string useCase;
        uint256 recipientCount;
        uint64 createdAt;
        uint8 status;
        string metadataURI;
    }

    uint256 private _nextDistributionId = 1;
    mapping(uint256 => Distribution) private _distributions;
    mapping(address => uint256[]) private _senderDistributions;

    event DistributionRegistered(
        uint256 indexed id,
        address indexed sender,
        address indexed token,
        address tokenOpsAirdrop,
        string title,
        string useCase,
        uint256 recipientCount
    );
    event DistributionStatusUpdated(uint256 indexed id, uint8 status);

    error ZeroAddress();
    error EmptyTitle();
    error EmptyUseCase();
    error InvalidRecipientCount();
    error NotOriginalSender();
    error DistributionNotFound();

    function registerDistribution(
        address token,
        address tokenOpsAirdrop,
        string calldata title,
        string calldata useCase,
        uint256 recipientCount,
        string calldata metadataURI
    ) external returns (uint256) { /* validates all inputs, stores, emits, returns new id — see .sol */ }

    function updateStatus(uint256 distributionId, uint8 status) external { /* only original sender — see .sol */ }
    function getDistribution(uint256 distributionId) external view returns (Distribution memory) { /* reverts if not found */ }
    function getSenderDistributions(address sender) external view returns (uint256[] memory) { /* */ }
    function totalDistributions() external view returns (uint256) { /* */ }
}
```

(Full bodies, all privacy-rule comments, and full NatSpec live in `contracts/VantaDropRegistry.sol` — elided here to keep this doc from drifting into a second copy that could go stale.)

**Functions:** `registerDistribution`, `updateStatus`, `getDistribution`, `getSenderDistributions`, `totalDistributions` — exactly the five specified, nothing added.

**Events:** `DistributionRegistered` (id, sender, token, tokenOpsAirdrop, title, useCase, recipientCount) and `DistributionStatusUpdated` (id, status) — exactly the two specified, exact field lists.

**Validation (all via custom errors, gas-cheap and precisely testable):** `ZeroAddress` for a zero `token` or `tokenOpsAirdrop`, `EmptyTitle`/`EmptyUseCase` for empty strings, `InvalidRecipientCount` for zero, `NotOriginalSender` for an `updateStatus` caller who isn't the original registrant, `DistributionNotFound` for a nonexistent id in either `getDistribution` or `updateStatus`.

**Access control:** `registerDistribution` and reads are open to anyone (registering metadata about your own TokenOps distribution isn't a privileged action, and reads expose nothing sensitive). `updateStatus` is restricted to `msg.sender == d.sender` — a plain equality check, not OpenZeppelin `AccessControl`/`Ownable`. Deliberate simplification: exactly one role, exactly one gated action, so role-management machinery would be pure overhead.

**Deliberately not included** (keeping this "thin," per the "do not write a complex distribution contract" constraint):
- No on-chain verification that `msg.sender` actually holds `DEFAULT_ADMIN_ROLE` on the referenced `tokenOpsAirdrop` clone. Adding that would require a cross-contract call into TokenOps' ABI and couples this contract to TokenOps' interface stability. For now, the registry trusts that whoever calls `registerDistribution` is telling the truth about which TokenOps clone they created — the frontend can independently verify this by reading the clone's admin directly before trusting a registry entry (see "Failure handling" below). Flagged as a known limitation, not an oversight.
- No uniqueness constraint preventing the same `tokenOpsAirdrop` address from being registered twice (by the same or different callers). Low risk (worst case is a duplicate Distribution Room page), not worth the extra storage/gas to prevent in a thin contract.
- No pausability, upgradeability, or fee mechanism — none of TokenOps' governance complexity is relevant here since this contract moves no value and holds no funds.

## 6. Frontend effect

- The **Wizard** creates the real confidential airdrop via TokenOps first (`createAndFundConfidentialAirdrop` or the create/fund split, per the proven spike flow) — exactly as already built in `scripts/spike-tokenops-sepolia.ts`. Nothing about this step changes.
- **After** TokenOps confirms the airdrop clone exists (parsed from the `ConfidentialAirdropCreated` event, same as the spike does), the frontend **optionally** calls `VantaDropRegistry.registerDistribution(...)` with the clone address and public metadata. This is a second, separate transaction — never bundled into or required by the TokenOps call.
- The **Distribution Room** page reads from the registry (for title/use-case/status/recipientCount) *plus* reads directly from the known TokenOps clone address (for live claim-window state, funded totals, etc.) — registry data and live TokenOps reads are combined, not one replacing the other.
- The **Recipient Portal** does not touch the registry at all. Eligibility, decrypt/verify, and claim all go through TokenOps SDK calls and the admin-issued claim authorization exactly as already proven — the registry has no role in the claim path, by design (see privacy rule above: the registry doesn't know who's eligible or for how much, so it couldn't participate in claiming even if asked to).

## 7. Failure handling

- **If the registry write fails or is skipped, the TokenOps distribution is still fully valid.** A recipient with a claim authorization can claim regardless of whether `registerDistribution` ever succeeded, was ever called, or reverted. The registry is not in the critical path.
- **UI treatment:** the registry is *optional verification metadata*, never the source of truth for "does this distribution exist" or "can this recipient claim." If a Distribution Room page is opened for a `tokenOpsAirdrop` address that has no registry entry (registration skipped, failed, or simply never attempted), the frontend should fall back to reading everything directly from the TokenOps clone (token address, claim window, paused state) and show a degraded-but-functional page — missing only the sender-supplied title/use-case copy — rather than treating "not in registry" as "doesn't exist" or "invalid."
- Concretely: registry-read failures should render as "no public listing found — verify directly via contract address" rather than an error state, and should never block a recipient from reaching the actual claim flow, which only ever needs the TokenOps clone address (typically carried in the shareable link itself, independent of the registry).

## Build result

- **Toolchain:** Hardhat 3.x + `@nomicfoundation/hardhat-toolbox-viem` (see the status line at the top of this document for why, and `hardhat.config.ts` for the working config). `npx hardhat compile` and `npx hardhat test` both pass cleanly.
- **Status validation:** implemented as an unvalidated `uint8` (no `Status` enum in the final contract — kept even simpler than the original proposal, since the frontend/template layer, not the contract, owns the meaning of status codes; this avoids the contract needing to be upgraded every time a new status is introduced). Revisit only if silently-invalid status values become an observed problem.
- **`getSenderDistributions` unbounded array:** shipped as-is (view/`eth_call`-only, no gas cost to the caller). Not a concern at the scale this project operates at.
- **Test coverage:** 14/14 tests passing, including a structural test that inspects the compiled ABI to assert no function or `Distribution` struct field name could plausibly hold a recipient list or allocation amount — a codified, automatically-checked version of the privacy rule, not just a comment.
