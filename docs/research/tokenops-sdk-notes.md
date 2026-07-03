# TokenOps SDK — Ground-Truth Research Notes

**Method:** This report is built from primary sources only — `npm view` against the live registry, and direct inspection of the installed package's `.d.ts` files (real TSDoc, not reconstructed) after installing `@tokenops/sdk` into a throwaway scratch directory (`%TEMP%\tokenops-inspect`, outside this project). Supplemented with `docs.tokenops.xyz` for the product-level narrative (funding lifecycle, gas/HCU costs, mainnet-readiness status) where it went beyond the `.d.ts` comments. Nothing here is guessed or extrapolated from an unrelated SDK's conventions.

Date: 2026-07-03.

---

## Package identity

| Field | Value |
|---|---|
| Package | `@tokenops/sdk` |
| Latest version | **1.1.1** (published a week before this research; previous version was `1.0.0`) |
| License | BSD-3-Clause-Clear |
| Repository | `github.com/VestingLabs/tokenops-sdk` (private — 404 on unauthenticated `gh api`) |
| Homepage | https://tokenops.xyz, docs at https://docs.tokenops.xyz |
| Description (registry) | "Typed viem-first SDK for TokenOps FHEVM contracts (confidential vesting, confidential airdrops, confidential disperse, plus a testnet faucet for the ERC-7984 test-token pair TTT + CTTT) — consumed by tokenops-app (Next.js) and tokenops-api (Express)." |

### Exact install command

```bash
npm install @tokenops/sdk viem @zama-fhe/sdk
# or pnpm add @tokenops/sdk viem @zama-fhe/sdk@^3

# React hook subpaths additionally need:
npm install wagmi react react-dom @tanstack/react-query @zama-fhe/react-sdk
```

Confirmed by installing into a scratch dir: `@tokenops/sdk@1.1.1` + `viem@2.54.2` + `@zama-fhe/sdk@3.2.0` installed cleanly, 0 vulnerabilities, no peer-dep conflicts.

**`package.json` peer dependencies (verified from the installed package, not the README):**

```json
"peerDependencies": {
  "@tanstack/react-query": "^5.0.0",
  "@zama-fhe/react-sdk": "^3.0.0",
  "@zama-fhe/sdk": "^3.0.0",
  "react": ">=18.0.0",
  "viem": "^2.47.0",
  "wagmi": "^2.0.0"
},
"peerDependenciesMeta": {
  "@zama-fhe/sdk": { "optional": true },
  "@zama-fhe/react-sdk": { "optional": true },
  "react": { "optional": true },
  "wagmi": { "optional": true },
  "@tanstack/react-query": { "optional": true }
},
"engines": { "node": ">=22", "pnpm": ">=10" }
```

Only `viem` is hard-required; everything else is an optional peer so read-only/ABI-only consumers aren't forced to install FHE/React deps. **Node ≥ 22 is required** (constraint from `@zama-fhe/sdk`).

---

## Exported modules (subpath exports, verified via `npm view @tokenops/sdk exports` and the installed `dist/**/*.d.ts`)

| Subpath | Status (per TokenOps) | Purpose |
|---|---|---|
| `@tokenops/sdk` | stable | Root re-exports: `TokenOpsSdkError` + all typed error subclasses, `PreflightResult` type |
| `@tokenops/sdk/telemetry` | stable | `NoopTelemetry`, `ConsoleTelemetry`, `TokenOpsTelemetry` sink adapters |
| `@tokenops/sdk/fhe` | stable | Shared FHE helpers: `setOperator`, `revokeOperator`, `erc7984OperatorAbi`, `createSepoliaEncryptorWeb`, `createSepoliaEncryptor` (Node), `createMockEncryptor`, ratio/scale helpers |
| `@tokenops/sdk/fhe/react` | stable | `useDecryptedHandle` + shared FHE React hooks |
| `@tokenops/sdk/fhe-vesting` | **factory live on Sepolia** | Confidential vesting: `createConfidentialVestingFactoryClient`, `createConfidentialVestingManagerClient`, `confidentialVestingManagerAbi`, `FeeType` |
| `@tokenops/sdk/fhe-vesting/react` | stable | React/wagmi hooks (`useCreateManagerAndGetAddress`, `useCreateVesting`, `useClaim`, `useManagerFeeInfo`, `useAdminDiscloseToParty`, etc. — 20+ hooks) |
| `@tokenops/sdk/fhe-vesting/advanced` | stable | `predictManagerAddress` (pre-mine address prediction) |
| `@tokenops/sdk/fhe-vesting/advanced/react` | stable | React hooks for advanced vesting flows |
| `@tokenops/sdk/fhe-airdrop` | **factory live on Sepolia** | Confidential airdrop: `createConfidentialAirdropFactoryClient`, `createConfidentialAirdropClient`, `encryptUint64`, `signClaimAuthorization` |
| `@tokenops/sdk/fhe-airdrop/react` | stable | React/wagmi hooks (`useCreateConfidentialAirdropAndGetAddress`, `useSignClaimAuthorization`, `useClaim`, `useAccessClaimAmount`, 15+ more) |
| `@tokenops/sdk/fhe-airdrop/advanced` | stable | `predictAirdropAddress` (stable prediction — airdrop clones don't pack `block.number` into immutable args, unlike vesting) |
| `@tokenops/sdk/fhe-airdrop/advanced/react` | stable | React hooks for advanced airdrop flows |
| `@tokenops/sdk/fhe-disperse` | **singleton live on mainnet + Sepolia** | Confidential bulk payouts: `createConfidentialDisperseClient` |
| `@tokenops/sdk/fhe-disperse/react` | stable | React/wagmi hooks (`useIsRegistered`, `useRegister`, `usePreflightDisperse`, `useDisperse`, `useAccessEncryptedFeeReserve`, etc.) |
| `@tokenops/sdk/testnet-faucet` | **token pair live on Sepolia** | `createTestnetFaucetClient` — mints TTT (plain ERC-20) + CTTT (ERC-7984 wrapper) test tokens |
| `@tokenops/sdk/testnet-faucet/react` | stable | React hooks — no `@zama-fhe/react-sdk` needed (public plaintext mints) |

**"Deployed factories only."** The SDK explicitly does not offer `deployFactory` helpers — it calls into pre-deployed factories/singletons only. This is a documented design decision (see `## Design` in the README), not a gap.

---

## Confirmed deployed contract addresses (from `dist/core/addresses.d.ts`, literal TypeScript const values — not reconstructed)

```ts
DEPLOYED_ADDRESSES = {
  fheVesting: {
    confidentialVestingFactory: {
      11155111: "0xA87701CE9A52D43681600583a99c85b50DbE3150", // Sepolia
    },
  },
  fheAirdrop: {
    confidentialAirdropFactory: {
      11155111: "0xbE6A3B78B36684fFee48De77d47Bc3393F5Acd4c", // Sepolia
    },
  },
  fheDisperse: {
    disperseConfidentialSingleton: {
      1:         "0x4fC0d28cBe4B82D512Ad0B42F6787480Cc98cC70", // Mainnet
      11155111:  "0x710dD9885Cc9986EfD234E7719483147a6d8DBb4", // Sepolia
    },
  },
  testnetFaucet: {
    testToken:             { 11155111: "0x37a057Fa8C201a7bf8caF32dfa9A0878f577D92b" }, // TTT, 18 decimals
    confidentialTestToken: { 11155111: "0x258F9D60dc023870e4E3109c894D834D5377361a" }, // CTTT, 6 decimals
  },
}
```

Accessors: `getFheVestingFactoryAddress(chainId)`, `getFheAirdropFactoryAddress(chainId)`, `getFheDisperseSingletonAddress(chainId)`, `getTestTokenAddress(chainId)`, `getConfidentialTestTokenAddress(chainId)` — all return `Address | undefined`. `require*` variants throw instead of returning `undefined`. Also: `chainsWithKnownRegistryEntry(product)` and `chainsWithDeployment(product)` for gating UI on deployment status.

**These match the addresses independently found in a third-party reference app's `deployments/sepolia.json` during earlier web research** — cross-confirmed, not a single-source claim.

---

## Confidential airdrop — exact API (from `dist/fhe-airdrop/*.d.ts`)

### Factory (`ConfidentialAirdropFactoryClient`, `createConfidentialAirdropFactoryClient`)

```ts
createConfidentialAirdrop(args: { params: AirdropParams; userSalt: Hex; account?: Account | Address })
  → Promise<{ hash: TxHash; airdrop: Address }>
// Deploy only — does not fund. Address parsed from `ConfidentialAirdropCreated` event.

createAndFundConfidentialAirdrop(args: {
  params: AirdropParams; userSalt: Hex;
  amount?: bigint; encryptor?: Encryptor;      // provide amount+encryptor…
  encryptedInput?: EncryptedInput;             // …OR a pre-encrypted input (mutually exclusive)
  account?: Account | Address;
}) → Promise<{ hash: TxHash; airdrop: Address }>
// Deploy AND fund in one tx. Requires the factory to already be an ERC-7984 operator
// on the token (setOperator prerequisite — see below).

fundConfidentialAirdrop(args: { token, params, userSalt, deployer, gasFee, amount|encryptedInput, account })
  → Promise<Hex>
// Fund an existing (or not-yet-deployed) clone separately.

createConfidentialAirdropAndGetAddress(args) → same as createConfidentialAirdrop (naming symmetry helper)
createAndFundConfidentialAirdropAndGetAddress(args) → same as createAndFundConfidentialAirdrop

// Admin/factory-governance methods (role-gated):
setFeeCollector / setDefaultGasFee / setCustomFee / disableCustomFee   // FEE_MANAGER_ROLE
implementation() / airdropImplementation()                            // current LibClone impl address
defaultGasFee() / feeCollector() / getCustomFee(creator)
getInitCodeHash({ params, gasFee })                                    // CREATE2 init-code hash
```

`AirdropParams = { token: Address; startTimestamp: number; endTimestamp: number; canExtendClaimWindow: boolean; admin: Address }`.

**Funding is a separate concern from creation** — confirmed both by the `.d.ts` (three distinct create/fund method combinations) and by `docs.tokenops.xyz/airdrop`: *"Funding is a separate step, not bundled into creation. Available hooks include `useCreateConfidentialAirdrop` (deploy only) and `useFundConfidentialAirdrop` (fund separately), plus combined operations like `useCreateAndFundConfidentialAirdrop`."* The README's quickstart snippet uses the deploy-only call and doesn't show funding — that's an omission in the quickstart, not evidence funding is bundled implicitly.

**Prerequisite for any fund path:** the issuer must have already called `setOperator(factoryAddress, deadline)` on the ERC-7984 token (see the shared `@tokenops/sdk/fhe` section below).

### Clone client (`ConfidentialAirdropClient`, `createConfidentialAirdropClient`)

```ts
token() / gasFee() / startTime() / endTime() / canExtendClaimWindow() / isPaused()
/ deploymentBlockNumber() / hasClaimStarted() / hasClaimEnded() / isClaimWindowActive()
/ domainSeparator() / claimTypehash()

claimedSignatures(signatureHash: Hex) → Promise<boolean>
isSignatureClaimed(user: Address, encryptedAmountHandle: Hex) → Promise<boolean>  // preferred over claimedSignatures

isSignatureValid({ encryptedAmountHandle, signature, caller }) → Promise<boolean>
// false (not a throw) = structurally valid sig but already-claimed / window inactive / signer not admin.
// THROWS InvalidSignatureError if the signature bytes themselves are malformed.

preflightClaim({ caller, encryptedAmountHandle }) → Promise<PreflightResult>
// Read-only, no gas. Checks: window started, window not closed, not paused,
// not already claimed, ETH balance covers gasFee(). Does NOT check: admin-signature
// validity (needs a round trip) or pool funding (balance is an encrypted handle the
// SDK can't read plaintext) — an unfunded pool passes preflight and reverts on-chain
// with FheHandleNotAllowedError at claim time. Confirm funding out-of-band.

getClaimAmount({ encryptedInput, signature, account? }) → Promise<{ handle: Hex; hash: Hex }>
// WRITE TX, COSTS GAS. Verifies the admin signature and grants the caller persistent
// ACL decrypt access on the allocation handle — WITHOUT consuming the claim. This is
// the SDK-native "preview/verify my allocation before claiming" call. Pass the
// returned `handle` + this contract's address to a Zama relayer's userDecrypt to see
// the plaintext amount. Calling this again after claim still works for re-verification
// (does not un-consume the claim) but calling it with an ALREADY-CLAIMED signature is
// documented on docs.tokenops.xyz to revert (`SignatureAlreadyClaimed`) — verify this
// ordering matches getClaimAmount vs claim sequencing before relying on post-claim previews.

claim({ encryptedInput, signature, value?, account? }) → Promise<Hex>
// Submits the admin-issued {encryptedInput, signature} pair VERBATIM — the SDK does
// NOT re-encrypt on the recipient side (the signature commits to a specific handle).
// Auto-attaches gasFee() as msg.value if `value` omitted.

withdraw(recipient, account?)                          // DEFAULT_ADMIN_ROLE, throws FheHandleNotAllowedError if pool never funded
setPaused(paused, account?)                             // DEFAULT_ADMIN_ROLE
extendClaimWindow(newEndTime, account?)                 // DEFAULT_ADMIN_ROLE, requires canExtendClaimWindow
withdrawOtherToken / withdrawOtherConfidentialToken     // DEFAULT_ADMIN_ROLE, rescue functions
withdrawGasFee(recipient, amount, account?)             // FEE_COLLECTOR_ROLE
hasRole / grantRole / revokeRole
```

### Free functions

```ts
encryptUint64({ encryptor, contractAddress, userAddress, value: bigint }) → Promise<{ handle: Hex; inputProof: Hex }>
// The proof is bound to (contractAddress, userAddress) at encrypt time — the on-chain
// FHE.fromExternal rejects any other binding. MUST encrypt with userAddress = the
// intended RECIPIENT, not the admin/issuer.

signClaimAuthorization({ walletClient, airdropAddress, recipient, encryptedAmountHandle }) → Promise<Hex>
// EIP-712 signature over Claim(address recipient, bytes32 encryptedAmount), signed by
// an address holding DEFAULT_ADMIN_ROLE on the clone.
```

### The full lifecycle (admin → recipient), as documented on `docs.tokenops.xyz/airdrop`

1. Admin deploys a clone (`createConfidentialAirdrop` or the AndFund variant).
2. Admin `setOperator`s the factory on the token (prerequisite for funding).
3. Admin funds the clone (bundled or separate `fundConfidentialAirdrop`).
4. Per recipient: admin encrypts the allocation bound to that recipient (`encryptUint64`) then signs `signClaimAuthorization` — **"the signature IS the authorization"**, no on-chain merkle root/allowlist involved.
5. Admin delivers `{ encryptedInput, signature }` to the recipient out-of-band (API, email, shared storage — the SDK is agnostic to this transport).
6. Recipient (optional but recommended): `getClaimAmount` — writes an ACL grant, returns a handle, decrypt via Zama relayer's `userDecrypt` to preview the plaintext amount **before** spending the claim tx.
7. Recipient: `preflightClaim` → `isSignatureValid` → `claim`. Claim recomputes the struct hash over `(msg.sender, encryptedAmount)`, checks the admin's signature, marks it consumed (`claimedSignatures`), grants the token contract transient FHE access, and calls `confidentialTransfer`.
8. Signature is single-use; a second claim attempt reverts (`AlreadyClaimedError`, code `TOKENOPS_ALREADY_CLAIMED`).

### Gas / HCU cost (from `docs.tokenops.xyz/resources/mainnet-readiness`)

Airdrop claim: **~310k EVM gas / ~1.1M HCU** (~$3–5 at 20 gwei). HCU = "Homomorphic Compute Unit"; a 5,000,000 HCU ceiling applies per transaction.

---

## Confidential disperse — exact API (from `dist/fhe-disperse/singleton.d.ts`)

One singleton per chain (`0x710d...` Sepolia, `0x4fC0...` mainnet) — no per-campaign clone/factory. Two-step: **register** a dedicated wallet pair once, then **disperse**.

```ts
createConfidentialDisperseClient({ publicClient, walletClient, encryptor, address?, chainId?, aclAddress?, telemetry? })

isRegistered(user) → Promise<boolean>
getWallets(user) → Promise<[Address, Address] | null>          // registered sub-wallet pair
predictWallets(user) → Promise<[Address, Address]>              // deterministic, works pre-registration
register({ token, account? }) → Promise<{ hash; wallets: [Address, Address] }>  // one-time; deploys 2 ERC-1167 clones + approves them as operators
approveTokenOnWallets({ token, account? }) / revokeTokenOnWallets(...)
hasApprovedSubwallets({ user, token }) → Promise<SubwalletApprovalState>

getFees(user) / getCustomFee(user) / getFeeConfig() / getBatchLimits() / calculateFee(args)

preflightDisperse({ user, token, recipients, amounts, mode }) → Promise<PreflightReport>
// mode: "wallet" | "direct" | "wallet-token-fee" (three distinct disperse modes)
// report.ready: boolean; report.blockerErrors: TokenOpsSdkError[] (typed, has .code);
// report.blockers: string[] is deprecated back-compat, will be removed next major.

disperse({ token, mode, recipients, amounts }) → Promise<{ hash, ...DisperseResult }>
// Validates inputs, computes wallet-mode subtotals via the contract's exact split rule,
// encrypts amounts+subtotals in ONE batched input proof, attaches msg.value for gas-fee
// modes (0 for token-fee mode), dispatches to the right contract function for `mode`.

recoverFromWallets({ token, to, account? })       // recover residual confidential tokens after an inflated-subtotal disperse
recoverERC20FromWallets({ token, to, account? })

getEncryptedFeeReserve({ ... }) → Promise<EncryptedViewResult>   // WRITE TX, grants ACL on accrued token-fee handle; FEE_COLLECTOR_ROLE/DEFAULT_ADMIN_ROLE
discloseHandleToParty / batchDiscloseHandlesToParty              // grant a third party persistent ACL on a handle you control

pause() / unpause()                                              // PAUSER_ROLE
setFeeConfig / setCustomFee / disableCustomFee                   // FEE_MANAGER_ROLE
setMaxBatchSizeHolding / setMaxBatchSizeDirect / setMaxBatchSizeTokenFee   // DEFAULT_ADMIN_ROLE
withdrawGasFee / withdrawTokenFee / rescueConfidentialTokens / rescueERC20
hasRole / grantRole / revokeRole / renounceRole
paused() / deploymentBlockNumber() / walletImplementation()
```

Fee model differs from airdrop/vesting: disperse supports **token-based fees** (deducted from the encrypted transfer amount, no ETH needed) in addition to gas-wei fees — the only one of the three products with that option. Gas/HCU cost: **~450k EVM gas / ~1.2M HCU per 5-recipient batch** (~$4–7 @ 20 gwei).

`fhe-disperse` is the **only one of the three FHE products currently live on mainnet** (in addition to Sepolia) — `fhe-vesting` and `fhe-airdrop` are Sepolia-only pending further audit/pilot gates (see Mainnet Readiness section below). Not relevant to this bounty (Sepolia-only submission) but worth knowing.

---

## Confidential vesting — API surface (from README quickstart + `.d.ts` headers; less deeply inspected than airdrop, see open items)

```ts
createConfidentialVestingFactoryClient({ publicClient, walletClient })
  .createManagerAndGetAddress({ token, userSalt }) → Promise<{ manager: Address, hash }>
  // NOTE: vesting clone's immutable args pack the deployment block number, so
  // predict-then-deploy is unreliable on a live chain — always parse the
  // ManagerCreated event from the receipt rather than assuming a predicted address.

createConfidentialVestingManagerClient({ publicClient, walletClient, address, encryptor })
  .createVesting({ params: VestingParams, amount: bigint }) → Promise<Hash>
  // params: { recipient, startTimestamp, endTimestamp, cliffSeconds, releaseIntervalSecs,
  //           timelockSeconds, initialUnlockBps, cliffAmountBps, isRevocable }
  // vestingId (bytes32) is parsed from the VestingCreated event in the receipt — save it.
  .claim({ vestingId, feeType: FeeType.Gas | FeeType.DistributionToken, value? })
  .feeType() → discriminates which ClaimArgs shape is required (value in wei for Gas, omit for DistributionToken)
```

`@tokenops/sdk/fhe-vesting/advanced`: `predictManagerAddress` for genuine pre-mine prediction needs.

Gas/HCU cost: **~280k EVM gas / ~900k HCU per claim** (~$2.50–4).

**Not deeply inspected beyond the README quickstart + type headers** — if VantaDrop's scope grows to include vesting, re-run the same `.d.ts`-inspection pass done for airdrop against `dist/fhe-vesting/manager.d.ts` and `dist/fhe-vesting/factory.d.ts` before writing integration code.

---

## Testnet faucet — solves "where do we get an ERC-7984 test token" (from `dist/testnet-faucet/faucet.d.ts`)

**This answers the "ERC-7984 token requirements" research question directly: we do not need to deploy our own confidential token for a demo.** TokenOps ships a pre-deployed, open-mint test-token pair on Sepolia:

- **TTT** (`TokenopsTestToken`) — plain ERC-20, 18 decimals, open `mint`.
- **CTTT** (`ConfidentialTokenopsTestToken`) — its ERC-7984 confidential wrapper, 6 decimals, UUPS proxy, open backed `mint`.

```ts
createTestnetFaucetClient({ publicClient, walletClient, address?, chainId? })
  .mintConfidential({ amount: bigint }) → Promise<{ hash, to, amount, underlyingMinted, handle }>
    // Mints CTTT backed 1:1(scaled) by freshly-minted TTT. AMOUNT IS PUBLIC PLAINTEXT
    // calldata + ConfidentialMint event — only the recipient's resulting balance is
    // confidential. No encryptor/relayer needed for the mint call itself.
  .mintUnderlying({ amount: bigint }) → Promise<{ hash, to, amount }>   // plain TTT mint
  .confidentialBalanceOf(account?) → Promise<Hex>   // encrypted euint64 handle; SDK is producer-side only, YOU userDecrypt it
  .underlyingBalanceOf(account?) → Promise<bigint>
  .underlyingToken() / .rate() / .decimals() / .underlyingDecimals() / .inferredTotalSupply() / .maxTotalSupply()
  .getMetadata() → consolidated faucet panel data
```

**Guardrail:** the client throws `UnsupportedChainError` on any value-bearing chain (mainnet) — it only runs on Sepolia + local Anvil, by design, since mints are free/permissionless.

This means VantaDrop's issuer-side "get a token to distribute" step can be: mint TTT → mint/wrap into CTTT via the faucet, entirely through this module, no custom Solidity needed for the demo token.

---

## Recipient decrypt/verify flow — does the SDK support it? **Yes, precisely, at two levels.**

### Level 1 — TokenOps-native, airdrop-specific: `getClaimAmount`
As documented above: a **write transaction** (costs gas) that verifies the admin signature and grants the caller a persistent FHEVM ACL decrypt-grant on the allocation handle, *without consuming the claim*. This is the SDK's own built-in "let the recipient see what they're about to claim" primitive — call it before `claim()`. Equivalent methods exist per-product: vesting exposes `useAccessClaimableAmount` / `useAccessVestedAmount` / `useAccessSettledAmount` (admin + recipient variants), disperse exposes `getEncryptedFeeReserve` (fee-focused, not recipient-allocation-focused).

### Level 2 — generic decrypt utility: `useDecryptedHandle` (`@tokenops/sdk/fhe/react`) / raw `userDecrypt`
```ts
useDecryptedHandle({
  handle: viewResult?.handle,             // any EncryptedHandle from an *EncryptedViewResult*-shaped call
  contractAddress: managerOrAirdropAddress,
  userDecryptor: () => useZamaSDK().relayer,   // lazy — re-reads live Zama context per decrypt
  relayerParams: { ...keypair, requestValidity, contractsChainId },
}) → { status: "idle"|"loading"|"success"|"error", value?: bigint, error?: Error }
```
This is a thin, structurally-typed wrapper: it accepts **any** v3 Zama `RelayerSDK` (`RelayerWeb`, `RelayerNode`, or `MockFhevmInstance`) without importing `@zama-fhe/sdk` itself as a hard dependency — consumers own the relayer/keypair/EIP-712-permit wiring via `@zama-fhe/sdk` / `@zama-fhe/react-sdk` directly. **The TokenOps SDK is explicitly "the producer side only"** for encrypted balances/handles (its own docs say this verbatim for the faucet's `confidentialBalanceOf`) — the actual EIP-712 permit signature + relayer `userDecrypt` round trip is Zama-SDK territory, not TokenOps-SDK territory. `@tokenops/sdk/fhe/react`'s `useDecryptedHandle` is a convenience wrapper over that, nothing more.

### Practical UX implication for VantaDrop
A recipient-side "Verify your allocation" feature = `getClaimAmount()` (TokenOps) → feed the returned `handle` into `useDecryptedHandle` (TokenOps convenience) or raw `RelayerWeb/RelayerNode.userDecrypt` (Zama SDK directly) → render the plaintext `bigint`. This satisfies the bounty brief's explicit requirement ("recipients can still verify and decrypt their own allocation") using **only documented, SDK-native calls** — no custom contract work needed.

---

## Error handling — typed, stable codes (from `dist/core/errors.d.ts`)

Every SDK error extends `TokenOpsSdkError` (`{ name, code, context, cause }`) and is brand-checkable cross-realm via `isTokenOpsSdkError()` (safer than `instanceof` across bundle boundaries). Full stable code list (`TokenOpsSdkErrorCode`), 47 values, includes (non-exhaustive, airdrop/shared-relevant subset):

`TOKENOPS_ALREADY_CLAIMED`, `TOKENOPS_CLAIM_NOT_STARTED`, `TOKENOPS_CLAIM_WINDOW_CLOSED`, `TOKENOPS_INVALID_SIGNATURE`, `TOKENOPS_FHE_HANDLE_NOT_ALLOWED`, `TOKENOPS_INSUFFICIENT_BALANCE`, `TOKENOPS_INSUFFICIENT_FEE`, `TOKENOPS_PAUSED`, `TOKENOPS_ACCESS_DENIED`, `TOKENOPS_WALLET_REJECTED`, `TOKENOPS_WALLET_CHAIN_MISMATCH`, `TOKENOPS_INSUFFICIENT_GAS_FUNDS`, `TOKENOPS_RELAYER_UNREACHABLE`, `TOKENOPS_ENCRYPTION_FAILED`, `TOKENOPS_DECRYPTION_FAILED`, `TOKENOPS_USER_DECRYPT_NOT_ALLOWED`, `TOKENOPS_NOT_REGISTERED`, `TOKENOPS_ALREADY_REGISTERED`, `TOKENOPS_FAUCET_SUPPLY_EXHAUSTED`, `TOKENOPS_DEPLOYMENT_ADDRESS_UNAVAILABLE`, `TOKENOPS_UNSUPPORTED_CHAIN`.

Notable typed subclasses relevant to airdrop UX: `AlreadyClaimedError`, `ClaimNotStartedError` (`context.startsAt`), `ClaimWindowClosedError` (`context.endedAt`), `InvalidSignatureError`, `FheHandleNotAllowedError` (on-chain "no ACL grant" — fires *during* a tx), `UserDecryptNotAllowedError` (off-chain "no ACL grant" — fires *before* any tx, at the relayer). Both mean "no permission on this handle"; they differ only in *when* detected — documented explicitly as a pair in the source comments.

`preflightClaim` / `preflightDisperse` return `{ ready: boolean, blockers: TokenOpsSdkError[] }` — the same typed errors the write path would throw, just collected instead of thrown, so UI error-rendering logic can be shared between preflight and catch-blocks.

---

## Sepolia / network requirements

- Chain ID `11155111`.
- `@zama-fhe/sdk`'s `SepoliaConfig` (from `@zama-fhe/sdk/node` or `/web`) bundles all FHEVM protocol contract addresses (ACL, KMS Verifier, Input Verifier, FHEVM Executor, Decryption Oracle) and the public relayer URL (`https://relayer.testnet.zama.org/v2`, confirmed from `sepolia-encryptor-web.d.ts`) — **not hand-entered**, just passed through.
- TokenOps' own contract addresses (factories/singletons/faucet tokens) are the `DEPLOYED_ADDRESSES` table above — resolved automatically by chain ID inside every `create*Client()` call; override only for local Anvil / custom deployments.
- **`fhe-airdrop` and `fhe-vesting` are Sepolia-only today** (per `docs.tokenops.xyz/resources/mainnet-readiness`) — mainnet deployment is blocked on: (1) mainnet KMS reaching Sepolia's security posture, (2) ≥3 design-partner pilots at production-like volume for a full quarter, (3) CREATE3 deployment from an audited deployer. Not our problem for this bounty (Sepolia-only), but explains why no mainnet address exists for these two products in the registry.
- **Gas/HCU budget:** airdrop claim ~310k gas/~1.1M HCU (~$3–5 @ 20 gwei); vesting claim ~280k gas/~900k HCU (~$2.50–4); disperse ~450k gas/~1.2M HCU per 5-recipient batch (~$4–7). A **5,000,000 HCU per-transaction ceiling** applies platform-wide — relevant if disperse batch sizes grow large.
- **Faucet**: standard Sepolia ETH faucets work (this is unmodified Sepolia, no custom L2/L3) — Zama's own testnet app also has an in-app faucet. Test *tokens* (not ETH) come from `@tokenops/sdk/testnet-faucet` itself, no external faucet needed.

## Required env vars (convention from the SDK's own example scripts, not an SDK-enforced contract)

The SDK takes no env vars directly — all config is passed as constructor args. The pattern used in TokenOps' own quickstarts:

```
PRIVATE_KEY=            # deployer/admin signer, used via viem's privateKeyToAccount
RPC_URL=                # Sepolia JSON-RPC endpoint (public or private)
TOKEN=                  # ERC-7984 token address under distribution (or use the testnet faucet's CTTT)
```
Browser/React usage instead wires a connected wallet (wagmi) — no private key env var needed client-side.

## Audit / security status (from `docs.tokenops.xyz/resources/mainnet-readiness`)

All three FHE products (vesting, airdrop, disperse) have been audited by OpenZeppelin: **0 critical, 0 high findings** across both reports. The airdrop audit (January 2026) found one medium-severity issue (`withdrawOtherConfidentialToken` FHE-handle leak risk via `allowTransient` on an externally-supplied confidential-token contract) — **already resolved** in the shipped SDK/contracts (the `.d.ts` for `withdrawOtherConfidentialToken` carries no such warning, consistent with a fix). Vesting and disperse audits: May 2026.

---

## Do we deploy contracts, or does the SDK use existing ones?

**The SDK exclusively calls pre-deployed factories/singletons.** There is no `deployFactory` / `deployToken` helper anywhere in the package. For VantaDrop:
- Airdrop/vesting: we deploy per-campaign **clones** via the existing factory (`createConfidentialAirdrop`, `createManagerAndGetAddress`) — this is a normal write tx against TokenOps' factory, not "our own contract deployment" in the sense of shipping custom Solidity.
- Disperse: no clone at all — one shared singleton, we just `register()` once per user.
- The **token being distributed** is the one thing not supplied by TokenOps' factories — either point at an existing ERC-7984 token, or use the **testnet faucet's CTTT** for a zero-setup demo (recommended for the bounty timeline).
- We do not need to write or audit any Solidity ourselves to have a working end-to-end demo.

---

## Blockers / unknowns still open

1. **`getClaimAmount` vs `claim` ordering / re-callability** — `docs.tokenops.xyz` states a *consumed* signature makes further `getClaimAmount` calls revert (`SignatureAlreadyClaimed`), meaning the "verify after you've claimed" UX (re-decrypting your balance post-claim) must go through the token's own `confidentialBalanceOf` + a generic decrypt, **not** a second `getClaimAmount` call. Confirm this exact revert behavior against a live Sepolia clone before building the post-claim "verify" screen around it.
2. **`fhe-vesting` and `fhe-disperse` .d.ts files were not read as deeply as `fhe-airdrop`'s** (time-boxed for this pass) — if the build plan scopes in vesting or disperse, repeat the `.d.ts` read pass (`dist/fhe-vesting/manager.d.ts`, `dist/fhe-vesting/factory.d.ts`, `dist/fhe-disperse/types.d.ts`) before writing integration code against them.
3. **`docs.tokenops.xyz` repo is private** (`github.com/VestingLabs/tokenops-sdk` 404s on unauthenticated access) — no access to source, tests, or the "CLAUDE.md Pitfall #1/#3" notes referenced in the shipped TSDoc comments themselves (e.g. "SDK methods that return an encrypted handle MUST parse the receipt's ACL `Allowed` event, never `simulateContract().result`" — Pitfall #1; "lazy encryptor factories must return a fresh instance per wallet-switch" — Pitfall #3). We only have these secondhand, embedded in comments — treat them as authoritative since they're quoted verbatim from the package's own doc comments, but there may be more pitfalls we haven't seen.
4. **No live Sepolia round-trip has been executed yet** — everything above is verified against types/docs, not a live claim/decrypt transaction. Before demo day, run one full cycle (mint CTTT from faucet → create+fund airdrop → sign claim → recipient claims → recipient decrypts) against real Sepolia to catch any runtime surprises (relayer latency, gas estimation, wallet UX) that don't show up in types.
5. **`@zama-fhe/react-sdk`'s exact hook catalogue** (`ZamaProvider`, `useZamaSDK`, permit hooks) was researched in an earlier pass via docs.zama.org, not re-verified against an installed copy in this pass — worth a quick `.d.ts` check of `@zama-fhe/react-sdk` alongside `@tokenops/sdk` once the app scaffold exists, since VantaDrop's decrypt UI depends on it directly.
