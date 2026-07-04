/**
 * PLANNING STUB — browser-side TokenOps + Zama client construction plan.
 *
 * This file is deliberately inert: type-only imports, interfaces, and comments.
 * It sketches the shape `lib/tokenops/browser.ts` will take in the next
 * (implementation) phase, based on the research in
 * `docs/research/browser-tokenops-integration.md`. Nothing here constructs a
 * client, encrypts, decrypts, signs, or sends a transaction.
 *
 * DO NOT add live calls here. In particular, `createAndFundConfidentialAirdrop`,
 * `getClaimAmount`, and `claim` must not be invoked from the frontend in this
 * phase (research-phase constraint).
 */

import type { PublicClient, WalletClient } from "viem";
// Type-only imports — erased at compile time, nothing is bundled or executed.
import type { RelayerWeb, ZamaSDK } from "@zama-fhe/sdk";
import type { Encryptor } from "@tokenops/sdk/fhe-airdrop";

/**
 * The one browser-side FHE bundle the app will construct (lazily, client-only,
 * one instance per connected wallet — permits/credentials are signer-specific,
 * exactly like the spike's per-wallet `buildZamaSdk`).
 *
 * Planned construction (next phase, in `lib/tokenops/browser.ts`):
 *
 *   const relayer = new RelayerWeb({
 *     transports: { [SepoliaConfig.chainId]: { ...SepoliaConfig, network: rpcUrl } },
 *     getChainId: async () => sepolia.id,
 *   });
 *   const signer = new ViemSigner({ publicClient, walletClient });
 *   const zama = new ZamaSDK({ relayer, signer, storage: indexedDBStorage });
 *   // encryptor for TokenOps factory calls: zama.relayer satisfies Encryptor
 *   // (verified: RelayerWeb.encrypt returns { handles: Uint8Array[], inputProof: Uint8Array })
 *
 * Rules established by the research:
 * - Construct ONLY on the client (RelayerWeb owns a Web Worker + IndexedDB).
 *   Importing the modules is SSR-safe (empirically verified via `npm run build`);
 *   constructing/using is not — gate behind user interaction or an effect.
 * - Rebuild (and `terminate()` the old relayer) on wallet account switch.
 * - NEVER pass a bare address string as `account` to TokenOps write calls.
 *   In the browser, omit `account` entirely so calls fall back to
 *   `walletClient.account` (wagmi populates this with a json-rpc Account whose
 *   eth_sendTransaction path is handled by the wallet extension — the correct
 *   browser signing model, unlike the Node spike's local private-key Account).
 */
export interface BrowserFheBundle {
  /** Zama SDK bound to the connected wallet — `allow()` + `userDecrypt()` live here. */
  zama: ZamaSDK;
  /** The underlying browser relayer; `zama.relayer` narrowed to its concrete type. */
  relayer: RelayerWeb;
  /**
   * Encryptor to pass to `createConfidentialAirdropFactoryClient` /
   * `encryptUint64`. Structurally, this is `zama.relayer` — kept as its own
   * field so call sites depend on the TokenOps-facing interface, not on Zama
   * internals.
   */
  encryptor: Encryptor;
  /** Tear down the Web Worker (call on wallet switch / logout). */
  terminate: () => void;
}

/** Inputs the bundle factory will need — both come straight from wagmi hooks. */
export interface BrowserFheBundleInputs {
  /** From wagmi `usePublicClient()`. */
  publicClient: PublicClient;
  /** From wagmi `useWalletClient().data`. */
  walletClient: WalletClient;
  /** Sepolia RPC URL override (defaults to the app's configured public RPC). */
  rpcUrl?: string;
}

/**
 * Planned signature for the next phase (NOT implemented here):
 *
 *   export function getBrowserFheBundle(
 *     inputs: BrowserFheBundleInputs,
 *   ): Promise<BrowserFheBundle>;
 *
 * Implementation notes for whoever writes it:
 * - Memoize per (walletClient.account?.address, chainId); terminate stale bundles.
 * - `if (typeof window === "undefined") throw` — fail loudly if ever reached in SSR.
 * - Use `indexedDBStorage` (not `memoryStorage`) so the recipient's decrypt
 *   permit survives page reloads instead of re-prompting an EIP-712 signature.
 */
