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
- Move manual package handling out of the public user experience.
- Use an encrypted Claim Vault for wallet discovery in the MVP.
- Keep Private Link Mode as the stronger browser-encrypted path for later.
- Give recipients a wallet-based discovery path that does not require JSON paste,
  uploads, or package files.

This preserves the core privacy boundary while making the recipient experience
feel like a product instead of a diagnostic.

### Paychain-style wallet discovery correction

VantaDrop is moving manual package handling out of the public UX. Normal users
should not paste claim package JSON, upload package files, download package
files, or handle raw claim material. Manual import remains only in the hidden
developer diagnostic page: `/dev/recipient-claim-diagnostic`.

For wallet discovery without a private link, pure browser-only encryption is not
enough unless recipients pre-register encryption keys or the protocol adds a
separate wallet-bound key wrapping layer. The recommended MVP is therefore a
server-side encrypted Claim Vault:

- The sender flow sends plaintext claim capsules to the backend after the
  TokenOps distribution and claim signatures are created.
- The backend encrypts each capsule at rest with AES-256-GCM.
- The backend releases a decrypted capsule only after nonce-backed
  wallet-ownership verification for the matching recipient wallet.
- Eligibility signatures use one-time challenges with expiry and replay
  protection. Static reusable lookup messages are not acceptable.
- Recipient lookup records use server-side HMAC keys derived from
  `CLAIM_VAULT_LOOKUP_SECRET` instead of raw wallet-address storage keys.
- VantaDropRegistry still stores public metadata only and never stores
  recipient addresses, recipient lists, allocation amounts, notes, claim
  signatures, encrypted handles, or input proofs.

Private Link Mode can remain stronger end-to-end later because the browser can
encrypt the capsule before upload and keep the decryption key in the URL hash.
Wallet Discovery Mode is the better product UX, but it requires trusted
encrypted backend storage and honest copy. Public text must say that wallet
discovery uses trusted encrypted backend storage, not the browser-only
encryption boundary of Private Link Mode.

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
5. Browser requests a one-time eligibility challenge from the backend.
6. Browser asks the recipient to sign that nonce-bound harmless
   wallet-ownership message.
7. Backend verifies the nonce exists, belongs to the same distribution and
   wallet, has not expired, and has not already been consumed.
8. Backend verifies the signature recovers the connected wallet.
9. Backend consumes the nonce so the signature cannot be replayed.
10. Backend checks whether an encrypted capsule exists for that
   distribution/wallet pair.
11. If one exists, backend decrypts it server-side and returns the capsule only
   to that verified matching wallet.
12. Browser opens the claim flow without JSON paste or package files.

Required product copy:

> Connect your wallet to privately check eligible claim packages.

Avoid copy that implies the smart contract publicly identifies eligible wallets.
The discovery check is against encrypted backend capsules, not a public
contract-side recipient list.

Privacy properties:

- Public users see only public distribution metadata.
- Claim material is encrypted at rest in the Claim Vault and access-controlled
  by wallet signature verification.
- Backend can observe that a lookup occurred for a distribution and whether a
  capsule exists, and it handles plaintext during sender storage and verified
  recipient release. Rate limiting, access control, and honest copy are
  required.

## 3. Recommended Storage

For demo and deployment, use **Vercel KV / Upstash Redis**.

Claim Vault storage accepts either preferred Upstash REST env names or the
writable Vercel Redis/KV integration aliases:

Preferred:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Vercel Redis/KV aliases also supported:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Do not use `KV_REST_API_READ_ONLY_TOKEN` for Claim Vault writes because the
Claim Vault must write encrypted capsules and eligibility challenges.

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
lookup:{hmacLookupKey} -> claimId
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

- The MVP does not use this browser-only WebCrypto model.
- The sender flow sends plaintext capsules to the server after TokenOps signing.
- The server encrypts each capsule at rest using Node `crypto` AES-256-GCM.
- The server decrypts and returns a capsule only after wallet-ownership
  verification for the matching recipient wallet.
- A future private-link implementation can still use the browser-encrypted
  URL-hash-key model above.

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
- The backend must treat the full object as sensitive operational data. In
  wallet discovery mode, the backend can decrypt with the server-side Claim Vault
  key; in private-link mode, the backend should not have the URL hash key.

### Plaintext Capsule Before Encryption

In Private Link Mode, the plaintext capsule exists only in browser memory before
encryption and in the recipient browser after decryption. In Wallet Discovery
Mode MVP, the plaintext capsule is received by the backend from the sender flow,
encrypted at rest, and returned only to the verified matching wallet.

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
logged, committed, or rendered to anyone except the intended recipient after an
explicit decrypt/reveal action. In Private Link Mode it should not be sent to the
backend as plaintext. In the Wallet Discovery MVP, the sender flow sends it to
the Claim Vault endpoint so the server can encrypt it at rest and later release
it only to the verified matching wallet.

## 6. Lookup Key Design

Use a server-side HMAC lookup key:

```text
lookupKey = HMAC_SHA256(CLAIM_VAULT_LOOKUP_SECRET, distributionId + ":" + recipientWalletLowercase)
```

Recommended details:

- Normalize `connectedWallet` to lowercase checksum-insensitive address text
  before deriving the key.
- Use `CLAIM_VAULT_LOOKUP_SECRET` when configured.
- If `CLAIM_VAULT_LOOKUP_SECRET` is absent, fall back to
  `CLAIM_VAULT_ENCRYPTION_KEY` only when that key is present.
- Do not use hardcoded lookup secrets in production.
- Store lookup records by HMAC key, not by raw wallet address.
- The encrypted capsule may still contain the recipient wallet in ciphertext so
  the server can verify the decrypted capsule belongs to the signed wallet
  before returning it.

Flow:

1. Recipient connects wallet.
2. Browser requests a one-time challenge:

```text
POST /api/claim-vault/challenge
```

3. Backend stores `{ distributionId, walletAddressLowercase, nonce, message,
   issuedAt, expiresAt }` with a short TTL.
4. Browser asks the wallet to sign the returned message.
5. Browser submits:

```text
POST /api/claim-vault/lookup
```

with `distributionId`, `walletAddress`, `message`, `signature`, and `nonce`.
6. Backend verifies the nonce, expiry, wallet binding, distribution binding, and
   signature.
7. Backend deletes the challenge after a valid signed lookup attempt, before
   returning eligibility.
8. Backend derives the HMAC lookup key and checks whether a matching capsule
   exists.
9. If present, backend decrypts and returns the capsule only to the verified
   wallet.
10. If absent, backend returns a generic not-eligible response.

Privacy properties:

- Storage keys do not expose raw recipient wallet addresses.
- The backend does not enumerate recipients and returns a generic not-eligible
  response for misses.
- One-time challenges prevent replay of old eligibility signatures.
- Wallet discovery is not end-to-end encrypted in the MVP: the backend receives
  claim material from the sender flow and decrypts it for the verified matching
  recipient. This must remain clear in public copy.

Important limitation:

- The backend can observe challenge and lookup requests, and it can tell whether
  a verified wallet has a capsule for a distribution. Rate limits, generic
  responses, short challenge TTLs, replay protection, and monitoring are still
  required.

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
4. Browser requests a one-time eligibility challenge.
5. Recipient signs the harmless nonce-bound message.
6. Backend verifies and consumes the challenge.
7. Backend derives the server-side HMAC lookup key.
8. Backend decrypts and returns the capsule only if it belongs to the verified
   wallet.
9. Recipient continues through the same claim flow.

Recipient copy must stay honest:

- The app can say it privately checks for eligible claim packages.
- The app must not imply a public contract recipient list exists.
- The app must not imply wallet discovery is end-to-end encrypted in the MVP.
- The app should say claim material is stored in VantaDrop's encrypted Claim
  Vault and released only to the matching wallet.

## 11. API Endpoints

Current MVP endpoints for Claim Vault wallet discovery.

### `POST /api/claim-vault/capsules`

Purpose: store public drop metadata and server-encrypted capsules after sender
execution.

Input:

- `publicDropMetadata`
- `recipientCapsules[]` with recipient wallet, claim authorization, encrypted
  input handle/proof, token, TokenOps airdrop, chain id, and distribution id

Rules:

- Requires Claim Vault secrets.
- Encrypt each capsule server-side with AES-256-GCM.
- Store lookup records by server-side HMAC key, not raw wallet-address keys.
- Return only safe storage summary fields.
- Do not log plaintext capsules.

### `POST /api/claim-vault/challenge`

Purpose: create a one-time wallet-ownership challenge for eligibility lookup.

Input:

- `distributionId`
- `walletAddress`

Returns:

- `message`
- `nonce`
- `expiresAt`

Rules:

- Generate a cryptographically random nonce.
- Store challenge server-side with short expiry.
- Message must clearly say the signature only proves wallet ownership and does
  not move funds or grant approvals.

### `POST /api/claim-vault/lookup`

Purpose: wallet discovery lookup.

Input:

- `distributionId`
- `walletAddress`
- `message`
- `signature`
- `nonce`

Returns:

- generic not-eligible response, or
- plaintext capsule only for the verified matching wallet

Rules:

- Verify nonce exists, matches distribution/wallet, and has not expired.
- Verify the wallet signature against the exact challenge message.
- Consume/delete the challenge after a valid signed lookup attempt.
- Do not allow replay of old eligibility signatures.
- Derive lookup keys with `HMAC_SHA256(CLAIM_VAULT_LOOKUP_SECRET, ...)`.
- Rate limit by IP, distribution id, and wallet session where possible.
- Avoid overly detailed failure reasons before decrypt/preflight.
- Do not leak recipient counts beyond public `recipientCount`.

### `GET /api/claim-vault/:claimId`

Future private-link route for fetching encrypted ciphertext by private link claim
id. Not required for the wallet discovery MVP.

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

Add Claim Vault helpers for:

- server-side AES-256-GCM encryption at rest for wallet discovery
- future browser-side AES-GCM encryption for private-link mode
- one-time eligibility challenges
- HMAC lookup keys

No contracts, TokenOps SDK logic, or deployments change.

### Phase 3: Backend KV Endpoints

Add Vercel KV / Upstash Redis integration and API endpoints:

- `POST /api/claim-vault/capsules`
- `POST /api/claim-vault/challenge`
- `POST /api/claim-vault/lookup`
- `GET /api/drops`
- `GET /api/drops/:id`

Keep validation strict, avoid plaintext logs, store encrypted capsules at rest,
and keep public drop endpoints metadata-only.

### Phase 4: Sender Capsule Creation / Private Links

Extend `/create` after successful TokenOps execution:

- create plaintext capsules in browser memory after TokenOps execution
- send capsules to Claim Vault storage endpoint
- encrypt capsules server-side at rest for wallet discovery MVP
- show Claim Vault discovery status
- reserve private-link generation for a later E2E mode

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
