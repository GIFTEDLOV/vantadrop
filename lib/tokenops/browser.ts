/**
 * Browser-side TokenOps + Zama FHE client construction.
 *
 * This is the real implementation of the plan researched in
 * `docs/research/browser-tokenops-integration.md` (which supersedes the old
 * type-only `lib/tokenops/browser-plan.ts`, now deleted — its interfaces live
 * here). Everything in this module is *construction only*: nothing here sends
 * a transaction, encrypts a value, or signs anything. The functions exist so
 * a future phase can wire them behind real UI actions.
 *
 * SSR safety (verified empirically via `npm run build` — see the research
 * doc §4): *importing* this module is side-effect-free and safe during
 * Next.js static prerendering. *Constructing* is not — `RelayerWeb` owns a
 * Web Worker and `indexedDBStorage` touches IndexedDB, both browser-only.
 * Every construction function therefore starts with `assertBrowser()`, a
 * real tripwire that throws before any browser-only API is touched.
 *
 * NOT WIRED: no function in this file is called from any page render path or
 * click handler in the current phase (verified in the phase's honesty pass).
 */

import type { PublicClient, WalletClient } from "viem";
import {
  RelayerWeb,
  ZamaSDK,
  SepoliaConfig,
  indexedDBStorage,
} from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import {
  createSepoliaEncryptorWeb,
  type SepoliaEncryptorWeb,
} from "@tokenops/sdk/fhe";
import type { Encryptor } from "@tokenops/sdk/fhe-airdrop";
import { SEPOLIA_CHAIN_ID } from "../constants";

/**
 * Optional dedicated Sepolia RPC override (public data only — safe to ship
 * client-side). When unset, `SepoliaConfig.network`'s default public RPC
 * (`ethereum-sepolia-rpc.publicnode.com`) is used, matching the proven spike.
 */
const RPC_URL_OVERRIDE = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;

/**
 * Hard client-side guard. `RelayerWeb` spawns a Web Worker and the credential
 * store is IndexedDB — neither exists during Next.js server-side rendering /
 * static generation. Importing this module on the server is fine (verified
 * by a real `npm run build`); constructing anything is not. Fail loudly and
 * specifically instead of letting a `Worker is not defined` surface later.
 */
export function assertBrowser(what: string): void {
  if (typeof window === "undefined") {
    throw new Error(
      `${what} is browser-only (Web Worker + IndexedDB) and was called during ` +
        `server-side rendering. Construct FHE clients only inside a client ` +
        `component, after mount or behind a user action.`,
    );
  }
}

/** True when running in a real browser context. Never throws. */
export function isBrowserRuntime(): boolean {
  return typeof window !== "undefined";
}

/**
 * Construct TokenOps' own browser encryptor (`createSepoliaEncryptorWeb`) —
 * the browser twin of the Node spike's `RelayerNode`-backed encryptor.
 *
 * Parameter shape verified against the installed
 * `dist/fhe/sepolia-encryptor-web.d.ts`: `{ publicClient, walletClient,
 * relayerUrl?, chainId?, logger? }`, where both clients are plain viem types —
 * wagmi's `usePublicClient()` / `useWalletClient().data` return exactly these,
 * no conversion needed.
 *
 * This is the standalone-encryptor route. `getBrowserFheBundle` below is the
 * preferred route when the recipient decrypt flow (`allow`/`userDecrypt`) is
 * also needed, because it shares one `RelayerWeb` between encryption and
 * decryption instead of booting two Web Workers.
 */
export async function createBrowserEncryptor(args: {
  /** From wagmi `usePublicClient()`. */
  publicClient: PublicClient;
  /** From wagmi `useWalletClient().data` — gate on it being defined. */
  walletClient: WalletClient;
  /** Rare override; defaults to Zama's public Sepolia relayer. */
  relayerUrl?: string;
}): Promise<SepoliaEncryptorWeb> {
  assertBrowser("createBrowserEncryptor");
  return createSepoliaEncryptorWeb({
    publicClient: args.publicClient,
    walletClient: args.walletClient,
    relayerUrl: args.relayerUrl,
    chainId: SEPOLIA_CHAIN_ID,
  });
}

/**
 * Construct a bare `RelayerWeb` for Sepolia. Construction is cheap — the
 * class TSDoc documents lazy init ("Every public method calls
 * `#ensureWorker()`"), so the Web Worker + CDN WASM fetch only happen on
 * first use, not here.
 *
 * Config shape verified against the installed `RelayerWebConfig`:
 * `transports: Record<number, Partial<FhevmInstanceConfig>>` +
 * `getChainId: () => Promise<number>` — the exact browser mirror of the
 * spike's `RelayerNode` construction.
 */
export function createBrowserRelayer(args?: { rpcUrl?: string }): RelayerWeb {
  assertBrowser("createBrowserRelayer");
  const rpcUrl = args?.rpcUrl ?? RPC_URL_OVERRIDE;
  return new RelayerWeb({
    transports: {
      [SepoliaConfig.chainId]: {
        ...SepoliaConfig,
        ...(rpcUrl ? { network: rpcUrl } : {}),
      },
    },
    // Sepolia-only app (enforced by lib/wagmi.ts). The relayer re-inits its
    // worker if this ever changes, but this app never switches chains.
    getChainId: async () => SEPOLIA_CHAIN_ID,
  });
}

/**
 * The one browser-side FHE bundle the app constructs per connected wallet —
 * the browser equivalent of the spike's `buildZamaSdk`, with `RelayerWeb`
 * instead of `RelayerNode` and `indexedDBStorage` instead of `memoryStorage`
 * (so the recipient's decrypt permit survives page reloads instead of
 * re-prompting an EIP-712 signature every visit).
 */
export interface BrowserFheBundle {
  /** Zama SDK bound to the connected wallet — `allow()` + `userDecrypt()` live here. */
  zama: ZamaSDK;
  /** The underlying browser relayer (same object as `zama.relayer`, concretely typed). */
  relayer: RelayerWeb;
  /**
   * Encryptor to pass to `createConfidentialAirdropFactoryClient` /
   * `encryptUint64`. Structurally this IS the relayer (verified: 3.0.0's
   * `RelayerWeb.encrypt` returns `{ handles: Uint8Array[], inputProof:
   * Uint8Array }`, exactly TokenOps' `Encryptor` contract — the load-bearing
   * reason `@zama-fhe/sdk` is pinned to exactly 3.0.0). Kept as its own field
   * so call sites depend on the TokenOps-facing interface, not Zama internals.
   */
  encryptor: Encryptor;
  /** Tear down the Web Worker. Called automatically on wallet switch by the memo below. */
  terminate: () => void;
}

/** Inputs for {@link getBrowserFheBundle} — both clients come straight from wagmi hooks. */
export interface BrowserFheBundleInputs {
  /** From wagmi `usePublicClient()`. */
  publicClient: PublicClient;
  /** From wagmi `useWalletClient().data` — gate on it being defined (wagmi briefly returns undefined during reconnect). */
  walletClient: WalletClient;
  /** Sepolia RPC override for the relayer's own reads; defaults to NEXT_PUBLIC_SEPOLIA_RPC_URL, then SepoliaConfig's public RPC. */
  rpcUrl?: string;
}

/** Memo of the single active bundle, keyed by (account address, chain id). */
let activeBundle: { key: string; bundle: BrowserFheBundle } | undefined;

function bundleKey(walletClient: WalletClient): string {
  // Permits/credentials are signer-specific (exactly like the spike's
  // per-wallet buildZamaSdk), so a wallet-account switch must produce a
  // fresh bundle and terminate the old worker.
  return `${walletClient.account?.address ?? "no-account"}:${walletClient.chain?.id ?? "no-chain"}`;
}

/**
 * Construct (or reuse) the full browser FHE bundle for the connected wallet:
 * `RelayerWeb` + `ViemSigner` + `ZamaSDK` with persistent IndexedDB
 * credential storage.
 *
 * `ViemSigner({ publicClient, walletClient })` is implemented purely against
 * `WalletClient` methods (`signTypedData`, `writeContract`) — it never
 * touches a private key, so wagmi's injected-wallet client works identically
 * to the spike's local-key client. The optional `ethereum` field (EIP-1193
 * lifecycle events) is deliberately omitted: this memo handles wallet-switch
 * teardown itself via the bundle key.
 *
 * Memoized per (address, chainId); the previous bundle's Web Worker is
 * terminated when the key changes ("lazy encryptor factories must return a
 * fresh instance per wallet-switch" — TokenOps' own Pitfall #3).
 */
export function getBrowserFheBundle(inputs: BrowserFheBundleInputs): BrowserFheBundle {
  assertBrowser("getBrowserFheBundle");

  const key = bundleKey(inputs.walletClient);
  if (activeBundle?.key === key) return activeBundle.bundle;

  // Wallet or chain changed: tear down the stale worker before rebuilding.
  activeBundle?.bundle.terminate();

  const relayer = createBrowserRelayer({ rpcUrl: inputs.rpcUrl });
  const signer = new ViemSigner({
    publicClient: inputs.publicClient,
    walletClient: inputs.walletClient,
  });
  const zama = new ZamaSDK({ relayer, signer, storage: indexedDBStorage });

  // Typed assignment, not a cast: TypeScript verifies here that RelayerWeb
  // still satisfies TokenOps' Encryptor contract. If the @zama-fhe/sdk pin
  // is ever loosened past 3.0.0 (encrypt() return shape changed in 3.2.0),
  // this line is where the build breaks — loudly, at compile time.
  const encryptor: Encryptor = relayer;

  const bundle: BrowserFheBundle = {
    zama,
    relayer,
    encryptor,
    terminate: () => {
      relayer.terminate();
      if (activeBundle?.bundle === bundle) activeBundle = undefined;
    },
  };
  activeBundle = { key, bundle };
  return bundle;
}
