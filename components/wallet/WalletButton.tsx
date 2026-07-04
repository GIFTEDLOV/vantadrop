"use client";

import { useState } from "react";
import { useConnect, useDisconnect } from "wagmi";
import { shortHex } from "../../lib/constants";
import { Dot } from "../ui";
import { useSepoliaWallet } from "./hooks";

/**
 * Custom injected-wallet connect button (no RainbowKit/ConnectKit).
 *
 * Scope: connect + disconnect only. Connecting a wallet does not enable any
 * on-chain action in this UI yet — TokenOps execution is a later phase.
 */
export function WalletButton() {
  const { mounted, address, isConnected } = useSepoliaWallet();
  const { connect, connectors, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const [noWallet, setNoWallet] = useState(false);

  function handleConnect() {
    setNoWallet(false);
    const hasInjected =
      typeof window !== "undefined" &&
      typeof (window as { ethereum?: unknown }).ethereum !== "undefined";
    if (!hasInjected) {
      setNoWallet(true);
      return;
    }
    const injectedConnector = connectors[0];
    if (!injectedConnector) {
      setNoWallet(true);
      return;
    }
    connect({ connector: injectedConnector });
  }

  // Before hydration, render a stable placeholder so server and client markup match.
  if (!mounted) {
    return (
      <button
        type="button"
        disabled
        className="rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white opacity-60"
      >
        Connect Wallet
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-2 font-mono text-[13px] text-emerald-200"
          title={address}
        >
          <Dot className="bg-emerald-400" />
          {shortHex(address)}
        </span>
        <button
          type="button"
          onClick={() => disconnect()}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleConnect}
        disabled={isPending}
        className="inline-flex items-center gap-2 self-start rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
      >
        {isPending && (
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden="true"
          />
        )}
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>
      {noWallet && (
        <p className="text-[13px] text-amber-300">
          No wallet detected — install MetaMask or a compatible browser wallet, then reload
          this page.
        </p>
      )}
      {!noWallet && connectError && (
        <p className="text-[13px] text-amber-300">
          Wallet connection failed: {connectError.message.split("\n")[0]}
        </p>
      )}
    </div>
  );
}
