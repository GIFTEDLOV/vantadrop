"use client";

import { Badge, Card, KeyValueRow } from "./ui";
import { useTotalDistributions } from "../lib/registry/hooks";
// Real imports from the new service layer. Nothing is invoked — importing
// these modules into a rendered client component makes every `npm run build`
// an empirical proof that the full SDK module graph (@tokenops/sdk/fhe,
// /fhe-airdrop, @zama-fhe/sdk, @zama-fhe/sdk/viem) still bundles and survives
// server-side prerender evaluation, and it makes the "Prepared" line below a
// checked fact (the functions exist in the shipped bundle) instead of a
// hardcoded string.
import { getBrowserFheBundle } from "../lib/tokenops/browser";
import { createAndFundAirdrop } from "../lib/tokenops/issuer";
import { claimAllocation } from "../lib/tokenops/recipient";

const serviceLayerPresent =
  typeof getBrowserFheBundle === "function" &&
  typeof createAndFundAirdrop === "function" &&
  typeof claimAllocation === "function";

/**
 * Honest integration status of the browser stack, phase by phase.
 *
 * "Ready" for the service layer means exactly this: real, typed service
 * functions exist and are shipped in this bundle (checked above via real
 * imports) — it does NOT mean every function has been exercised against a
 * live wallet transaction.
 *
 * "Proven live" for the two diagnostics means a human manually ran that
 * exact button, in a real browser, against a funded burner wallet on live
 * Sepolia, and it succeeded — see docs/research/browser-tokenops-integration.md
 * ("Live browser diagnostic result") for the real tx hash and encryption
 * output this claim is based on. It does NOT mean the full multi-step issuer
 * or recipient flows have been run — those remain separate, larger, still
 *-unwired surfaces (see the two "Not wired yet" rows below).
 */
export function IntegrationStatus() {
  const totalDistributions = useTotalDistributions();

  return (
    <Card className="p-6">
      <h3 className="mb-1 text-sm font-semibold text-white">Integration status</h3>
      <p className="mb-3 text-[13px] text-zinc-500">
        Where the browser integration actually stands. &quot;Ready&quot; means typed
        service functions exist and compile into this bundle. &quot;Proven live&quot; means a
        human clicked that exact button against a funded burner wallet on live Sepolia
        and it succeeded. The dev-only diagnostic page is still the only surface that has
        ever sent a live transaction or run a live encryption — no production flow
        (the wizard, the recipient portal) sends transactions yet.
      </p>
      <KeyValueRow label="Wallet foundation">
        <Badge tone="proven">Ready</Badge>
      </KeyValueRow>
      <KeyValueRow label="Sepolia guard">
        <Badge tone="proven">Ready</Badge>
      </KeyValueRow>
      <KeyValueRow label="Browser TokenOps service layer">
        <Badge tone="proven">{serviceLayerPresent ? "Ready" : "Missing"}</Badge>
      </KeyValueRow>
      <KeyValueRow label="Browser operator diagnostic">
        <Badge tone="proven">Proven live</Badge>
      </KeyValueRow>
      <KeyValueRow label="Browser encryption diagnostic">
        <Badge tone="proven">Proven live</Badge>
      </KeyValueRow>
      <KeyValueRow label="Full issuer execution">
        <Badge tone="pending">Not wired yet</Badge>
      </KeyValueRow>
      <KeyValueRow label="Recipient decrypt/claim">
        <Badge tone="pending">Not wired yet</Badge>
      </KeyValueRow>
      <KeyValueRow label="Registry frontend writes">
        <Badge tone="pending">Not wired yet</Badge>
      </KeyValueRow>
      <div className="mt-4 border-t border-white/[0.05] pt-3">
        <KeyValueRow label="Registry reads (live from this browser)">
          {totalDistributions.isPending ? (
            <span className="text-zinc-500">Reading totalDistributions()…</span>
          ) : totalDistributions.isError ? (
            <span className="text-amber-300">Read failed — RPC unreachable</span>
          ) : (
            <span>
              {totalDistributions.data?.toString()} distribution
              {totalDistributions.data === 1n ? "" : "s"} registered on-chain
            </span>
          )}
        </KeyValueRow>
        <p className="mt-2 text-[12px] leading-relaxed text-zinc-600">
          This row is a real read-only call to VantaDropRegistry.totalDistributions()
          from your browser — the first live registry wiring. The proven demo airdrop
          predates the registry frontend and was never registered, so 0 is the honest
          count until the issuer flow is wired.
        </p>
      </div>
    </Card>
  );
}
