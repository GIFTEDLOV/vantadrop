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

---

## Live browser diagnostic plan/checkpoint

Date: 2026-07-04. This section records the concrete implementation of the recommendation directly above ("wire the cheapest, most isolated write first, behind a dev-only manual trigger").

### The route

**`app/dev/tokenops-diagnostic/page.tsx`** — a hidden, `"use client"` route at `/dev/tokenops-diagnostic`. Deliberately not linked from the landing page, the header nav in `app/layout.tsx`, or any production surface; you have to know the URL. It carries a prominent burner-wallet warning banner and a safety checkbox ("I am using a burner wallet") that hard-disables both action buttons (real `disabled` attribute + a second refusal check inside each click handler) until acknowledged.

### What it tests (exactly two things)

1. **Operator approval** (Section 2 of the page):
   - "Check TokenOps operator approval" — a free `publicClient.readContract` of `isOperator(connectedWallet, TOKENOPS_AIRDROP_FACTORY)` on the CTTT token via `erc7984OperatorAbi` (the same read `ensureAirdropFactoryOperator` performs internally). Three result states: Already approved / Approval needed / Error (real message shown).
   - "Approve TokenOps operator" — calls the real `ensureAirdropFactoryOperator({ publicClient, walletClient, token: CTTT_TOKEN_ADDRESS })` from `lib/tokenops/issuer.ts` (which omits `account` on the `setOperator` write — the browser write-path rule from §3). The button is only enabled after a check has run AND returned "Approval needed"; the click handler additionally refuses in code if the last known state was anything else, so a redundant transaction cannot be sent even if the disabled attribute were bypassed. On success it shows the real tx hash as an Etherscan link (`setOperator` waits for the receipt by default, so a returned hash is a mined tx) and then re-runs the free `isOperator` read to display on-chain truth rather than assuming.
2. **Browser encryption round-trip** (Section 3):
   - "Run browser encryption test" — constructs the real bundle via `getBrowserFheBundle({ publicClient, walletClient })` from `lib/tokenops/browser.ts` (RelayerWeb worker, cdn.zama.org WASM fetch, testnet relayer) and runs one real `encryptUint64({ encryptor, contractAddress: CTTT_TOKEN_ADDRESS, userAddress: connectedWallet, value: 1_000_000n })`. Since no airdrop clone exists in this diagnostic, the proof is bound to (CTTT token, connected wallet) — a legitimate binding for a pure pipeline test whose ciphertext is never sent anywhere. On success it shows the opaque handle (`bytes32` hex — a ciphertext id, safe to display) and the input-proof byte length (raw proof bytes never dumped). The test value is a hardcoded public constant, not a real allocation.

Errors are surfaced as real error messages (first line) in every state machine — there is no code path that renders success without the underlying SDK call resolving.

### What it explicitly does NOT test

- No airdrop creation or funding — `createAndFundConfidentialAirdrop` / `createAndFundAirdrop` is not imported or called by the page.
- No claim, no `getClaimAmount`, no recipient decrypt (`allow`/`userDecrypt` never invoked).
- No registry writes (no `registerDistribution`/`updateStatus` anywhere in the UI).
- No claim-authorization signing.
- Nothing auto-runs on page load or state change — every call is behind an explicit click.

### Why this before the full wizard

It isolates the two riskiest unknowns (open questions 1 and 6 above) into two cheap, reversible, individually-triggered actions:

- The **omit-`account` injected-wallet write path** is proven (or falsified) by a single `setOperator` transaction — the cheapest possible TokenOps write, harmless to re-run, and revocable via `revokeOperator` if desired.
- **`RelayerWeb`'s real relayer round-trip** (worker boot, CDN WASM integrity fetch, ZK-proof generation, testnet relayer HTTP) is proven by one free encryption with no on-chain side effects at all.

Wiring the full `/create` wizard first would commit a multi-step, partially-irreversible flow (create+fund locks tokens into a clone) on top of two primitives neither of which had ever been exercised from an injected wallet. If either primitive fails, the diagnostic fails in isolation with a real error message instead of stranding a half-created distribution.

### What "success" means, concretely, per button

- **Check**: returns a clear "Already approved" or "Approval needed" state from a real `isOperator` read (an error state with the real RPC message counts as a diagnostic result, not success).
- **Approve**: either the code-level no-op refusal ("already approved — no transaction sent"), or a real, confirmed `setOperator` tx hash rendered as an Etherscan link, followed by the re-read flipping the check state to "Already approved". This is the empirical confirmation gate for open question 1 (the omit-`account` browser write path).
- **Encryption test**: a real `bytes32` handle plus a nonzero input-proof byte length, with no error — proving worker boot, CDN fetch, and the relayer proof round-trip end-to-end in the browser. This closes open question 6 for `RelayerWeb` (the `createSepoliaEncryptorWeb` variant shares the same underlying pipeline).

### Status honesty

As of this checkpoint the page **exists and compiles/builds/renders (verified via `npm run build` and a dev-server HTTP check of the route)** but **no button has been clicked against live Sepolia** — that step deliberately requires a human with a funded burner wallet. `components/IntegrationStatus.tsx` on `/verification` states the same: the two diagnostic lines read "Added" (exists, wired for manual testing), not "Proven".

### Next phase (after a human confirms both diagnostics)

Once both buttons have been manually run against a funded burner wallet and both succeed (confirmed operator tx hash + real encryption handle), open questions 1 and 6 are closed empirically, and the next phase is wiring the real multi-step issuer flow into `/create` (§5 sequence: bundle → operator → `createAndFundAirdrop` → per-recipient encrypt loop → `signRecipientClaims` → `writeRegisterDistribution`), informed by whatever the diagnostic taught (actual wallet-prompt UX, relayer cold-start latency, any error shapes seen). If either diagnostic fails, fix that primitive first — the wizard wiring stays blocked until both pass.

## Live browser diagnostic result

Date: 2026-07-04. Both diagnostics above were manually run by a human, in a real browser, against a funded burner wallet on live Sepolia. This section records that result — it is the empirical confirmation the plan above was waiting on, closing open questions 1 and 6.

**Route tested:** `http://localhost:3000/dev/tokenops-diagnostic`

**Wallet:** connected, on Sepolia (chain id `11155111`) — the Sepolia network guard correctly confirmed the required chain before either diagnostic was run.

**Operator approval diagnostic — passed:**
- Check result: **Already approved** (the factory was already an authorized ERC-7984 operator on the connected wallet's CTTT balance from prior sessions — a real, correct read, not the "needs approval" path).
- Approval transaction state: **Confirmed** — tx `0x368d42…2585` shown in the UI as an Etherscan-linked hash.
- This proves the omit-`account` injected-wallet write path works: `ensureAirdropFactoryOperator`'s `setOperator` call, which deliberately omits `account` so it falls back to `walletClient.account`, correctly signed and broadcast through the connected browser wallet rather than hitting the "unknown account" bug that broke the original Node spike's first attempt.

**Browser encryption diagnostic — passed:**
- Status: **Encryption success**.
- An encrypted handle (`bytes32` ciphertext id) was returned.
- Input proof size: **100 bytes**.
- The proof was correctly bound to (CTTT token address, connected wallet address) — the ACL binding rule was respected.
- No airdrop was created, no claim was consumed, no registry write happened — confirmed by the diagnostic's own design (it has no code path capable of any of these) and consistent with what was observed.

**What this proves, concretely:**
- **`RelayerWeb`/browser encryption is proven live** — the full pipeline (Web Worker boot, `cdn.zama.org` WASM fetch, ZK-proof generation, testnet relayer HTTP round-trip) completed successfully from a real browser tab, not just from the Node-side spike.
- **Injected wallet + Sepolia guard are proven live** — wallet connect, chain detection, and a real signed transaction via an injected browser wallet (not a raw private-key `Account`) all worked correctly.

**What remains unproven / explicitly still not wired:**
- **Full issuer flow is still not wired** — `createAndFundAirdrop`, the per-recipient encrypt loop, and `signRecipientClaims` have not been exercised from the browser; this diagnostic never creates or funds a distribution.
- **Recipient decrypt/claim is still not wired** — `checkRecipientEligibility`, `grantDecryptAccess`, `decryptAllocationHandle`, `claimAllocation`, and `verifyPostClaimBalance` remain unwired service functions; nothing recipient-side has been tested live.
- **Registry writes are still not wired** — `registerDistribution`/`updateStatus` were not called; the registry frontend remains read-only in practice (only `useTotalDistributions()` is live).

This diagnostic result closes out the two riskiest unknowns identified earlier in this document. The next phase (wiring the real multi-step issuer flow into `/create`) is now informed by a real, positive result rather than a docs/types-only prediction.

---

## Issuer-side browser create flow implementation

Date: 2026-07-04. This section records the wiring of the full multi-step issuer flow into `/create` — the "next phase" the diagnostic result above unblocked. **Status honesty up front: this flow is WIRED (real SDK calls behind a real button), but has NOT been run live against Sepolia by anyone yet.** The implementing session verified it only via `npm run build`, `npm run lint`, `npx hardhat test` (14 passing), `npx tsc --noEmit`, and dev-server HTTP/content checks — deliberately never connecting a wallet or clicking the execute button, because a run spends real gas and creates a real distribution. First live run is reserved for the project owner with a funded burner wallet.

### What was wired, file by file

| File | Change |
|---|---|
| `components/wizard/ExecuteStep.tsx` | **New.** The live execution panel that replaces the previous phase's static "not yet wired" panel in the wizard's Execute step. Contains the gating checklist, burner-wallet checkbox, real-value summary (token/factory/registry addresses as Etherscan links, recipient count, total), warning banner, execution state machine + visible timeline, failure panel, partial-success handling, result screen, and the copy-package / copy-instructions actions. |
| `components/wizard/CreateWizard.tsx` | Step 4 now renders `<ExecuteStep state parsed selectedType/>`; the old static spike-recap panel (and its dead `executeNotice` state) was removed. Step 0 gained a required **public distribution title** input (needed because the registry write stores a title); step-0 `canProceed` now also requires a non-empty title. |
| `components/wizard/types.ts` | `WizardState` gained `title: string`, documented as PUBLIC (on-chain at execution). |
| `lib/distribution.ts` | **New.** `DistributionPackage` type + `saveDistributionPackage` / `loadDistributionPackages` localStorage helpers (key `vantadrop:distributions`, upsert by local `distributionId`). Carries the privacy framing in its header comment. |
| `lib/registry/client.ts` | Comment-only: `writeRegisterDistribution` is no longer described as unwired (it is the flow's final step); `writeUpdateStatus` remains honestly labeled NOT WIRED. No logic changes. |
| `lib/tokenops/issuer.ts`, `lib/tokenops/browser.ts` | Comment-only: stale "NOT WIRED" headers replaced with accurate wiring status. No logic changes. |
| `components/IntegrationStatus.tsx` | "Full issuer execution" and "Registry frontend writes" rows now read **"Wired — awaiting live confirmation"** (deliberately NOT "Proven live" — same wired-vs-proven distinction the diagnostics went through). Recipient decrypt/claim stays "Not wired yet". |
| `components/RecipientPortal.tsx` | Wording-only: badges/copy now say recipient decrypt/claim wiring is the next phase. Zero functional change, zero live claim button — confirmed by grep (no issuer/recipient service function or SDK write is imported there). |

### The exact sequence (as implemented in `ExecuteStep.handleExecute`)

1. Gates: wallet connected (`useSepoliaWallet`), chain id 11155111, recipients valid (the wizard's existing `lib/csv.ts` signal), at most 3 recipients (hard cap, see below), title+type set, burner checkbox checked.
2. `checking-operator` — free `isOperator` read (same read the diagnostic proved).
3. `approving-operator` — `ensureAirdropFactoryOperator(...)`, **only if step 2 said approval is needed**; the timeline step only appears in that case. (1 tx prompt.)
4. `creating-and-funding` — `getBrowserFheBundle(...)` then `createAndFundAirdrop(...)` with the spike-proven window (opens now, +7 days, `canExtendClaimWindow: false`). (1 tx prompt; funding total encrypted in-flight.)
5. `encrypting-allocations` — `encryptRecipientAllocations(...)` per recipient, with live `onProgress` in the timeline. Free, no prompts. **Runs after create-and-fund by necessity**: each proof is bound to (clone address, recipient address) — the clone must exist first (section 5's proven ordering).
6. `signing-claims` — `signRecipientClaims(...)`, N EIP-712 prompts, live progress.
7. Package saved to localStorage **before** the registry write, so a registry failure can never lose claim data.
8. `registering-metadata` — `writeRegisterDistribution(...)` with **only** `{ token, tokenOpsAirdrop, title, useCase, recipientCount, metadataURI: "" }`. Its own try/catch (see partial failure).
9. `completed` — result screen with tx hashes (Etherscan links), clone address, registry id, copy actions.

Every TokenOps call site omits `account` (the proven browser rule; inline FOOTGUN comments restate it), and the registry write passes the full wagmi account object internally — never a bare address string.

### Wallet prompts, counted precisely from the implementation

For N recipients: **N + 2 prompts when the factory is already an operator, N + 3 when approval is needed.** Concretely for the 3-recipient cap: **5–6 prompts** — (0 or 1) operator-approval tx + 1 create-and-fund tx + 3 claim-signature EIP-712 prompts + 1 registry tx. Encryption adds zero prompts (relayer HTTP only). The UI states this count on the summary card before execution.

### Safety cap

Live execution is hard-capped at **3 recipients** this phase (`LIVE_RECIPIENT_CAP` in `ExecuteStep.tsx`). More than 3 valid recipients disables the button with an explicit warning; the list is **never silently truncated** — it still displays in full everywhere.

### The localStorage distribution package

Shape (see `lib/distribution.ts`): local `distributionId` (uuid), title, useCase, network/chainId, sender, token, factory, clone (`tokenOpsAirdrop`), registry address, optional `registryDistributionId`, recipientCount, per-recipient `{ wallet, note, amount, claimAuthorization, encryptedHandleSummary }`, `txHashes { operatorApproval?, createAndFund, registry? }`, createdAt.

Privacy framing: this package contains plaintext recipients, amounts, notes, and claim signatures — acceptable **only because it lives in the sender's own browser localStorage**, the same trust domain as the wizard's CSV textarea (local-only, sender-side working state). The UI labels it exactly that way ("Saved to your browser's local storage — this is not on-chain and not shared with anyone"). `encryptedHandleSummary` is a shortened opaque ciphertext id + proof size, not a full claim payload — the real recipient delivery format is a next-phase decision.

**Registry privacy, restated:** `VantaDropRegistry` receives only token, clone address, title, use case, recipient COUNT, and an empty metadataURI. No recipient addresses, amounts, notes, signatures, or handles — the ABI has no parameter shaped to accept them and the call site passes none (see the PRIVACY comment at the `writeRegisterDistribution` call in `ExecuteStep.tsx`; hardhat test 14 re-proves the contract surface).

### Partial-failure handling

- **Registry write fails after steps 2–7 succeeded:** the distribution is presented as CREATED (real clone address + create tx), with a distinct amber "Registry metadata registration failed" panel showing the real error, and the copy-package / copy-instructions actions still available — the registry is optional metadata, never the source of truth (`docs/research/registry-decision.md`). The package was already saved before the registry attempt.
- **Failure after create-and-fund but before signing completes:** phase = failed, but the failure panel explicitly surfaces the already-created clone address and create tx, and warns that this phase has **no resume** — a retry creates and funds a NEW clone. (The `userSalt` resume hook exists in `createAndFundAirdrop` but is deliberately not wired yet.)
- Errors are translated via the SDK's own `isTokenOpsSdkError` + stable codes (`TOKENOPS_WALLET_REJECTED`, `TOKENOPS_USER_REJECTED`, `TOKENOPS_INSUFFICIENT_GAS_FUNDS`, `TOKENOPS_INSUFFICIENT_BALANCE`, `TOKENOPS_WALLET_CHAIN_MISMATCH`, `TOKENOPS_RELAYER_UNREACHABLE`, `TOKENOPS_ENCRYPTION_FAILED`, `TOKENOPS_SIGNING_FAILED`, `TOKENOPS_NETWORK_ERROR`, `TOKENOPS_UNKNOWN_WRITE_FAILURE`), with a viem `UserRejectedRequestError` branch for the plain-viem registry write.

### What remains unwired

- **Recipient decrypt/claim** — `lib/tokenops/recipient.ts` is still called from nowhere; `/recipient/demo` remains the proven-spike walkthrough with no live claim button (its copy now says "next phase" explicitly).
- **Per-distribution room page** (`/drop/[id]`) — the result screen links to `/drop/demo` clearly labeled as a demo example.
- **`writeUpdateStatus`** and any resume-from-salt flow.

### How to test manually (project owner, burner wallet)

1. Fund a burner wallet with Sepolia ETH (at least ~0.05 for headroom) and confidential CTTT (faucet / `npm run spike` mint step).
2. `npm run dev`, open `/create`, connect the burner wallet, confirm the network guard shows Sepolia.
3. Step 0: pick a type and enter a PUBLIC title. Step 1: keep CTTT. Step 2: enter 1–3 valid recipients (over 3 keeps the button disabled). Steps 3–4: continue to Execute.
4. Check "I am using a burner wallet…", review the summary (addresses, total, expected prompt count), click **Create confidential distribution**.
5. Observe the timeline: operator check → (approval tx if needed) → create+fund tx → per-recipient encryption progress → N signature prompts → registry tx. Expect 5–6 wallet prompts for 3 recipients; the first encryption of the session can take a while (CDN WASM + FHE params cold start).
6. On success: verify the clone address and tx hashes on Etherscan, check `/verification`'s registry-read row now counts 1, and inspect `localStorage["vantadrop:distributions"]` for the package.

### Known risks / open items for the first live run

1. **Never run live end-to-end** — the create+fund, encrypt-loop, sign-loop, and registry write have not been exercised from a browser as one sequence. The individual primitives were proven (operator write, encryption) but composition bugs are exactly what the first burner run is for.
2. **Real cost per run**: setOperator (if needed) + createAndFundConfidentialAirdrop (FHE write, comparable to the ~310k-gas class) + registerDistribution — plus the funded tokens locked into the clone. Budget per section 8.6.
3. **No resume**: a mid-flow failure after create-and-fund strands a funded clone; a retry funds a fresh clone. Acceptable for 3-recipient test runs; a resume flow should exist before the cap is raised.
4. **Relayer/CDN latency and availability** (sections 8.1–8.3) now sit in a user-facing path: the create button's first run per browser includes the multi-MB FHE-params cold start inside the "creating-and-funding" step.
5. **Prompt fatigue is real but bounded** (5–6 prompts at the cap); the UI states the expected count before execution.
6. The hidden diagnostic page still says "the real issuer/recipient flows are not wired yet" in its safety-controls copy — that page is frozen by phase constraint ("must remain exactly as it is"), so the stale sentence is documented here instead of edited there.

---

## Sender preparation panel

Date: 2026-07-04. This section records the addition of `components/wizard/SenderPrepPanel.tsx`, a readiness panel mounted at the top of `/create` (above the stepper, visible on every wizard step). It helps a sender with a burner wallet verify prerequisites *before* attempting the live Execute step. **It does not run any part of the create flow** — `ExecuteStep.tsx`'s execution behavior is untouched by this phase.

### What the panel checks

| Check | Mechanism | Cost |
|---|---|---|
| Wallet connected + address | `useSepoliaWallet()` (existing hook) | free, passive |
| Current vs required network (Sepolia 11155111) | same hook + `lib/constants.ts` | free, passive |
| Sepolia ETH balance (gas) | wagmi `useBalance` (free JSON-RPC read, auto once connected on Sepolia; loading/value/error states, `formatEther`) | free, no prompt |
| CTTT + factory addresses | `lib/constants.ts` values as Etherscan links | — |
| CTTT confidential-balance readiness | `createTestnetFaucetClient({ publicClient }).confidentialBalanceOf(address)` behind an explicit button — reads the opaque encrypted handle only (see below) | free read, no prompt |
| Mint test CTTT | `createTestnetFaucetClient({ publicClient, walletClient }).mintConfidential({ amount: 10_000_000n })` (10 CTTT, the spike's own convention) behind an explicit button + burner checkbox | 1 real Sepolia tx |
| Operator approval | shared `useOperatorApproval()` hook (`lib/tokenops/useOperatorApproval.ts`): free `isOperator` read, then `ensureAirdropFactoryOperator` only after a check returns "needed" + burner checkbox | free read / 1 real tx |

Nothing runs automatically on mount except the wagmi ETH-balance read (a free RPC read, no wallet prompt — same class as the passive chain detection `WalletStatusBar` already performs). Every transaction sits behind its own button, gated by the panel's own burner-wallet acknowledgement checkbox (separate from ExecuteStep's — every live-tx surface carries its own).

### Browser CTTT faucet API — CONFIRMED against the installed package

Verified directly against the installed `@tokenops/sdk@1.1.1`, not the earlier research note:

- **Export path:** the package's `exports` map contains `"./testnet-faucet"` pointing at `dist/testnet-faucet/index.js` / `.d.ts`, which re-exports `createTestnetFaucetClient`, `TestnetFaucetClient`, and `TestnetFaucetClientConfig` from `./faucet.js`.
- **Constructor** (`dist/testnet-faucet/faucet.d.ts`): `createTestnetFaucetClient(config: TestnetFaucetClientConfig)` where the config is `{ publicClient: PublicClient; walletClient?: WalletClient | undefined; address?; chainId?; telemetry? }`. `walletClient` is documented "Optional for read-only usage" — which is why the readiness check constructs a read-only client that can never prompt.
- **Mint** (`faucet.d.ts` + `types.d.ts`): `mintConfidential(args: MintConfidentialArgs): Promise<MintConfidentialResult>` with `MintConfidentialArgs = { to?: Address; amount: bigint; account?: Account | Address }` and `MintConfidentialResult = { hash, to, amount, underlyingMinted, handle }` decoded from the `ConfidentialMint` event. The TSDoc states the amount is "PUBLIC — passed as plaintext calldata, emitted in the ConfidentialMint event" — no encryptor, no relayer, no `@zama-fhe` involvement in the mint path.
- **Balance read:** `confidentialBalanceOf(account?: Address): Promise<Hex>` — returns the `euint64` ciphertext handle; the TSDoc says "The SDK is the producer side only; it does not call `userDecrypt`" and "A never-credited account reads back the zero handle."
- **Browser safety, checked at the module-graph level:** `dist/testnet-faucet/index.js` pulls in chunks `QE7ZONJ2, JFLEEXKP, M7V2EDPB, BE2AIZ3K, Q2GP5UDC, KWFFIJYX, IVE3QEGD`; the union of their external imports is exactly `viem` and `viem/chains`. No `node:` built-ins, no `@zama-fhe/sdk`, no relayer, no Worker. The exports map also ships `workerd`/`edge-light` conditions pointing at the same ESM files.
- **Prior live evidence:** `scripts/spike-tokenops-sepolia.ts` already ran `createTestnetFaucetClient({ publicClient, walletClient }).mintConfidential({ amount: 10_000_000n })` successfully against live Sepolia (mint tx `0x2e4b4d06a232770a5db5de15094ae76ff9b0df4f3f48542ee915dc403153ad69`), from viem clients with no Node-only construction.

**Conclusion: the mint button shipped LIVE** (real SDK call, real tx, success rendered only when the promise resolves), not as the disabled fallback. The `to`/`account` args are deliberately omitted so the SDK falls back to `walletClient.account` (the proven omit-`account` browser rule).

Also noted but deliberately NOT used: `@tokenops/sdk/testnet-faucet/react` ships `useMintConfidential`, `useConfidentialBalance`, etc. The headless client was chosen instead because it matches the codebase's existing pattern (explicit state machines around `lib/tokenops` service calls, as in the diagnostic page and ExecuteStep), keeps the mint behind a hard hand-written guard, and avoids introducing a second calling convention for the same SDK.

### CTTT balance: readable, NOT decryptable here — by design

`confidentialBalanceOf` returns an encrypted `bytes32` handle, not a number. Turning that handle into plaintext requires the Zama `allow()` (EIP-712 permit) + `userDecrypt()` relayer round-trip — the *identical* primitive that will power recipient allocation decryption, which is the explicitly-unwired next phase. Building it here "just for the sender's own balance" would be scope creep into that phase, so the panel deliberately does not.

What the panel *can* honestly surface without decrypting: the zero-handle vs non-zero-handle distinction (per the `.d.ts` TSDoc quoted above). "Zero handle" = never credited, mint needed; any other handle = the account has confidential CTTT state (though the amount stays unknown). The UI wording is: *"CTTT balance is confidential. Balance verification may require the Zama decrypt flow. Mint test tokens if needed."*

### Shared operator logic — extraction decision

The check/approve pattern from `/dev/tokenops-diagnostic` was extracted into `lib/tokenops/useOperatorApproval.ts` (same states, same hard guards: approve refuses unless the last check returned "needed" and the burner box is ticked; post-tx it re-runs the free read; an `alreadyOperator` race is reported as an honest no-op). `SenderPrepPanel` consumes the hook. The diagnostic page keeps its original inline copy **unchanged**: it was proven live in a prior phase whose constraint froze it, and refactoring proven diagnostic code for zero user benefit is a worse trade than one documented structural duplication. If the diagnostic ever needs to change anyway, migrate it to the hook then.

### What remains pending

- **Recipient decrypt/claim** — still completely unwired (unchanged from the prior phase). `lib/tokenops/recipient.ts` is called from nowhere; no `allow`/`userDecrypt` runs anywhere in the app.
- The panel's mint and approve buttons are **wired, not proven live from this panel**: the underlying calls are individually proven (spike mint tx above; diagnostic operator tx `0x368d42…2585`), but no human has clicked *these* buttons yet. Verification this phase was build/lint/hardhat-test/tsc + dev-server content checks only.
- Full plaintext sender-balance display — blocked on the recipient-decrypt phase's Zama permit/decrypt wiring, and intentionally so.

### How to prepare a wallet before attempting the live /create flow

1. Create/choose a **burner** wallet (browser extension). Never use a wallet holding real funds.
2. Fund it with Sepolia ETH from any standard faucet (~0.05 ETH gives headroom for the operator tx + create-and-fund + registry tx).
3. Open `/create`, connect the burner, confirm the panel shows Sepolia (id 11155111) and a non-zero ETH balance.
4. Get CTTT: tick the burner checkbox and click **Mint test CTTT** (10 CTTT per click; mint more times if your planned total exceeds that), or alternatively run the Node spike script's mint step (`npm run spike` with `.env.local` configured). Re-run the free readiness check — it should flip from "zero handle" to "handle exists".
5. Click **Check operator approval**; if it returns "Approval needed", click **Approve TokenOps operator** (1 tx). This can also be done on `/dev/tokenops-diagnostic`, or left to the Execute step itself (which checks again and approves only if needed) — doing it here just front-loads one prompt.
6. Proceed through the wizard; the Execute step re-verifies everything with its own gates before sending anything.

## Live browser issuer create flow result

Date: 2026-07-05. The full `/create` wizard's live issuer execution flow (`ExecuteStep.tsx`) was manually run by a human, in a real browser, against a funded burner wallet on live Sepolia — not a simulation, not a dry run. This closes out the issuer-side create flow as **proven live**, the same bar previously reached by the two standalone diagnostics (operator approval, browser encryption).

**Route tested:** `/create`, full wizard (sender preparation panel → recipient entry → privacy review → execute).

**Wallet:** connected, on Sepolia (chain id `11155111`). Sender preparation (ETH balance check, CTTT readiness, operator approval) was completed via the `SenderPrepPanel` before proceeding to execute.

**Result — every step in the execution timeline succeeded:**

| Step | Result |
|---|---|
| Operator approval | Checked/ensured (no separate tx hash captured in this note — see "Registry distribution ID" note below for what was recoverable) |
| Create and fund airdrop | **Succeeded.** Tx `0x0774d49cf4c076c4e3f0d4b74fa56df85a5361d3b1037f87617d3d33800c2735` |
| Airdrop clone deployed | **`0x62a4cBdD9DE1ccfc396605874929a44ea9C14c27`** |
| Encrypt allocations + sign claims | Succeeded (implied by the registry write succeeding — the wizard only reaches the registry step after these complete) |
| Register public metadata | **Succeeded.** Tx `0x6b79ee307a916bf991bd7f73c44ed560afb42bc070a3d1353a3db1a2a0f047be` |

**Registry distribution ID: recovered safely.** The registry tx hash is a public Sepolia transaction — its receipt was read read-only (no wallet, no secrets, just `getTransactionReceipt` + `parseEventLogs` against the already-public `vantaDropRegistryAbi`) and decoded the `DistributionRegistered` event directly:

```json
{
  "distributionId": "2",
  "sender": "0x4f7a14c8cd83caa18Fafc35aA91a8483Cc95E3E5",
  "token": "0x258F9D60dc023870e4E3109c894D834D5377361a",
  "tokenOpsAirdrop": "0x62a4cBdD9DE1ccfc396605874929a44ea9C14c27",
  "title": "VantaDrop Browser Test",
  "useCase": "Community rewards",
  "recipientCount": "1"
}
```

`tokenOpsAirdrop` in the decoded event matches the reported airdrop clone address exactly, cross-confirming both pieces of evidence independently. **Registry distribution ID: 2.**

**What this proves:**
- **The issuer-side browser create flow is proven live**, end-to-end: sender preparation → operator approval → encrypt-and-sign → create-and-fund → register, all from a real browser, a real injected wallet, and real Sepolia state — not just its individual primitives in isolation (which were proven in earlier checkpoints).
- The registry now holds one real, live-created public entry (distribution #2), a first for this project — `totalDistributions()` should now read `1` (or higher, if anything else was registered since) rather than the `0` seen throughout earlier checkpoints.

**What remains unproven / explicitly still not wired:**
- **Recipient decrypt/claim is still not wired.** No recipient-side action (`checkRecipientEligibility`, `grantDecryptAccess`, `decryptAllocationHandle`, `claimAllocation`, `verifyPostClaimBalance`) has been exercised from a browser for this new distribution (or any other) — the recipient tied to distribution #2 has not claimed anything yet, live or otherwise. Full end-to-end (issuer creates → recipient claims) browser flow is **not** complete; only the issuer half is proven.
- The local distribution package (containing the plaintext recipient list, amount, and signed claim authorization for this run) lives only in the browser's own `localStorage` on the machine that ran the wizard — it is not committed, not shared, and not recoverable from the public chain data alone (by design; that's the whole point of the privacy model). This document intentionally does not reproduce that package's contents.

**Next phase:** recipient decrypt/claim wiring — the same discipline as the issuer phase (a diagnostic-style proof of the individual `getClaimAmount`/decrypt/`claim` primitives from a browser first, if not already covered by earlier standalone diagnostics, then composing them into a real recipient-facing flow) — informed by this now-proven issuer side and the real, live distribution (#2) it produced to test against.

---

## Recipient browser diagnostic implementation

Date: 2026-07-05. This section records the creation of the hidden, dev-only recipient claim diagnostic — the "diagnostic-style proof of the individual `getClaimAmount`/decrypt/`claim` primitives from a browser" that the previous section named as the next phase. It is implementation + wiring only: **no button on it has been clicked yet**; nothing recipient-side has been executed live as of this writing (verification this phase was build/lint/hardhat-test/tsc + dev-server HTTP/content checks only, per the same discipline as earlier checkpoints).

### The route

`app/dev/recipient-claim-diagnostic/page.tsx` → **`/dev/recipient-claim-diagnostic`**. Deliberately not linked from the landing page, the header nav, or any production surface — same hidden-route convention as `/dev/tokenops-diagnostic`, whose warning-banner/gating/timeline patterns it mirrors.

### What it tests

The five-step recipient sequence from `lib/tokenops/recipient.ts` (until now called from nowhere), each behind its own explicit manual button with per-step pending/success/error state and Etherscan tx links:

1. **Check eligibility** — `checkRecipientEligibility` (free: `preflightClaim` + `isSignatureValid` + `gasFee` prefetch; blockers and the exact claim fee are displayed).
2. **Grant decrypt access** — `grantDecryptAccess` (`getClaimAmount` under the hood: a **paid** tx that grants persistent ACL decrypt access via `FHE.allow` and does **not** consume the claim; the granted bytes32 handle from the receipt is displayed — an opaque ciphertext id, safe to show).
3. **Decrypt allocation** — `decryptAllocationHandle` (Zama `allow()` permit + `userDecrypt`; the decrypted value is compared against the package's plaintext `amount` with a real computed comparison — `toRawUnits(amount, 6)` vs the decrypted bigint, asserted only when the package token is CTTT).
4. **Claim allocation** — `claimAllocation` (the real, **single-use, irreversible** claim; visually distinct heavy red styling; the handler additionally refuses to send when the latest eligibility check reported the signature invalid or preflight blocked — a doomed send would waste gas without consuming anything, but there is no reason to allow it).
5. **Verify post-claim balance** — `verifyPostClaimBalance` (`confidentialBalanceOf` + decrypt via the Zama token convenience).

The intended first live target is the real distribution the issuer flow produced: **registry distribution #2, airdrop clone `0x62a4cBdD9DE1ccfc396605874929a44ea9C14c27`, 1 recipient, CTTT, Sepolia** (previous section). The claim authorization for it is single-use — one shot, real consequence, not a demo.

### Input model: a pasted local package + the full encrypted claim input

- The page takes the sender's **distribution package JSON pasted into a textarea**, validated against the exact `DistributionPackage` shape from `lib/distribution.ts` (network `"Sepolia"`, chainId `11155111`, address-shaped `tokenOpsAirdrop`/`token`, non-empty `recipients[]` with address wallets and hex `claimAuthorization`s). The pasted material lives **only in React component state** — never localStorage, never any server, never the registry, never the console (the page contains zero `console.*` calls, by design — rather than maintain a "safe subset" log it logs nothing), and it disappears on refresh.
- **Recipient binding:** once a wallet is connected, the page matches the connected address against `recipients[].wallet` case-insensitively. No match → a clear "Connected wallet is not the recipient for this package." error and **all five action buttons stay disabled** (real `disabled` attributes plus in-handler refusals). The matched recipient's claim signature is surfaced only as a truncated summary (`shortHex`), never rendered in full.
- **The honest gap this phase had to confront:** the issuer-phase package format deliberately stores only a truncated `encryptedHandleSummary` per recipient ("the real recipient delivery format is a next-phase decision", above) — but every recipient-side SDK call requires the FULL `{ handle, inputProof }` pair the admin signed (the EIP-712 signature commits to the exact bytes32 handle, and the proof is required calldata for `getClaimAmount`/`claim` — `ClaimArgs` TSDoc). The diagnostic therefore accepts the full encrypted input either as an optional `encryptedInput` field on the matched recipient inside the pasted package (a tolerated, forward-compatible superset — the base shape is still exactly `lib/distribution.ts`'s) or via a second paste field, and **cross-checks it against the package's `encryptedHandleSummary`** (handle prefix + suffix + proof byte length — a real computed comparison). A mismatch hard-disables everything; an unrecognized summary format downgrades the check to an explicitly-surfaced "skipped", never a silent pass.
- Practical consequence for distribution #2: the wizard's `ExecuteStep` held the full per-recipient `{ encryptedInput, signature }` payloads only in memory during the run and persisted only the summary. If the full handle+proof for the recipient was not captured at run time, **that claim cannot be exercised by anyone** (it is not recoverable from chain data — by design) and a fresh distribution must be created to test against once the delivery format exists. The diagnostic states its requirement plainly instead of pretending the package alone suffices.

### Safety model

- Required checkbox (exact wording): *"I understand this claim can only be consumed once."* All five buttons require ALL of: wallet connected, Sepolia selected (chain id 11155111, with the existing `WalletStatusBar`/`NetworkGuard` switch affordance), package parsed successfully, connected wallet matches a package recipient, full encrypted input resolved + cross-checked, and the checkbox checked — enforced both as real `disabled` attributes and as in-handler refusals (the `/dev/tokenops-diagnostic` belt-and-braces pattern).
- Sequential gating (clarity over rigidity, documented in the file header): grant (2) requires a successful eligibility check (1); decrypt (3) requires grant (2) — a hard data dependency on the granted handle; **claim (4) requires eligibility (1) but deliberately not decrypt (3)** — the decrypt preview is optional and a relayer outage must not block an otherwise-valid claim; verify (5) requires claim (4).
- Warning banner (exact wording): *"Developer diagnostic only. Use the exact recipient burner wallet from the distribution package. This may consume the claim once."*
- A six-entry status timeline (package loaded, eligibility checked, decrypt access granted, allocation decrypted, claim submitted, balance verified) renders real outcomes in the same visual style as `ExecuteStep`'s execution timeline. Changing the pasted package resets all downstream states and timeline entries — stale results about a different package are never left standing.

### What this phase did NOT touch

- `components/RecipientPortal.tsx` / `/recipient/demo` remain unwired — no live claim button, no functional change; the only edit is a header-comment sentence noting the diagnostic's existence. `/verification`'s "Recipient decrypt/claim: Not wired yet" line is also unchanged — it remains accurate for the *public* recipient flow (same standard the issuer side used: a hidden diagnostic is not the wired product flow).
- No protected file changed: contracts, tests, hardhat config, deploy/spike scripts, the issuer create-flow files, and `/dev/tokenops-diagnostic` are all untouched. `@zama-fhe/sdk` stays pinned at exactly `3.0.0`.

### What remains before a final public recipient UI

1. **A real claim-payload delivery format.** The single biggest blocker: recipients need the full `{ encryptedInput: { handle, inputProof }, signature }` per recipient delivered out-of-band. The issuer flow currently persists only a truncated summary, so either `DistributionPackage` grows a full (optional) `encryptedInput` per recipient (sender-side localStorage is already the accepted trust domain for the signature and plaintext amount, so this adds no new exposure class), or a separate per-recipient "claim ticket" export is produced at create time. Until then, manual paste is the only path — acceptable for a diagnostic, unacceptable for real recipients.
2. **A human must click through this diagnostic** with the real recipient burner wallet before any of it counts as proven — same bar as every other live checkpoint in this document. The composition risks are real: this is the first browser use of `zama.allow()`/`userDecrypt`/`createToken().balanceOf()` (the issuer phase only proved the encrypt direction), the first `getClaimAmount`/`claim` writes from an injected wallet (the Node spike proved them with a local key), and the first live consumer of the `EligibilityResult`/`EncryptedViewResult` plumbing.
3. **Wiring into a recipient-facing page** (`/recipient/demo`'s live version or a `/drop/[id]` claim view): read public context from the registry/clone, load the recipient's claim ticket from wherever the delivery format puts it, and run the same five steps with product-grade UX (probably collapsing grant+decrypt into one "reveal my allocation" action and keeping claim separate and heavy).
4. Smaller items: decimals handling for non-CTTT tokens (the diagnostic only asserts the amount comparison for CTTT's 6 decimals), decrypt-permit UX copy (the first `allow()` adds a surprise EIP-712 prompt), and deciding whether the post-claim balance check should also compare before/after (requires a pre-claim balance read the current flow deliberately omits to keep step 5's meaning unambiguous).

## Distribution package encrypted input fix

Date: 2026-07-05. A bug was found (not by running anything live — by reading code while preparing to test the recipient diagnostic against registry distribution #2) and fixed.

**The problem:** the local distribution package saved by the issuer's `/create` execute flow (`lib/distribution.ts`, written by `components/wizard/ExecuteStep.tsx`) stored only `recipients[].encryptedHandleSummary` — a truncated, human-scannable descriptor (shortened handle + proof byte count) — and never the actual `{ handle, inputProof }` pair the admin's EIP-712 signature commits to. Every recipient-side SDK call (`preflightClaim`, `isSignatureValid`, `getClaimAmount`, `claim`) requires that full pair as real calldata; a summary string cannot drive any of them. **Registry distribution #2's already-saved package only has the summary** — it predates this fix and its claim is not exercisable from that package alone (see below).

**Root cause:** `lib/tokenops/issuer.ts`'s `signRecipientClaims` already returns the full data — its `ClaimPayload` type extends `EncryptedAllocation`, which carries `encryptedInput: EncryptedInput` (`{ handle, inputProof }`), alongside the `signature`. The bug was entirely in `ExecuteStep.tsx`'s package-assembly step: it read `payload.encryptedInput.handle`/`.inputProof` only to build the summary string, then discarded the object itself instead of also storing it. No SDK function, argument shape, or on-chain behavior was wrong — this was a local data-plumbing omission.

**The fix:**
- `lib/distribution.ts`: `DistributionPackageRecipient` now has a required `encryptedInput: { handle: Hex; inputProof: Hex }` field — the actual claim material, same privacy tier as `claimAuthorization` (local-browser only, never on-chain, never logged). `encryptedHandleSummary` is kept, now explicitly documented as a display/cross-check convenience, never a substitute.
- `components/wizard/ExecuteStep.tsx`: the recipient-assembly step now sets `encryptedInput: payload.encryptedInput` directly from `signRecipientClaims`'s own return value — no new SDK calls, no new encryption, just no longer throwing away data that was already computed.
- The "Copy distribution package JSON" UI now shows an explicit warning: *"This package contains claim authorization and encrypted input data required by recipients. Save it locally and do not publish it."*
- `app/dev/recipient-claim-diagnostic/page.tsx`'s existing `resolveEncryptedInput` logic already preferred `recipients[].encryptedInput` on the pasted package over its manual paste fallback (it was written anticipating this exact fix) — no functional change was needed there, only wording: the success state now reads **"Full encrypted input found in package."** when the package supplies it, and the surrounding copy now correctly describes the manual paste box as a fallback for packages created *before* this fix, not the normal case.

**Registry is unaffected — still never stores recipient data, amounts, signatures, handles, or proofs.** This entire fix is about what the *sender's own browser localStorage* records for later delivery to a recipient; `VantaDropRegistry.registerDistribution` (called separately, unchanged) still receives only `token`, `tokenOpsAirdrop`, `title`, `useCase`, `recipientCount`, and an empty `metadataURI` — nothing from this fix touches that call or its arguments.

**Consequence for distribution #2:** its saved package (created before this fix existed) only has `encryptedHandleSummary`, not `encryptedInput`. The recipient diagnostic's manual-paste fallback can still exercise it *if* the full `{ handle, inputProof }` was captured separately at creation time (e.g. copied from the browser's dev tools / network inspector during the original run) — otherwise that specific claim is not recoverable from any package, browser storage, or on-chain data, by the same privacy design that keeps allocation data off-chain in the first place. **A fresh distribution (created after this fix, via the now-corrected `/create` flow) is the reliable path to a fully testable recipient diagnostic run** — its package will carry the full encrypted input automatically, with no manual paste step required.
