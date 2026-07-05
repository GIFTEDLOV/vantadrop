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
 * output this claim is based on.
 *
 * "Proven live" for the full issuer execution and registry write means a
 * human ran the complete /create wizard sequence — sender prep, operator
 * approval, encrypt, sign, create-and-fund, register — against a funded
 * burner wallet on live Sepolia, and it succeeded end-to-end. See
 * docs/research/browser-tokenops-integration.md ("Live browser issuer create
 * flow result") for the real tx hashes, the created airdrop clone address,
 * and the recovered registry distribution id this claim is based on.
 *
 * "Proven live" for recipient decrypt/claim means a human ran the complete
 * /dev/recipient-claim-diagnostic sequence — package parse, eligibility
 * check, getClaimAmount (ACL grant), Zama decrypt, claim, post-claim balance
 * re-verify — against a funded recipient burner wallet on live Sepolia, and
 * it succeeded end-to-end (decrypted allocation and post-claim balance both
 * matched: 5 CTTT). See docs/research/browser-tokenops-integration.md ("Live
 * browser recipient decrypt/claim result") for the real tx hashes.
 *
 * IMPORTANT DISTINCTION — "proven live" here means the underlying primitives
 * work end-to-end, proven via the hidden dev diagnostics. The public
 * recipient portal (/recipient/demo) now has the diagnostic's proven service
 * functions wired behind real, productized buttons ("Wired — ready for live
 * testing" below) — but that specific page's UI has NOT itself been run live
 * against a wallet yet. Same "wired ≠ proven live" bar every prior phase
 * used: it becomes "proven live" only after a human clicks through it on
 * Sepolia.
 */
export function IntegrationStatus() {
  const totalDistributions = useTotalDistributions();

  return (
    <Card className="p-6">
      <h3 className="mb-1 text-sm font-semibold text-white">Integration status</h3>
      <p className="mb-3 text-[13px] text-zinc-500">
        Where the browser integration actually stands. &quot;Ready&quot; means typed
        service functions exist and compile into this bundle. &quot;Proven live&quot; means
        a human ran that exact action against a funded burner wallet on live Sepolia and
        it succeeded. Both the full issuer create flow and the recipient decrypt/claim
        flow have been run live end-to-end via hidden developer diagnostics — see the
        research doc for tx hashes. The public recipient portal (/recipient/demo) now
        wires those same proven recipient service functions behind productized buttons
        (&quot;Wired&quot;), but that page&apos;s own UI has not yet been exercised live —
        wired is not proven.
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
        <Badge tone="proven">Proven live</Badge>
      </KeyValueRow>
      <KeyValueRow label="Recipient decrypt/claim diagnostic">
        <Badge tone="proven">Proven live</Badge>
      </KeyValueRow>
      <KeyValueRow label="Public recipient portal (/recipient/demo)">
        <Badge tone="pending">Wired — ready for live testing</Badge>
      </KeyValueRow>
      <KeyValueRow label="Registry frontend writes">
        <Badge tone="proven">Proven live</Badge>
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
          from your browser. The original proven demo airdrop predates the registry
          frontend and was never registered; the count above reflects only
          distributions actually registered by the now-proven-live issuer flow.
        </p>
      </div>
    </Card>
  );
}
