"use client";

/**
 * wagmi-idiomatic React read hooks over the deployed VantaDropRegistry.
 *
 * Read-only by design: registry reads are free public data and safe to wire
 * into UI (the verification page's integration-status panel shows the live
 * totalDistributions() count via useTotalDistributions). Registry WRITES are
 * deliberately NOT exposed as hooks in this phase — the plain callable
 * functions live in lib/registry/client.ts (writeRegisterDistribution /
 * writeUpdateStatus) and remain unwired until the issuer execute flow lands.
 */

import type { Address } from "viem";
import { useReadContract } from "wagmi";
import { REGISTRY_ADDRESS, SEPOLIA_CHAIN_ID } from "../constants";
import { vantaDropRegistryAbi } from "./abi";

const registryAddress = REGISTRY_ADDRESS as Address;

/**
 * Read one distribution by id. Disabled until an id is provided. A
 * DistributionNotFound revert surfaces via `error` — render as "not found".
 */
export function useDistribution(distributionId: bigint | undefined) {
  return useReadContract({
    address: registryAddress,
    abi: vantaDropRegistryAbi,
    functionName: "getDistribution",
    args: distributionId !== undefined ? [distributionId] : undefined,
    chainId: SEPOLIA_CHAIN_ID,
    query: { enabled: distributionId !== undefined },
  });
}

/** Read all distribution ids registered by `sender`. Disabled until an address is provided. */
export function useSenderDistributions(sender: Address | undefined) {
  return useReadContract({
    address: registryAddress,
    abi: vantaDropRegistryAbi,
    functionName: "getSenderDistributions",
    args: sender ? [sender] : undefined,
    chainId: SEPOLIA_CHAIN_ID,
    query: { enabled: !!sender },
  });
}

/**
 * Live count of distributions ever registered on-chain. No wallet needed —
 * runs over the app's public transport. As of this phase the deployed
 * registry holds 0 entries (the proven demo airdrop predates registry
 * frontend wiring and was never registered — verified live, not assumed).
 */
export function useTotalDistributions() {
  return useReadContract({
    address: registryAddress,
    abi: vantaDropRegistryAbi,
    functionName: "totalDistributions",
    chainId: SEPOLIA_CHAIN_ID,
  });
}
