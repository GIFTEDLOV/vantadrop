"use client";

import { Card } from "../ui";
import { NetworkGuard } from "./NetworkGuard";
import { WalletButton } from "./WalletButton";

/**
 * Compact wallet + network status strip, reused across /create and
 * /recipient/demo. Detection and connection only — no on-chain actions.
 */
export function WalletStatusBar() {
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Wallet
          </p>
          <div className="mt-2">
            <WalletButton />
          </div>
        </div>
        <div className="min-w-0 sm:text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Network
          </p>
          <div className="mt-2 sm:flex sm:justify-end">
            <NetworkGuard />
          </div>
        </div>
      </div>
    </Card>
  );
}
