"use client";

import { SEPOLIA_CHAIN_ID } from "../../lib/constants";
import { AddressLink, Badge, Card, KeyValueRow } from "../ui";
import { useSepoliaWallet } from "./hooks";
import { NetworkGuard } from "./NetworkGuard";
import { WalletButton } from "./WalletButton";

/**
 * Wallet/network readiness card for the verification page.
 *
 * Reports browser wallet state only. Nothing in this card executes anything
 * on-chain — every "Proven live" badge elsewhere on the page refers to the
 * Node-script spike (scripts/spike-tokenops-sepolia.ts), not to this browser.
 */
export function WalletReadiness() {
  const { mounted, address, isConnected, chainId, chainName, isOnSepolia } =
    useSepoliaWallet();

  return (
    <Card className="p-6">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-white">Your wallet readiness</h3>
        {!mounted || !isConnected ? (
          <Badge tone="neutral">No wallet connected</Badge>
        ) : isOnSepolia ? (
          <Badge tone="proven">Sepolia match</Badge>
        ) : (
          <Badge tone="pending">Wrong network</Badge>
        )}
      </div>
      <p className="mb-3 text-[13px] text-zinc-500">
        Live detection of your browser wallet — connection and chain only. This section
        performs no on-chain action: the &quot;Proven live&quot; results on this page were
        produced by the Node-script spike, not by this browser, and browser execution is not
        wired yet.
      </p>
      <KeyValueRow label="Connected address">
        {mounted && isConnected && address ? (
          <AddressLink address={address} />
        ) : (
          <span className="text-zinc-500">Not connected</span>
        )}
      </KeyValueRow>
      <KeyValueRow label="Current chain">
        {mounted && isConnected && chainId !== undefined ? (
          <span className={isOnSepolia ? "text-emerald-300" : "text-amber-300"}>
            {chainName ?? "Unrecognised chain"} (id {chainId})
          </span>
        ) : (
          <span className="text-zinc-500">—</span>
        )}
      </KeyValueRow>
      <KeyValueRow label="Required chain">Sepolia (id {SEPOLIA_CHAIN_ID})</KeyValueRow>
      <div className="mt-4 flex flex-col gap-3">
        <WalletButton />
        <NetworkGuard />
      </div>
    </Card>
  );
}
