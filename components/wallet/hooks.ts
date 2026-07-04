"use client";

import { useSyncExternalStore } from "react";
import { useAccount } from "wagmi";
import { SEPOLIA_CHAIN_ID } from "../../lib/constants";

const emptySubscribe = () => () => {};

/**
 * Hydration guard: wallet state only exists in the browser, so components that
 * render it must wait for mount to avoid a server/client markup mismatch.
 * useSyncExternalStore returns the server snapshot (false) during SSR and the
 * client snapshot (true) after hydration — no setState-in-effect needed.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export interface SepoliaWalletStatus {
  /** True once the component is hydrated — wallet fields are meaningless before this. */
  mounted: boolean;
  address: `0x${string}` | undefined;
  isConnected: boolean;
  /** The wallet's current chain id (may be a chain wagmi doesn't know about). */
  chainId: number | undefined;
  /** Human name of the current chain, if wagmi recognises it. */
  chainName: string | undefined;
  /** Connected AND on Sepolia (SEPOLIA_CHAIN_ID from lib/constants.ts). */
  isOnSepolia: boolean;
}

/**
 * Single readiness signal used by the wizard gate, the network guard, and the
 * verification panel. Detection only — never triggers any on-chain action.
 */
export function useSepoliaWallet(): SepoliaWalletStatus {
  const mounted = useMounted();
  const { address, isConnected, chainId, chain } = useAccount();

  const connected = mounted && isConnected;
  return {
    mounted,
    address: connected ? address : undefined,
    isConnected: connected,
    chainId: connected ? chainId : undefined,
    chainName: connected ? chain?.name : undefined,
    isOnSepolia: connected && chainId === SEPOLIA_CHAIN_ID,
  };
}
