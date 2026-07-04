# Browser TokenOps + Zama FHE Integration — Research (no implementation)

**Method:** every claim below is traceable to a primary source read during this pass — the installed packages' own `.d.ts`/`.js` files under `node_modules/@tokenops/sdk` and `node_modules/@zama-fhe/sdk` (the pinned `3.0.0`), the proven live-Sepolia spike (`scripts/spike-tokenops-sepolia.ts`), the actual contract source (`contracts/VantaDropRegistry.sol`) and its local Hardhat artifact, or a real command run in this repo (notably a real `npm run build` with throwaway SDK imports, described in §4). Where something could not be verified conclusively it is listed under "Blockers / open questions", not asserted.

Date: 2026-07-04. Builds on `docs/research/tokenops-sdk-notes.md` (Node-side ground truth); everything browser-specific was re-verified fresh.

---

## Summary

**Browser integration is feasible with the installed packages exactly as they are — no new dependencies, no version changes, no Next.js config changes.** The three facts that make this true, all verified this pass:

1. `@zama-fhe/sdk@3.0.0` exports a browser relayer, **`RelayerWeb`**, from its **root** entry point (there is no `/web` subpath — see §2), with an `encrypt()` return shape (`{ handles: Uint8Array[], inputProof: Uint8Array }`) that structurally satisfies `@tokenops/sdk`'s `Encryptor` interface, same as `RelayerNode`. The 3.0.0 pin holds for the browser path too.
2. TokenOps ships a purpose-built browser encryptor helper, **`createSepoliaEncryptorWeb`** (`@tokenops/sdk/fhe`), whose own TSDoc says it exists so "bundlers (Next, Vite, etc.) follow only browser-safe paths".
3. A real `npm run build` with static imports of `@tokenops/sdk/fhe-airdrop`, `@tokenops/sdk/fhe`, `@zama-fhe/sdk`, and `@zama-fhe/sdk/viem` in a client component **succeeded with zero config changes** — Turbopack bundles both packages natively, and static prerendering (server-side module evaluation) did not crash. WASM is not bundled at all: `RelayerWeb` spawns a Blob-URL Web Worker that fetches the FHE engine from `https://cdn.zama.org` at runtime with an SHA-384 integrity check.

No blockers were found. The open items (§ Blockers) are runtime behaviors that can only be proven by the first wired click (injected-wallet write path, relayer latency), not package/bundling questions.

---

## 1. Browser-compatible TokenOps APIs (exact imports/paths)

All paths verified against the installed package's `package.json` `exports` map and the `dist/**/*.d.ts` files.

### Headless clients and free functions

```ts
// @tokenops/sdk/fhe-airdrop  (dist/fhe-airdrop/index.d.ts)
import {
  createConfidentialAirdropFactoryClient,   // factory client (create/fund)
  createConfidentialAirdropClient,          // clone client (preflightClaim / isSignatureValid / getClaimAmount / claim as METHODS)
  encryptUint64,                            // free function
  encryptUint64Batch,                       // free function (one proof, N handles — but ONE userAddress; see §5)
  signClaimAuthorization,                   // free function (EIP-712 admin signature)
  resolveEncryptor,                         // EncryptorSource → Encryptor normalizer
  confidentialAirdropFactoryAbi,
  confidentialAirdropCloneableAbi,
  type Encryptor, type EncryptorSource, type EncryptedInput, type AirdropParams,
} from "@tokenops/sdk/fhe-airdrop";

// @tokenops/sdk/fhe  (dist/fhe/index.d.ts)
import {
  setOperator,                 // ERC-7984 operator authorization (prerequisite for funding)
  erc7984OperatorAbi,          // for the free isOperator read
  createSepoliaEncryptorWeb,   // *** the designed browser encryptor *** (see below)
} from "@tokenops/sdk/fhe";
```

`preflightClaim`, `isSignatureValid`, `getClaimAmount`, and `claim` are **methods on `ConfidentialAirdropClient`**, not free-standing exports — identical to how the spike uses them.

### `createSepoliaEncryptorWeb` — the browser twin of the spike's `RelayerNode` path

From `dist/fhe/sepolia-encryptor-web.d.ts` (quoted, not paraphrased): it is "the browser parity peer of `createSepoliaEncryptor` — same Encryptor contract, no `node:worker_threads` / `node:module` in the import graph, so bundlers (Next, Vite, etc.) follow only browser-safe paths." Signature:

```ts
createSepoliaEncryptorWeb({ publicClient, walletClient, relayerUrl?, chainId?, logger? })
  → Promise<SepoliaEncryptorWeb>   // extends Encryptor; also exposes .instance (the underlying
                                   // RelayerWeb, typed unknown — cast at use site for userDecrypt),
                                   // .chainId, .terminate()
```

This means the app can get a TokenOps-compatible `Encryptor` **without importing `@zama-fhe/sdk` directly** — though it will still import `@zama-fhe/sdk` for the `ZamaSDK` decrypt/permit flow (§2). Either construction route is legitimate; §Recommended architecture picks one.

### React hooks (`@tokenops/sdk/fhe-airdrop/react`) — exist, verified, but **not recommended for the first integration**

`dist/fhe-airdrop/react/index.d.ts` exports 40+ hooks wrapping every public client method: `useCreateAndFundConfidentialAirdrop`, `useFundConfidentialAirdrop`, `useClaim`, `useGetClaimAmount`, `useSignClaimAuthorization`, `useAirdropGasFee`, `useAirdropIsSignatureValid`, `useAirdropIsSignatureClaimed`, etc. Their header says they "compose with wagmi (`usePublicClient`, `useWalletClient`) and TanStack Query — no extra provider needed beyond the standard wagmi `<WagmiProvider>` + `<QueryClientProvider>`" — which this app already has. Hooks are technically usable in this project's setup.

**Recommendation: use direct client objects (the spike's pattern) for the first browser integration, optionally adopting read-only hooks later.** Reasoning:

1. **The proven ground truth is client-object-shaped.** `scripts/spike-tokenops-sepolia.ts` ran end-to-end on live Sepolia with exactly these clients and argument shapes. Translating it 1:1 minimizes new failure surface; hooks add a second abstraction layer whose behavior we have not proven.
2. **The hooks' documented encryptor wiring assumes `@zama-fhe/react-sdk`, which is NOT installed** (verified: `node_modules/@zama-fhe/` contains only `sdk` and `relayer-sdk`). The hook docs' canonical pattern is `const sdk = useZamaSDK()` from `@zama-fhe/react-sdk` + `encryptor: () => sdk.relayer`. The hooks do accept any `EncryptorSource`, so we *could* feed them our own `createSepoliaEncryptorWeb` instance — but at that point the hooks save little, and installing `@zama-fhe/react-sdk` would add a new peer whose compatibility with the load-bearing `@zama-fhe/sdk@3.0.0` pin is unverified (exactly the class of break the pin exists to prevent).
3. **There is no `usePreflightClaim` hook** (verified by grepping the react barrel) — the recipient flow needs `client.preflightClaim()` directly anyway, so a hook-only integration is impossible.
4. Read-only hooks (`useAirdropGasFee`, `useAirdropIsClaimWindowActive`, …) are low-risk sugar over `useQuery` and can be adopted piecemeal after the write path works.

### Generic decrypt hook

`@tokenops/sdk/fhe/react` exports `useDecryptedHandle` (consumer supplies the `UserDecryptor` — no `@zama-fhe/react-sdk` hard dependency). Usable later; the first integration can call `zama.userDecrypt` directly as the spike does.

---

## 2. Zama browser SDK (exact imports/paths, browser flow)

### There is no `/web` subpath — `RelayerWeb` lives at the root

`node_modules/@zama-fhe/sdk/package.json` `exports` (verified): `.`, `./cleartext`, `./query`, `./viem`, `./ethers`, `./node`. The **root** entry (`dist/esm/index.d.ts`) exports:

```ts
import {
  RelayerWeb,          // browser encrypt/decrypt via Web Worker + WASM
  ZamaSDK,             // composes relayer + signer + storage; allow()/userDecrypt()/createToken()
  SepoliaConfig,       // ALSO exported from root (the spike imported it from /node; root works for browser)
  indexedDBStorage,    // persistent credential store (recommended for browser)
  memoryStorage,       // per-page-load store (what the spike used)
  IndexedDBStorage,    // class form, configurable db/store names
} from "@zama-fhe/sdk";

import { ViemSigner } from "@zama-fhe/sdk/viem";
```

**Do not import `@zama-fhe/sdk/node` in browser code** — that subpath is the `RelayerNode` (worker_threads) path used by the spike.

### `RelayerWeb` — construction and Encryptor compatibility (verified from `dist/esm/index.d.ts` + `relayer-sdk.types-*.d.ts`)

```ts
new RelayerWeb({
  transports: { [SepoliaConfig.chainId]: { ...SepoliaConfig, network: rpcUrl } }, // Record<number, Partial<FhevmInstanceConfig>>
  getChainId: async () => sepolia.id,   // called lazily; worker re-inits on chain change
  // optional: security, logger, threads, onStatusChange, fheArtifactStorage, fheArtifactCacheTTL
})
```

- `encrypt(params) → Promise<EncryptResult>` where `EncryptResult = { handles: Uint8Array[]; inputProof: Uint8Array }` — **structurally identical to `@tokenops/sdk`'s `Encryptor` requirement.** The 3.0.0 pin's compatibility guarantee holds for the browser class, verified from the actual type declarations, not assumed from naming symmetry with `RelayerNode`.
- Also exposes `userDecrypt`, `publicDecrypt`, `generateKeypair`, `createEIP712`, `getAclAddress`, `status`, `terminate()`.
- **Lazy worker init:** the class TSDoc states "Every public method calls `#ensureWorker()`" — construction itself does not spin up the worker; first use does.

### How WASM actually loads (verified from the shipped `dist/esm/index.js`, not docs)

The Web Worker is created from an **inline Blob URL** (`new Worker(URL.createObjectURL(new Blob([...])))` — worker source is embedded in the bundle as a string). Inside the worker, the real FHE engine is fetched at runtime from **`https://cdn.zama.org/relayer-sdk-js/0.4.2/relayer-sdk-js.umd.cjs`**, restricted by an allowlist (`ALLOWED_CDN_HOSTS = new Set(["cdn.zama.org"])`, https-only) and an SHA-384 integrity check on by default (`RelayerWebSecurityConfig.integrityCheck`). Consequences:

- **Nothing to copy into `public/`, no worker file paths for the bundler, no WASM in our bundle.**
- The browser demo has a hard runtime dependency on `cdn.zama.org` being reachable (§8).
- **COOP/COEP headers are NOT required** unless the optional `threads` config is set (multithreaded WASM via `SharedArrayBuffer` requires `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` — quoted from `RelayerWebConfig.threads` TSDoc). Default is single-threaded: leave `threads` unset, add no headers.
- FHE public key/params ("several MB", per the `fheArtifactStorage` TSDoc) are cached in IndexedDB (`FheArtifactCache`) with a 24 h default TTL — first-use cold start is real, repeat visits are warm.

### The decrypt/permit flow (same as the spike, browser storage swapped)

```ts
const relayer = new RelayerWeb({ transports: { [SepoliaConfig.chainId]: { ...SepoliaConfig, network: rpcUrl } }, getChainId: async () => sepolia.id });
const signer  = new ViemSigner({ publicClient, walletClient });  // wagmi-obtained clients — see §3
const zama    = new ZamaSDK({ relayer, signer, storage: indexedDBStorage });

await zama.allow([airdropAddress]);                                        // one-time EIP-712 wallet signature (free, off-chain)
const values = await zama.userDecrypt([{ handle, contractAddress: airdropAddress }]); // relayer HTTP, free
const bal    = await zama.createToken(cttt).balanceOf(me);                 // convenience: allow+decrypt wrapped
```

Verified from the `ZamaSDK` class declaration: `allow(contractAddresses: Address[])`, `userDecrypt(handles: DecryptHandle[]) → Record<Handle, ClearValueType>`, `createToken(address)`. `allow()` runs a credentials state machine ("load → validate → extend/re-sign → or create fresh") — with `indexedDBStorage` the signature survives reloads; the spike's `memoryStorage` would re-prompt every page load. **ACL requirement is unchanged from the spike:** `userDecrypt` on the allocation handle only succeeds after the recipient's `getClaimAmount` write tx granted persistent ACL access; otherwise the relayer rejects with `UserDecryptNotAllowedError`.

Note for cost planning: `zama.allow([airdrop, cttt])` in one call covers both the allocation decrypt and the post-claim balance decrypt with a **single** signature prompt.

### SSR safety

Importing the root module is side-effect-free (`sideEffects: false`, and empirically survived Next's static prerender — §4). Construction/use touches `Worker`, `crypto.randomUUID`, IndexedDB — browser-only. Rule: import statically anywhere, **construct and call only in client components after mount/user action**.

---

## 3. Wagmi integration (conversion approach, account-object reasoning)

### What TokenOps wants

`ConfidentialAirdropFactoryClientConfig` / `ConfidentialAirdropClientConfig` take plain viem types: `{ publicClient: PublicClient; walletClient?: WalletClient; ... }` (verified in `dist/fhe-airdrop/factory.d.ts` / `airdrop.d.ts`). wagmi's `usePublicClient()` returns a viem `PublicClient` and `useWalletClient().data` returns a viem `WalletClient` — **no conversion needed, pass them straight in.** Same for `ViemSigner({ publicClient, walletClient })` (`dist/esm/viem/index.d.ts`), which is implemented purely against `WalletClient` methods (`signTypedData`, `writeContract`) — it never touches a private key, so it works identically with a wagmi/injected-wallet client as with the spike's local-key client. (Its optional `ethereum` field only enables `subscribe()` lifecycle events; omitted ⇒ no-op. The `WagmiSigner` its TSDoc mentions ships in `@zama-fhe/react-sdk`, not in this package — not needed.)

### The "unknown account" question, answered for the browser

Every TokenOps write accepts `account?: Account | Address` with the verbatim TSDoc "Override the submitting account. Defaults to `walletClient.account`."

- **Node spike bug (recap):** passing a bare address *string* over an `http()` transport to a public RPC made viem dispatch `eth_sendTransaction`, which keyless public RPCs reject (`unknown account`). Fix was passing the full local `Account` (→ `eth_sendRawTransaction`).
- **Browser is a different signing model, and the "bad" path is the correct one.** wagmi's connected `walletClient` uses a `custom(window.ethereum)` transport, and `walletClient.account` is a viem **json-rpc Account** (`{ address, type: "json-rpc" }` — no signing key). With a json-rpc account, viem intentionally dispatches `eth_sendTransaction` **to the wallet extension**, which holds the key and signs. That is the normal, only-possible browser path; there is no full local `Account` to pass, and none is needed.
- **Concrete rule for all browser TokenOps calls: omit `account` entirely.** It falls back to `walletClient.account` (the wagmi-populated json-rpc account) — exactly mirroring the spike's already-working `setOperator` call, which omits `account`. Passing the connected *address string* explicitly would also resolve to the same json-rpc path in a browser transport, but omitting is cleaner, matches the documented default, and leaves zero room to reintroduce the string-vs-object footgun.

Confidence: high — this follows from viem's documented account-type dispatch plus the SDK's `.d.ts` default, and the same wagmi wallet client already works for this app's connect/switch flows. It is not yet *empirically* proven with a live TokenOps write from an injected wallet (that would be a live transaction, out of scope for this phase) — listed under open questions as a first-click verification item, not a design risk.

### Reactivity requirements

- Rebuild TokenOps clients + the Zama bundle when `walletClient.account.address` or chain changes; `terminate()` the old `RelayerWeb`. (TokenOps' own hook layer memoizes on `(publicClient, walletClient, address)` and passes encryptors lazily for the same reason — "CLAUDE.md Pitfall #3" in their docs.)
- Gate everything on `walletClient !== undefined` (wagmi briefly returns `undefined` during reconnect — TokenOps' `_shared.d.ts` warns about exactly this).

---

## 4. Next.js constraints (client boundaries, dynamic imports, real build test)

### Empirical build test — performed for real, then reverted

Method: created a throwaway client component `components/dev/SdkBundleProbe.tsx` (`"use client"`) with **static** imports of `encryptUint64`, `signClaimAuthorization`, `createConfidentialAirdropFactoryClient`, `createConfidentialAirdropClient` from `@tokenops/sdk/fhe-airdrop`; `createSepoliaEncryptorWeb`, `setOperator` from `@tokenops/sdk/fhe`; `RelayerWeb`, `ZamaSDK`, `SepoliaConfig`, `indexedDBStorage` from `@zama-fhe/sdk`; `ViemSigner` from `@zama-fhe/sdk/viem` — every symbol referenced in JSX so `sideEffects: false` tree-shaking could not drop them, nothing invoked. Rendered it inside `app/providers.tsx` (which wraps every route), so the module graph was both bundled for the client **and evaluated server-side during static prerender**. Ran `npm run build`. Real output:

```
▲ Next.js 16.2.10 (Turbopack)
✓ Compiled successfully in 6.4s
  Finished TypeScript in 11.8s
✓ Generating static pages using 7 workers (7/7) in 737ms
Route (app): / , /_not-found , /create , /drop/demo , /recipient/demo , /verification — all ○ (Static)
```

**Result: clean success. No `transpilePackages`, no webpack/turbopack config, no dynamic-import workaround was needed, and server-side module evaluation of all four entry points did not crash.** Probe and its import were then fully reverted (`git status` clean at that point; verified). A post-revert `npm run build` re-run is included in the final health checks.

### Rules derived

- **`"use client"` required** on every file that constructs or calls the SDKs (they end up wagmi-adjacent anyway): the planned `lib/tokenops/browser.ts` consumers, wizard execute step, recipient portal, registry write hooks. Pure-data modules (`lib/registry/abi.ts`) need no directive.
- **Static imports are fine; dynamic `import()` is an optional optimization, not a correctness requirement.** Rationale for still considering lazy `import()` inside the execute/claim click handlers: keeps the SDK JS out of the initial bundle for the many pages that never touch FHE. Correctness-wise, the build proved static imports safe even under SSR evaluation.
- **What must never run on the server:** `new RelayerWeb(...)` usage (Web Worker), `indexedDBStorage` access, `ZamaSDK.allow/userDecrypt`, any wallet call. All of these are naturally behind user interactions in client components; add a `typeof window` guard in the bundle factory as a tripwire.
- **`next.config.ts` needs no changes.** `typescript.tsconfigPath: "tsconfig.next.json"` stays as is; `tsconfig.next.json` already includes `lib/**/*.ts`, so the new `lib/` files are type-checked by the app build (confirmed by this build run, which type-checked the probe).
- **WASM/assets/headers:** nothing to bundle or serve (§2 — runtime CDN fetch, Blob worker). No COOP/COEP unless `threads` is enabled (don't). If a CSP is ever introduced, it must allow `worker-src blob:`, script/fetch from `https://cdn.zama.org`, and `connect-src` to `https://relayer.testnet.zama.org` plus the RPC host.

---

## 5. Issuer flow plan (`/create` execute step — future phase)

Direct translation of the spike's proven sequence to wallet signing. N = validated recipient count from `lib/csv.ts`. **Wallet prompts: N + 3 worst case, N + 2 when the factory is already an operator on the token.**

| # | Step | Call | Cost / prompt |
|---|---|---|---|
| 0 | Gates (already built) | wallet connected, Sepolia, recipients valid | none |
| 1 | Build FHE bundle | `RelayerWeb` + `ViemSigner` + `ZamaSDK` (or `createSepoliaEncryptorWeb`) | none — but cold-start WASM/params download; show a "preparing encryption" state |
| 2 | Operator check | `publicClient.readContract({ abi: erc7984OperatorAbi, functionName: "isOperator", args: [issuer, factory] })` | free read |
| 3 | Authorize factory (only if needed) | `setOperator({ publicClient, walletClient, token, spender: factory })` — **omit `account`** | **1 tx prompt** |
| 4 | Create + fund | `factoryClient.createAndFundConfidentialAirdrop({ params: { token, startTimestamp, endTimestamp, canExtendClaimWindow, admin: issuerAddress }, userSalt: keccak256(stringToHex(\`vantadrop:${crypto.randomUUID()}\`)), amount: totalRaw, encryptor })` — **omit `account`** (spike passed the local Account; browser omits) | **1 tx prompt**; SDK waits for receipt + parses `ConfidentialAirdropCreated` → `{ hash, airdrop }` |
| 5 | Per recipient i (loop) | `encryptUint64({ encryptor, contractAddress: airdrop, userAddress: recipient_i, value: amount_i })` — proof is bound to the recipient, so **`encryptUint64Batch` cannot merge recipients** (one `userAddress` per proof); this is N sequential relayer round-trips, seconds each — show progress | free (relayer HTTP), no prompt |
| 6 | Per recipient i (same loop) | `signClaimAuthorization({ walletClient, airdropAddress: airdrop, recipient: recipient_i, encryptedAmountHandle })` | **N EIP-712 signature prompts** (off-chain, free) — this is real UX; for large N consider warning the issuer explicitly ("you will sign N times") |
| 7 | Deliver payloads | surface each `{ encryptedInput, signature }` pair per recipient (copyable link/JSON). **Never write these to the registry** — privacy rule in `VantaDropRegistry.sol` | none |
| 8 | Register metadata | `walletClient.writeContract({ address: REGISTRY_ADDRESS, abi: vantaDropRegistryAbi, functionName: "registerDistribution", args: [token, airdrop, title, useCase, BigInt(N), metadataURI] })` → id from return/`DistributionRegistered` event | **1 tx prompt** |
| 9 | Done | link to `/drop/[id]` distribution room | none |

Example UX copy: "For 5 recipients you will confirm 8 wallet prompts: 1 operator authorization, 1 create+fund transaction, 5 free signatures, 1 registry transaction."

Failure handling: every step is resumable in principle (the spike's resume mode proves the pattern); persist `{ airdrop, userSalt, step }` in component state (or localStorage) so a rejected prompt doesn't strand a funded clone.

## 6. Recipient flow plan (`/recipient/demo` → future `/drop/[id]` claim view)

| # | Step | Call | Cost / prompt |
|---|---|---|---|
| 1 | Connect + Sepolia guard | existing components | none |
| 2 | Load payload | recipient pastes/opens `{ encryptedInput, signature }` + airdrop address | none |
| 3 | Preflight | `airdropClient.preflightClaim({ caller: me, encryptedAmountHandle: encryptedInput.handle })` — checks window/paused/already-claimed/ETH-for-fee; **does NOT check signature validity or pool funding** (documented SDK limitation) | free read |
| 4 | Signature check | `airdropClient.isSignatureValid({ encryptedAmountHandle, signature, caller: me })` — `false` = claimed/inactive/not-admin; **throws** `InvalidSignatureError` on malformed bytes | free read |
| 5 | Fee display | `airdropClient.gasFee()` — prefetch so the claim button shows the exact `msg.value` | free read |
| 6 | Decrypt-preview grant | `airdropClient.getClaimAmount({ encryptedInput, signature })` — **omit `account`** → `{ handle, hash }`; grants persistent ACL decrypt access **without consuming the claim** | **1 tx prompt (write, costs gas)** |
| 7 | Decrypt permit | `zama.allow([airdrop, cttt])` (both contracts at once = one prompt covers step 10 too) | **1 EIP-712 signature prompt** (free; cached in IndexedDB thereafter) |
| 8 | Decrypt | `zama.userDecrypt([{ handle, contractAddress: airdrop }])` → plaintext allocation | free (relayer HTTP) |
| 9 | Claim | `airdropClient.claim({ encryptedInput, signature })` — **omit `account`**; auto-attaches `gasFee()` as `msg.value`; consumes the single-use signature | **1 tx prompt (write, gas + gasFee ETH)** |
| 10 | Post-claim verify | `zama.createToken(cttt).balanceOf(me)` → decrypted confidential balance (the spike's proven post-claim pattern — does not depend on re-calling `getClaimAmount`) | free if step 7 covered `cttt`; otherwise one more signature prompt |

Free vs paid (matches `tokenops-sdk-notes.md`): steps 3–5, 8, 10 free; steps 6 and 9 are the only paid transactions (2 tx prompts total); step 7 is a free signature prompt. Claim ≈ 310k gas / ~1.1M HCU (documented figure).

## 7. Registry frontend flow

- **ABI: solved now.** The Hardhat artifact `artifacts/contracts/VantaDropRegistry.sol/VantaDropRegistry.json` **is present locally** (verified `Test-Path` → `True`), and its `abi` array was copied — and cross-checked function-by-function against `contracts/VantaDropRegistry.sol` (5 functions, 2 events, 6 custom errors; `registerDistribution(address,address,string,string,uint256,string) returns (uint256)`, `updateStatus(uint256,uint8)`, `getDistribution(uint256) returns (Distribution)`, `getSenderDistributions(address) returns (uint256[])`, `totalDistributions() returns (uint256)`) — into the new **`lib/registry/abi.ts`** (`vantaDropRegistryAbi ... as const`). Since `artifacts/` is gitignored build output, hand-copying into committed source is the right home; the contract is deployed and immutable so the ABI is frozen.
- **Reads** (no wallet needed): wagmi `useReadContract({ address: REGISTRY_ADDRESS, abi: vantaDropRegistryAbi, functionName: "getDistribution" | "getSenderDistributions" | "totalDistributions", args })`, or `publicClient.readContract` inside flow code. `getDistribution` reverts `DistributionNotFound` for unknown ids — surface as "not found", not an error toast.
- **Writes**: wagmi `useWriteContract` (or `walletClient.writeContract`) for `registerDistribution` (issuer step 8) and `updateStatus` (only the original sender may call; optional feature). Plain public transactions — no FHE, no TokenOps SDK involvement, `as const` ABI gives full viem typing.
- Route plan: `/drop/[id]` reads `getDistribution(BigInt(id))` client-side (all pages are static; the id comes from the URL at runtime).

## 8. Risks

1. **`cdn.zama.org` runtime dependency.** The FHE engine (`relayer-sdk-js@0.4.2` UMD + WASM) loads from Zama's CDN inside the worker, hard-allowlisted and integrity-checked. If the CDN is unreachable (network filter, outage), all encrypt/decrypt fails at runtime while the rest of the app works. No mitigation exists inside `3.0.0` (host allowlist is baked in) — surface a clear error state.
2. **Cold-start latency.** First encrypt/decrypt per browser: worker boot + CDN fetch + several-MB FHE public params (then IndexedDB-cached, 24 h TTL). Expect seconds; per-recipient encryption is one relayer ZK-proof round trip each (N sequential calls for N recipients). UI must show progress, not freeze.
3. **Public relayer availability/rate limits.** `https://relayer.testnet.zama.org/v2` is a shared testnet service; limits are undocumented. A public demo hammered by many users may see `RelayerUnreachableError` / throttling. Acceptable for a demo; no SLA.
4. **Public RPC rate limits.** wagmi currently uses `http()` (viem's default public Sepolia RPC) and `SepoliaConfig.network` defaults to `ethereum-sepolia-rpc.publicnode.com`. Fine for development and a small demo; for a live public demo, recommend a dedicated provider key (Alchemy/Infura) supplied via a `NEXT_PUBLIC_SEPOLIA_RPC_URL` constant and passed to **both** the wagmi transport and the `RelayerWeb` transports `network` override, so app reads and relayer-adjacent reads don't share an anonymous pool.
5. **The existing demo claim is consumed.** Clone `0x8cFE4cab5A3ca843B94B1A4765D6DA780547ee14`'s only signature was claimed by `0x459d...165A` (single-use; a re-claim reverts `AlreadyClaimedError`). Any live browser **claim** demo therefore needs a fresh clone + fresh authorization first: cheapest path today is re-running `npm run spike` (it generates a fresh `userSalt` per run and stops being consumed only once someone claims) — but modified/stopped before its own claim step, or simply used end-to-end to mint a *new* consumed pair while the browser demo does the pre-claim stages against it. Alternatively, once the issuer flow is wired, create the fresh distribution in the browser itself. Read-only/decrypt-style demos against the existing clone remain possible without any new setup: `isSignatureClaimed` → true, window reads, and the recipient's post-claim `confidentialBalanceOf` decrypt (proven to work post-claim).
6. **Gas/token budget for a live demo run** (from the documented spike figures): claim ≈ 310k gas; `getClaimAmount` is a comparable FHE write; plus `setOperator`, `createAndFundConfidentialAirdrop`, and `registerDistribution`. A full issuer+recipient run is ~5 transactions totaling very roughly 1–1.5M gas ≈ **0.002–0.005 Sepolia ETH at 1–3 gwei** (Sepolia gas is usually ~1 gwei; budget 0.05 ETH per wallet for comfortable headroom), **plus** the clone's `gasFee()` in ETH attached to `claim` (default fee value unverified — read `factory.defaultGasFee()` live; the spike's recipient succeeded on a "few cents" balance, so it is small). CTTT is free via the faucet (`mintConfidential`), so token cost is zero.
7. **Account-path verification debt.** §3's omit-`account` conclusion is type- and docs-derived; the first wired write from an injected wallet should be treated as the empirical confirmation gate (do it with a burner on a fresh clone).
8. **Bundle size** is a minor risk: the SDK JS added to the client bundle is modest (`@zama-fhe/sdk` ESM index ≈ 64 KB pre-gzip incl. inlined worker source; TokenOps subpath modules are tiny; the heavy FHE engine never enters the bundle). Lazy `import()` in click handlers is a nice-to-have.
9. **Version-pin discipline.** Everything above is verified against `@zama-fhe/sdk@3.0.0` exactly. `3.2.0+` renames the encrypt result shape AND the permit API (`allow` → `permits.grantPermit`) — any dependency change invalidates §2 wholesale. Keep the pin; re-verify if `@tokenops/sdk` is ever upgraded.

## Recommended integration architecture (next phase, concrete files)

| File | Status | Contents |
|---|---|---|
| `lib/registry/abi.ts` | **created this phase** | `vantaDropRegistryAbi as const` (real ABI from artifact, cross-checked against source) — inert data |
| `lib/tokenops/browser-plan.ts` | **created this phase** | type-only planning stub for the bundle factory; superseded by `browser.ts` next phase (delete or fold in) |
| `lib/tokenops/browser.ts` | next phase | `"use client"`-consumed factory `getBrowserFheBundle({ publicClient, walletClient, rpcUrl? })` → `{ zama, relayer, encryptor, terminate }`; memoized per (address, chainId); `typeof window` tripwire; `indexedDBStorage`; `terminate()` on wallet switch |
| `lib/tokenops/issuer.ts` | next phase | issuer step machine (§5): operator check/auth → create+fund → per-recipient encrypt+sign → payload assembly; returns per-step status for the wizard UI; **omits `account` everywhere** |
| `lib/tokenops/recipient.ts` | next phase | recipient step machine (§6): preflight → isSignatureValid → gasFee → getClaimAmount → allow → userDecrypt → claim → balance verify |
| `lib/registry/hooks.ts` | next phase | thin wagmi wrappers: `useDistribution(id)`, `useSenderDistributions(addr)`, `useTotalDistributions()`, `useRegisterDistribution()` over `vantaDropRegistryAbi` |
| `components/wizard/ExecuteStep.tsx` (or extend `CreateWizard.tsx`) | next phase | replaces the honest "not yet wired" panel; drives `lib/tokenops/issuer.ts`; shows the N+3 prompt count up front |
| `components/RecipientPortal.tsx` | next phase (modify) | wires pending stages to `lib/tokenops/recipient.ts` |
| `app/drop/[id]/page.tsx` | next phase | dynamic distribution room reading the registry client-side |

Not needed: changes to `next.config.ts`, `transpilePackages`, custom headers, `public/` assets, new dependencies (`@zama-fhe/react-sdk` explicitly not recommended for the first pass).

## What NOT to do yet (constraints of this phase, for the next reader)

- **No live TokenOps browser execution.** `createAndFundConfidentialAirdrop`, `getClaimAmount`, and `claim` must not be called from the frontend yet; no live transaction button anywhere. This document + the two inert stubs (`lib/registry/abi.ts`, `lib/tokenops/browser-plan.ts`) are the entire output of this phase.
- **Do not modify** `scripts/spike-tokenops-sepolia.ts` (canonical proven reference), `contracts/VantaDropRegistry.sol` (deployed at `0x2a3dd1dff5c121b1fc24c7412e519c075bc5f8a1`), `test/VantaDropRegistry.ts`, `hardhat.config.ts`, `scripts/deployRegistry.ts`, or the root `tsconfig.json`. Do not redeploy anything.
- **Keep `@zama-fhe/sdk` pinned to exactly `3.0.0`** — the pin is load-bearing (Encryptor shape + `allow` API; see §8.9 and `tokenops-sdk-notes.md`).
- Never read/modify `.env.local`; never put private keys anywhere client-side; the registry must never store recipient lists, amounts, signatures, or handles.
- Keep `npx hardhat test` at 14 passing and root `npx tsc --noEmit` clean.

## Blockers / open questions

1. **Injected-wallet write path not yet empirically proven.** The omit-`account` conclusion (§3) is derived from viem account-type dispatch semantics + the SDK's `.d.ts` defaults; no live browser transaction was executed this phase (by design). Treat the first wired `setOperator` click with a burner wallet as the confirmation gate.
2. **`factory.defaultGasFee()` current value unread** — needs one free read before the claim UI can show the exact `msg.value`; the recipient flow already plans to fetch `airdropClient.gasFee()` live.
3. **Relayer rate limits / CDN SLA unknown** — undocumented for the public testnet relayer and `cdn.zama.org`; only observable under real load.
4. **`getClaimAmount` after `claim`** — still untested (inherited open item from `tokenops-sdk-notes.md`); the planned flows sidestep it by using `confidentialBalanceOf` for post-claim verification, which the spike proved.
5. **TokenOps React hooks' runtime behavior unverified** — their `.d.ts` surface was read in full, but no hook was mounted. Irrelevant while the recommendation is direct client usage; re-verify before ever adopting the write-path hooks.
6. **`createSepoliaEncryptorWeb` internals** — its TSDoc guarantees browser-safe imports and the build test bundling `@tokenops/sdk/fhe` (which re-exports it) succeeded, but its runtime behavior (worker boot, relayer handshake) is untested until the implementation phase, same as `RelayerWeb` itself.

---

## Service layer implementation checkpoint

Date: 2026-07-04 (same day as the research above; implementation phase). This section records what the "next phase" rows in the table above actually became.

### Files created this phase

| File | Contents |
|---|---|
| `lib/tokenops/browser.ts` | Real browser client construction: `assertBrowser()` SSR tripwire, `isBrowserRuntime()`, `createBrowserEncryptor()` (wraps `createSepoliaEncryptorWeb`), `createBrowserRelayer()` (`RelayerWeb` + `SepoliaConfig`, optional `NEXT_PUBLIC_SEPOLIA_RPC_URL` override), and `getBrowserFheBundle()` → `{ zama, relayer, encryptor, terminate }` memoized per (address, chainId) with stale-worker `terminate()` on wallet switch. `indexedDBStorage`, not `memoryStorage`. The `encryptor: Encryptor = relayer` line is a deliberate typed assignment so the compiler re-proves the 3.0.0 Encryptor compatibility on every build. |
| `lib/tokenops/issuer.ts` | `ensureAirdropFactoryOperator` (isOperator pre-check → `setOperator`), `encryptRecipientAllocations` (per-recipient `encryptUint64` loop, recipient-bound proofs, progress callback), `createAndFundAirdrop` (`createAndFundConfidentialAirdrop`, fresh `userSalt` per run, resume support), `signRecipientClaims` (`signClaimAuthorization` loop). |
| `lib/tokenops/recipient.ts` | `createAirdropClient`, `checkRecipientEligibility` (`preflightClaim` + `isSignatureValid` + `gasFee` prefetch), `grantDecryptAccess` (`getClaimAmount` — paid ACL-grant write BEFORE claim, does not consume it), `decryptAllocationHandle` (`zama.allow` + `zama.userDecrypt`), `claimAllocation` (`claim`), `verifyPostClaimBalance` (`createToken().balanceOf` decrypt). |
| `lib/registry/client.ts` | viem wrappers over `vantaDropRegistryAbi`: `readDistribution`, `readSenderDistributions`, `readTotalDistributions`, `writeRegisterDistribution` (waits receipt, parses `DistributionRegistered` → id), `writeUpdateStatus`; `DISTRIBUTION_STATUS` frontend convention for the opaque uint8. |
| `lib/registry/hooks.ts` | Read-only wagmi hooks: `useDistribution(id)`, `useSenderDistributions(addr)`, `useTotalDistributions()`. Write hooks deliberately not provided — writes stay as unwired callables in `client.ts`. |
| `components/IntegrationStatus.tsx` | Honest six-line status panel on `/verification` + the one piece of live wiring this phase allows: a real read-only `totalDistributions()` call from the browser via `useTotalDistributions()`. |

`lib/tokenops/browser-plan.ts` (the type-only planning stub from the research phase) was **deleted** — its interfaces (`BrowserFheBundle`, `BrowserFheBundleInputs`) and all of its implementation notes now live, implemented, in `lib/tokenops/browser.ts`. Keeping both would have left two overlapping sources of truth for the same shape.

### Resulting architecture

```
components/wallet/hooks.ts (useSepoliaWallet — readiness signal, unchanged)
        │ gates (future wiring)
        ▼
lib/tokenops/browser.ts ── getBrowserFheBundle(publicClient, walletClient)
        │  { zama, relayer, encryptor }          (from wagmi usePublicClient / useWalletClient)
        ├──▶ lib/tokenops/issuer.ts    — consumes `encryptor` + viem clients; future CreateWizard execute step
        ├──▶ lib/tokenops/recipient.ts — consumes `zama` + viem clients; future RecipientPortal live stages
        └──  (encryptor route B: createBrowserEncryptor, standalone, kept for parity with TokenOps' own helper)

lib/registry/abi.ts (inert, unchanged)
        ├──▶ lib/registry/client.ts — plain viem read/write callables (writes unwired)
        └──▶ lib/registry/hooks.ts  — read-only wagmi hooks
                    └──▶ components/IntegrationStatus.tsx (live totalDistributions read — wired, read-only)
```

The wizard (`components/wizard/CreateWizard.tsx`) and recipient portal (`components/RecipientPortal.tsx`) were intentionally **not** modified except that nothing changed at all — their gating and "not yet wired" labeling is exactly as before. `components/IntegrationStatus.tsx` imports one function from each service module and renders `typeof f === "function"` — nothing is invoked, but every `npm run build` now re-proves empirically that the full SDK module graph bundles and survives static prerender (this replaces the research phase's throwaway `SdkBundleProbe`, as a permanent, honest fixture instead of a reverted experiment).

Live-state fact checked this phase: `totalDistributions()` on the deployed registry reads **0** (verified with a real Sepolia read) — the proven demo airdrop was never registered in `VantaDropRegistry`; it predates the registry frontend. The UI says so rather than fabricating a registry entry for the demo.

### Why UI transaction buttons are still disabled

Phase constraint, restated for the next reader: **no live browser transaction wiring was permitted this phase.** The service functions may contain real SDK calls (they do), but none is reachable from any render path or onClick handler — `/create`'s execute button still shows the honest "not yet wired" notice, `/recipient/demo` still walks through spike-proven facts only. Two reasons beyond process: (1) the omit-`account` browser write path is still empirically unproven (§3 / open question 1) and must be confirmed with a burner wallet on a fresh clone before any user-facing button relies on it; (2) the existing demo clone's only claim signature is consumed, so a live recipient demo needs a fresh distribution first (§8.5).

### What the next phase should wire first (recommendation)

Wire the cheapest, most isolated write first, behind a dev-only manual trigger (not a product button):

1. **`ensureAirdropFactoryOperator` + one `encryptRecipientAllocations` call** from a connected burner wallet on `/verification` (dev-gated). This empirically confirms, in one cheap step, the two riskiest unknowns: the omit-`account` injected-wallet write path (open question 1) and the `RelayerWeb` cold-start/CDN/encrypt round trip (open question 6) — without deploying anything or consuming anything.
2. Then the **full issuer flow** in the wizard execute step (`getBrowserFheBundle` → operator → `createAndFundAirdrop` → encrypt loop → `signRecipientClaims` → `writeRegisterDistribution`), which also mints the fresh clone + fresh authorization that…
3. …the **recipient flow** (`checkRecipientEligibility` → `grantDecryptAccess` → `decryptAllocationHandle` → `claimAllocation` → `verifyPostClaimBalance`) needs, since the existing demo clone's signature is already consumed.

Registry writes ride along with step 2 (`writeRegisterDistribution` is the issuer flow's final step); `writeUpdateStatus` can stay unwired until a distribution-management view exists.
