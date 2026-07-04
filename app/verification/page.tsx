import type { Metadata } from "next";
import { Badge, SectionLabel } from "../../components/ui";
import { VerificationPanel } from "../../components/VerificationPanel";

export const metadata: Metadata = {
  title: "Live Verification",
  description:
    "Independently verify VantaDrop's proven Sepolia deployment: contracts, SDK versions, and all four end-to-end transaction hashes.",
};

export default function VerificationPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <SectionLabel>Live verification panel</SectionLabel>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Don&apos;t trust this page. Verify it.
        </h1>
      </div>
      <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">
        Everything below is public Sepolia data produced by the proven end-to-end run in{" "}
        <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[13px] text-zinc-200">
          scripts/spike-tokenops-sepolia.ts
        </code>
        . Each link opens Etherscan — no claim on this page requires trusting VantaDrop.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge tone="proven">Recipient self-decryption: proven live</Badge>
        <Badge tone="proven">Claim: proven live</Badge>
        <Badge tone="pending">Browser-wallet UI wiring: pending</Badge>
      </div>

      <div className="mt-10">
        <VerificationPanel />
      </div>
    </div>
  );
}
