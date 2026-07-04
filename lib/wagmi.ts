/**
 * wagmi configuration — Sepolia only, injected (browser-extension) wallets only.
 *
 * Scope of this phase: wallet connect/disconnect + chain detection/switching.
 * No contract calls, no TokenOps SDK calls, no Zama encrypt/decrypt happen in
 * the browser yet — this config exists purely so the UI can know which wallet
 * and chain the user has.
 */

import { createConfig, http, injected } from "wagmi";
import { sepolia } from "wagmi/chains";
import { SEPOLIA_CHAIN_ID } from "./constants";

if (sepolia.id !== SEPOLIA_CHAIN_ID) {
  // lib/constants.ts is the single source of truth for the required chain id.
  // If an env override ever points it away from Sepolia, fail loudly instead of
  // silently guarding against the wrong network.
  throw new Error(
    `NEXT_PUBLIC_SEPOLIA_CHAIN_ID (${SEPOLIA_CHAIN_ID}) does not match the configured Sepolia chain (${sepolia.id}).`,
  );
}

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(),
  },
  ssr: true,
});
