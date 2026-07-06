# VantaDrop Private Claim Links + Wallet Discovery Dashboard

Date: 2026-07-06

Scope: architecture plan only. This document does not change contracts, TokenOps
SDK logic, deployment state, or application code.

## 1. Product Decision

VantaDrop is moving away from manual claim-package JSON paste/download as the
primary recipient experience.

The current JSON flow proved the lifecycle honestly: the sender creates and signs
claim material, the recipient imports it, validates eligibility, decrypts their
own allocation, claims, and verifies balance. It is useful for diagnostics and
early proof, but it is not the right long-term product surface:

- It asks non-technical recipients to manage raw JSON.
- It creates avoidable support risk around lost files, copied partial JSON, and
  stale packages.
- It makes the sender responsible for explaining implementation details.
- It increases the chance that sensitive claim material is pasted into the wrong
  place.
- It does not provide a clean "connect wallet and find my claims" workflow.

The product direction is therefore:

- Keep the public registry limited to public distribution metadata.
- Move recipient-specific claim material into encrypted client-side capsules.
- Store only ciphertext server-side.
- Give recipients either a private link or a wallet-based discovery path.

This preserves the core privacy boundary while making the recipient experience
feel like a product instead of a diagnostic.

## 2. Two Access Modes

### Private Link Mode

Private Link Mode is the simplest recipient delivery model.

Flow:

1. Sender creates a distribution in `/create`.
2. App creates one plaintext claim capsule per recipient in the sender's browser.
3. Browser encrypts each capsule with WebCrypto before any backend write.
4. Backend stores only encrypted ciphertext plus non-sensitive routing metadata.
5. App generates private claim links in the form `/claim/[claimId]#key`.
6. Sender privately sends each link to the corresponding recipient.
7. Recipient opens the link.
8. Browser reads `claimId` from the path and the decryption key from the URL hash.
9. Browser fetches ciphertext by `claimId`, decrypts locally, and opens the claim
   flow.

Privacy properties:

- Backend never receives plaintext claim package data.
- Backend never receives the URL hash key during normal HTTP requests.
- Anyone with the complete link can open the claim, so delivery must remain
  private.
- Link forwarding is possible and must be explained honestly.

### Wallet Discovery Mode

Wallet Discovery Mode removes the need for recipients to receive or paste JSON.

Flow:

1. Recipient opens `/drops`.
2. Recipient connects wallet.
3. App shows Ongoing, Future, and Past public airdrops.
4. Recipient clicks **Check eligibility** on a drop card.
5. Browser computes a wallet-derived lookup key.
6. Backend checks whether an encrypted capsule exists for that lookup key.
7. If one exists, backend returns the encrypted capsule only.
8. Browser decrypts locally and opens the claim flow.

Required product copy:

> Connect your wallet to privately check eligible claim packages.

Avoid copy that implies the smart contract publicly identifies eligible wallets.
The discovery check is against encrypted backend capsules, not a public
contract-side recipient list.

Privacy properties:

- Public users see only public distribution metadata.
- Recipient-specific material is returned only when the browser presents the
  correct lookup key.
- Backend can observe that a lookup occurred for a distribution and whether a
  capsule exists, so rate limiting and careful response design are required.

## 3. Recommended Storage

For demo and deployment, use **Vercel KV / Upstash Redis**.

Reasons:

- Works naturally with a Vercel-hosted Next.js app.
- Simple key-value model fits encrypted capsules and public drop metadata.
- Low operational burden for the bounty/demo phase.
- Fast enough for lookup flows.
- Supports TTLs and rate-limit counters if needed.
- Avoids introducing a relational schema before the product needs it.

Recommended key families:

```text
drop:{distributionId} -> public distribution metadata
claim:{claimId} -> encrypted claim capsule
lookup:{distributionId}:{lookupKey} -> claimId
drop_claims:{distributionId} -> claimId set/list for sender/admin maintenance
```

Do not store plaintext claim package data in KV. KV stores encrypted capsules
only.

## 4. WebCrypto Encryption Model

Use browser WebCrypto with AES-GCM.

Encryption happens in the sender browser before backend storage:

1. Build plaintext capsule from the already-created TokenOps claim material.
2. Generate a random AES-GCM key per capsule, or derive a per-capsule key from
   high-entropy random bytes.
3. Generate a unique random nonce for AES-GCM.
4. Encrypt the plaintext capsule in the browser.
5. Upload only encrypted ciphertext, nonce, algorithm metadata, and routing
   metadata.

Private Link Mode:

- The decryption key stays in the URL hash: `/claim/[claimId]#key`.
- The URL hash is not sent to the server in normal HTTP requests.
- The claim page reads `window.location.hash`, imports the AES key, fetches
  ciphertext by `claimId`, and decrypts locally.

Wallet Discovery Mode:

- The backend returns encrypted ciphertext after a lookup-key match.
- The architecture still needs a key-delivery decision before implementation:
  either the discoverable capsule uses a wallet-derived encryption key, or the
  lookup response returns a key-wrapped capsule that only the connected wallet
  can unlock.
- For the first demo implementation, keep this explicit and conservative:
  design the helper layer so Private Link encryption is fully specified first,
  then add discoverable key wrapping only after threat-model review.

Minimum cryptographic requirements:

- AES-GCM, 256-bit keys.
- Unique nonce per encryption.
- Authenticated additional data should include `claimId`, `distributionId`,
  `chainId`, and `tokenOpsAirdrop`.
- Never reuse a nonce with the same key.
- Never log plaintext capsule contents, keys, nonces with plaintext, claim
  signatures, handles, or input proofs.

## 5. Data Model

### Public Distribution Metadata

Public distribution metadata is visible to public users and powers `/drops`.
It can be stored in VantaDrop backend storage and may mirror public registry
facts, but VantaDropRegistry itself remains public-metadata-only.

```ts
type PublicDistributionMetadata = {
  distributionId: string;
  registryDistributionId?: number;
  title: string;
  useCase: string;
  status: "scheduled" | "active" | "ended";
  privacyMode: "private_link" | "discoverable";
  token: string;
  tokenOpsAirdrop: string;
  registry: string;
  recipientCount: number;
  createdAt: number;
  startsAt: number;
  endsAt: number;
};
```

Public metadata must not contain recipient addresses, recipient lists, amounts,
notes, claim signatures, encrypted handles, or input proofs.

### Encrypted Claim Capsule

The backend stores encrypted capsules only.

```ts
type EncryptedClaimCapsule = {
  claimId: string;
  distributionId: string;
  lookupKey?: string; // only when discoverable mode is enabled
  encryptedCiphertext: string;
  encryptionNonce: string;
  algorithm: "AES-GCM-256";
  createdAt: number;
};
```

Notes:

- `lookupKey` is a routing key, not plaintext claim data.
- `encryptedCiphertext` contains the encrypted plaintext capsule.
- `encryptionNonce` is not secret but must be unique for the capsule key.
- The backend must treat the full object as sensitive operational data even
  though it cannot decrypt the claim contents.

### Plaintext Capsule Before Encryption

The plaintext capsule exists only in browser memory before encryption and in the
recipient browser after decryption.

```ts
type PlaintextClaimCapsule = {
  recipientWallet: string;
  amount: string;
  note?: string;
  claimAuthorization: string;
  encryptedInput: {
    handle: string;
    inputProof: string;
  };
  token: string;
  tokenOpsAirdrop: string;
  chainId: number;
  distributionId: string;
};
```

Privacy rule: this plaintext shape must never be stored in VantaDropRegistry,
sent to a backend endpoint as plaintext, logged, committed, or rendered to anyone
except the intended recipient after an explicit decrypt/reveal action.

## 6. Lookup Key Design

Use:

```text
lookupKey = hash(distributionId + chainId + connectedWallet + distributionSalt)
```

Recommended details:

- Normalize `connectedWallet` to lowercase checksum-insensitive address text
  before hashing.
- Include `chainId` to prevent cross-chain key collisions.
- Generate `distributionSalt` per distribution.
- Store `distributionSalt` in backend metadata for discoverable drops, not in
  VantaDropRegistry.
- Treat the salt as public-but-random unless a later design adds authenticated
  salt delivery. A public salt still reduces simple precomputed address
  enumeration across all drops, but it does not stop targeted brute force.

Flow:

1. Recipient connects wallet.
2. Browser fetches public drop metadata for a discoverable distribution,
   including the distribution salt if needed for lookup.
3. Browser computes `lookupKey`.
4. Browser calls:

```text
GET /api/claims/lookup?distributionId=...&lookupKey=...
```

5. Backend checks whether `lookup:{distributionId}:{lookupKey}` exists.
6. If present, backend returns the encrypted claim capsule.
7. If absent, backend returns a generic not-eligible response.

Privacy properties:

- Browser computes the lookup key.
- Backend only checks whether an encrypted capsule exists.
- Backend does not learn allocation amount, note, claim signature, encrypted
  handle, or input proof.
- The salt reduces simple address enumeration, especially precomputed lookups
  across many distributions.

Important limitation:

- If an attacker has the public distribution id, chain id, distribution salt, and
  a target address list, they can compute candidate lookup keys. Rate limits,
  generic responses, and monitoring are still required.

## 7. Routes

Recommended routes:

```text
/drops
/drops/[id]
/claim/[claimId]#key
/recipient/demo
```

Route responsibilities:

- `/drops`: wallet discovery dashboard. Public metadata is visible. Recipient
  connects wallet to privately check eligible claim packages.
- `/drops/[id]`: distribution detail page. Shows public metadata, claim window,
  TokenOps clone link, registry link, privacy model, and eligibility action.
- `/claim/[claimId]#key`: private-link claim entry. Reads `claimId` from route
  params and AES key from URL hash, fetches encrypted capsule, decrypts locally,
  and opens the claim flow.
- `/recipient/demo`: can later reuse the same claim component for the demo path,
  replacing paste/upload with a capsule source.

Shared claim component target:

```text
ClaimFlow({ source: "private_link" | "wallet_discovery" | "manual_demo" })
```

This keeps wallet connection, eligibility, decrypt, claim, and verify UI in one
place while allowing different capsule-loading sources.

## 8. Dashboard UX

Dashboard route: `/drops`

Sections:

- Ongoing Airdrops
- Future Airdrops
- Past Airdrops

Each card shows:

- title
- use case
- token
- network
- status
- recipient count
- privacy mode
- claim window
- Check eligibility button

Recommended card behavior:

- Public users can browse public metadata without connecting.
- The eligibility button should say:

```text
Check eligibility
```

- Supporting copy should say:

```text
Connect your wallet to privately check eligible claim packages.
```

Eligibility states:

- Eligible
- Not eligible
- Already claimed
- Claim available
- Starts soon
- Ended

State interpretation:

- `Eligible`: lookup found a capsule and claim preflight indicates the claim can
  proceed.
- `Not eligible`: lookup found no capsule for the connected wallet and
  distribution.
- `Already claimed`: capsule may exist, but TokenOps claim preflight or claim
  status indicates the single-use authorization is consumed.
- `Claim available`: claim window is active and a capsule is available.
- `Starts soon`: distribution exists but `startsAt` is in the future.
- `Ended`: claim window has ended.

UX rule: do not show raw claim signatures, handles, input proofs, or plaintext
amounts on the dashboard. The amount appears only inside the recipient claim flow
after explicit reveal/decrypt.

## 9. Sender Flow

After `/create` successfully creates and signs the TokenOps distribution:

1. Keep existing TokenOps sequence unchanged:
   - sender prep
   - operator approval if needed
   - create and fund TokenOps confidential airdrop
   - encrypt recipient allocations
   - sign claim authorizations
   - write public metadata to VantaDropRegistry
2. Build one `PlaintextClaimCapsule` per recipient from the already-created
   claim payload.
3. Generate `claimId` for each recipient.
4. Encrypt each plaintext capsule in the browser with AES-GCM.
5. Upload encrypted capsules to backend:

```text
POST /api/claims/capsules
```

6. For Private Link Mode:
   - generate `/claim/[claimId]#key`
   - show copy/download private links to sender
   - warn sender that each link must be shared privately
7. For Wallet Discovery Mode:
   - generate and store lookup keys for each recipient
   - publish public distribution metadata for `/drops`
   - do not expose recipient list or amounts

The existing localStorage package saving can remain during transition, but the
product path should move toward encrypted capsules and private links.

## 10. Recipient Flow

Simple recipient UX:

```text
Connect wallet -> Check eligibility -> Reveal allocation -> Claim -> Verify
```

Private Link Mode:

1. Recipient opens `/claim/[claimId]#key`.
2. Browser fetches encrypted capsule by `claimId`.
3. Browser decrypts capsule using key from URL hash.
4. Recipient connects wallet.
5. App verifies connected wallet matches `recipientWallet` inside decrypted
   capsule.
6. Recipient checks eligibility.
7. Recipient grants decrypt access.
8. Recipient reveals allocation.
9. Recipient claims.
10. Recipient verifies confidential balance.

Wallet Discovery Mode:

1. Recipient opens `/drops`.
2. Recipient connects wallet.
3. Recipient clicks **Check eligibility** on a distribution card.
4. Browser computes lookup key.
5. Backend returns encrypted capsule if eligible.
6. Browser decrypts or unwraps the capsule according to the finalized discovery
   key model.
7. Recipient continues through the same claim flow.

Recipient copy must stay honest:

- The app can say it privately checks for eligible claim packages.
- The app must not imply a public contract recipient list exists.
- The app must not imply the backend can read the claim package.

## 11. API Endpoints

Proposed endpoints only. Do not implement in this phase.

### `POST /api/claims/capsules`

Purpose: store encrypted capsules after sender execution.

Input:

- distribution metadata reference
- encrypted capsule records
- optional lookup mappings for discoverable mode

Rules:

- Reject plaintext claim fields at runtime where possible.
- Do not accept `amount`, `recipientWallet`, `claimAuthorization`,
  `encryptedInput.handle`, or `encryptedInput.inputProof` as top-level plaintext
  API fields.
- Store encrypted ciphertext only.

### `GET /api/claims/:claimId`

Purpose: fetch encrypted capsule by private link claim id.

Returns:

- encrypted capsule metadata
- encrypted ciphertext
- nonce
- algorithm

Does not return:

- plaintext recipient wallet
- amount
- note
- claim signature
- handle
- input proof

### `GET /api/claims/lookup?distributionId=...&lookupKey=...`

Purpose: wallet discovery lookup.

Returns:

- generic not-found/not-eligible response, or
- encrypted capsule for the matching lookup key

Rules:

- Rate limit by IP, distribution id, and wallet session where possible.
- Avoid overly detailed failure reasons before decrypt/preflight.
- Do not leak recipient counts beyond public `recipientCount`.

### `GET /api/drops`

Purpose: list public distribution metadata for the discovery dashboard.

Returns:

- public metadata only
- no encrypted capsules
- no recipient-specific fields

### `GET /api/drops/:id`

Purpose: return public distribution detail.

Returns:

- public metadata
- claim window
- TokenOps clone address
- registry address
- privacy mode
- distribution salt if needed for discoverable lookup

Does not return recipient-specific claim data.

## 12. Risks

### URL Hash Key Loss

If the recipient loses the URL hash key, the backend cannot decrypt the capsule
for them. Recovery requires sender re-sharing the link or regenerating claim
delivery material if still possible.

### Link Forwarding

Anyone with a complete private claim link can fetch and decrypt the capsule. The
claim should still require the recipient wallet, but the link may expose private
claim metadata to the forwarded party after decryption. Copy must warn senders to
share links privately.

### Backend Metadata Leakage

Even without plaintext capsules, backend logs and KV keys can reveal operational
metadata: claim ids, lookup attempts, distribution ids, timestamps, and request
patterns. Minimize logs, avoid logging query strings where possible, and keep
responses generic.

### Lookup Key Brute Force Risk

If salts are public and attackers have target address lists, they can compute
candidate lookup keys. Mitigations:

- per-distribution salt
- rate limits
- generic not-eligible responses
- abuse monitoring
- optional wallet signature before lookup in a later phase

### Rate Limits

Discovery endpoints must be rate-limited. Without rate limits, an attacker could
enumerate common wallet lists against discoverable drops.

### Duplicate Claims

TokenOps claim authorization is single-use. UI must handle already-claimed state
honestly and never show fake success. Backend capsule existence is not proof that
the claim is still available.

### Expired Claims

Public metadata may show active/past status, but final truth for claim execution
comes from TokenOps preflight and on-chain state. UI must distinguish "capsule
found" from "claim currently executable."

### Claim Package Recovery

Because backend stores ciphertext only, it cannot recover plaintext claim data.
If keys or links are lost, recovery depends on sender-side retained material or a
new sender action. This is a product tradeoff of keeping the backend blind.

### Honest Privacy Copy

Avoid overclaiming. Correct statements:

- "Backend stores encrypted capsules only."
- "Public users can see public distribution metadata."
- "Connect your wallet to privately check eligible claim packages."
- "Your allocation is revealed only after your browser decrypts it."

Do not imply:

- the registry stores recipient eligibility
- the backend can verify plaintext recipient amounts
- capsule discovery is invisible to the backend
- link forwarding is impossible

## 13. Implementation Phases

### Phase 1: Architecture Doc Only

Create this document. No code, contracts, SDK logic, or deployments change.

### Phase 2: Encrypted Capsule Helpers

Add browser-only helpers for:

- AES-GCM key generation
- capsule encryption
- capsule decryption
- URL hash key encoding/decoding
- lookup key hashing

No backend writes yet.

### Phase 3: Backend KV Endpoints

Add Vercel KV / Upstash Redis integration and API endpoints:

- `POST /api/claims/capsules`
- `GET /api/claims/:claimId`
- `GET /api/claims/lookup`
- `GET /api/drops`
- `GET /api/drops/:id`

Keep validation strict so plaintext claim fields are rejected outside encrypted
ciphertext.

### Phase 4: Sender Capsule Creation / Private Links

Extend `/create` after successful TokenOps execution:

- create plaintext capsules in browser memory
- encrypt capsules client-side
- store encrypted capsules
- generate private links
- show secure sharing instructions

Do not change the TokenOps execution sequence.

### Phase 5: `/drops` Dashboard

Create public wallet discovery dashboard:

- Ongoing Airdrops
- Future Airdrops
- Past Airdrops
- public metadata cards
- Check eligibility action

No plaintext claim data on dashboard.

### Phase 6: Wallet Eligibility Lookup

Add wallet-derived lookup:

- connect wallet
- compute lookup key in browser
- call lookup endpoint
- handle eligible/not eligible/already claimed/starts soon/ended states

Use the approved copy:

```text
Connect your wallet to privately check eligible claim packages.
```

### Phase 7: Productized Claim Flow From Link/Dashboard

Refactor recipient claim UI into a reusable claim component that accepts a capsule
source:

- private link
- wallet discovery
- demo/manual fallback

The live action sequence remains:

```text
Connect wallet -> Check eligibility -> Reveal allocation -> Claim -> Verify
```

### Phase 8: Final QA and Submission

Run full checks:

- `git status`
- `git check-ignore .env.local`
- `npm run build`
- `npm run lint`
- `npx hardhat test`
- `npx tsc --noEmit`
- route verification for `/`, `/create`, `/drops`, `/drop/demo`,
  `/recipient/demo`, `/verification`, and representative `/claim/[claimId]#key`

Do not click live transaction buttons during visual verification unless a funded
burner-wallet live test is explicitly planned.
