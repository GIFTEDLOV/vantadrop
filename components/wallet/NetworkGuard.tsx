"use client";

import { useSwitchChain } from "wagmi";
import { SEPOLIA_CHAIN_ID } from "../../lib/constants";
import { Badge, Dot } from "../ui";
import { useSepoliaWallet } from "./hooks";

/**
 * Sepolia network guard — detection and (wallet-permitting) chain switching only.
 * Being on the right network never triggers any transaction from this UI.
 */
export function NetworkGuard() {
  const { mounted, isConnected, chainId, chainName, isOnSepolia } = useSepoliaWallet();
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();

  if (!mounted || !isConnected) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">
          <Dot className="bg-zinc-500" />
          Network guard idle
        </Badge>
        <span className="text-[13px] text-zinc-500">
          Connect a wallet to check it against Sepolia (chain id {SEPOLIA_CHAIN_ID}).
        </span>
      </div>
    );
  }

  if (isOnSepolia) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="proven">
          <Dot className="bg-emerald-400" />
          Sepolia · chain id {SEPOLIA_CHAIN_ID}
        </Badge>
        <span className="text-[13px] text-zinc-500">
          Correct network for VantaDrop.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="pending">
          <Dot className="bg-amber-400" />
          Wrong network
        </Badge>
        <span className="text-[13px] text-zinc-400">
          Connected to{" "}
          <span className="text-zinc-200">
            {chainName ?? "an unrecognised chain"}
            {chainId !== undefined && ` (id ${chainId})`}
          </span>{" "}
          — VantaDrop requires Sepolia (id {SEPOLIA_CHAIN_ID}).
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => switchChain({ chainId: SEPOLIA_CHAIN_ID })}
          disabled={isSwitching}
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-[13px] font-semibold text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-60"
        >
          {isSwitching ? "Requesting switch…" : "Switch to Sepolia"}
        </button>
        {switchError && (
          <span className="text-[13px] text-amber-300">
            Switch failed or was rejected: {switchError.message.split("\n")[0]}
          </span>
        )}
      </div>
    </div>
  );
}
