import type { Metadata } from "next";
import {
  CTTT_TOKEN_ADDRESS,
  REGISTRY_ADDRESS,
  TOKENOPS_AIRDROP_FACTORY,
  TOKENOPS_SDK_VERSION,
  ZAMA_SDK_VERSION,
} from "../../lib/constants";
import { IntegrationStatus } from "../../components/IntegrationStatus";
import { PrivacyPanel } from "../../components/PrivacyPanel";
import {
  AddressLink,
  Badge,
  GradientCard,
  SectionLabel,
} from "../../components/ui";
import { VerificationPanel } from "../../components/VerificationPanel";
import { WalletReadiness } from "../../components/wallet/WalletReadiness";

export const metadata: Metadata = {
  title: "Live Verification",
  description:
    "Judge-friendly verification for VantaDrop: SDKs, contracts, public/private boundary, live Sepolia proof, and demo checklist.",
};

const checklist = [
  "Open /create and confirm the sender console, Sepolia guard, prep panel, and execute timeline are present.",
  "Open /drops and confirm wallet discovery explains Claim Vault eligibility checks without JSON import.",
  "Open /recipient/demo and confirm the visible flow is connect, detected package, reveal, claim, verify.",
  "Open /drop/demo and confirm the public room does not expose private claim material.",
  "Use the Etherscan links below to inspect contracts and transactions.",
];

export default function VerificationPage() {
  return (
    <div className="page-section-tight">
      <section className="grid gap-8 lg:grid-cols-[1fr_390px]">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="proven">Judge verification</Badge>
            <Badge tone="confidential">Sepolia only</Badge>
          </div>
          <SectionLabel>Live verification</SectionLabel>
          <h1 className="mt-4 max-w-5xl text-[clamp(38px,5vw,78px)] font-semibold leading-[0.96] tracking-[-0.075em] text-white">
            Verify the whole project quickly.
          </h1>
          <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-zinc-400">
            This page collects the public facts a judge needs: SDK versions, ERC-7984
            token, TokenOps infrastructure, VantaDropRegistry, proven browser flows,
            Etherscan links, Claim Vault discovery status, and the public/private data
            boundary.
          </p>
        </div>

        <GradientCard className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
            Fast status
          </p>
          <div className="mt-5 grid gap-3">
            {[
              "Browser issuer flow",
              "Recipient decrypt/claim",
              "Public recipient portal",
            ].map((item) => (
              <div
                key={item}
                className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"
              >
                <span className="block text-[12px] uppercase tracking-[0.16em] text-zinc-500">
                  {item}
                </span>
                <b className="mt-1 block text-emerald-300">Proven live</b>
              </div>
            ))}
          </div>
        </GradientCard>
      </section>

      <section className="mt-10 grid gap-4 xl:grid-cols-4">
        <GradientCard className="p-6">
          <SectionLabel>TokenOps SDK</SectionLabel>
          <p className="mt-3 font-mono text-[13px] text-zinc-200">
            {TOKENOPS_SDK_VERSION}
          </p>
        </GradientCard>
        <GradientCard className="p-6">
          <SectionLabel>Zama FHE SDK</SectionLabel>
          <p className="mt-3 font-mono text-[13px] text-zinc-200">
            {ZAMA_SDK_VERSION}
          </p>
        </GradientCard>
        <GradientCard className="p-6">
          <SectionLabel>CTTT token</SectionLabel>
          <p className="mt-3">
            <AddressLink address={CTTT_TOKEN_ADDRESS} />
          </p>
        </GradientCard>
        <GradientCard className="p-6">
          <SectionLabel>VantaDropRegistry</SectionLabel>
          <p className="mt-3">
            <AddressLink address={REGISTRY_ADDRESS} />
          </p>
        </GradientCard>
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <GradientCard className="p-6">
          <SectionLabel>Core infrastructure</SectionLabel>
          <div className="mt-4 grid gap-3 text-[13px]">
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-500">Token standard</span>
              <span className="text-zinc-200">ERC-7984 confidential token</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-500">TokenOps factory</span>
              <AddressLink address={TOKENOPS_AIRDROP_FACTORY} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-500">Target network</span>
              <span className="text-zinc-200">Ethereum Sepolia</span>
            </div>
          </div>
        </GradientCard>

        <GradientCard className="p-6">
          <SectionLabel>Demo checklist</SectionLabel>
          <ol className="mt-4 grid gap-3">
            {checklist.map((item, index) => (
              <li key={item} className="flex gap-3 text-[13px] leading-relaxed text-zinc-300">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 font-mono text-[11px] text-emerald-300">
                  {index + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </GradientCard>
      </section>

      <section className="mt-10">
        <SectionLabel>What is public vs private</SectionLabel>
        <div className="mt-5">
          <PrivacyPanel />
        </div>
      </section>

      <section className="mt-10">
        <SectionLabel>Claim Vault discovery</SectionLabel>
        <GradientCard className="mt-4 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-white">Product direction</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
                Product discovery now uses a Paychain-style encrypted Claim Vault:
                recipients open /drops, connect a wallet, sign a harmless eligibility
                message, and receive only their matching claim capsule if one exists.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Honest privacy boundary</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
                Wallet discovery uses encrypted backend storage and wallet-signature
                access control. It requires trusted encrypted backend storage for
                discovery. Manual package import exists only in hidden developer
                diagnostics.
              </p>
            </div>
          </div>
        </GradientCard>
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <SectionLabel>Wallet readiness</SectionLabel>
          <div className="mt-4">
            <WalletReadiness />
          </div>
          <div className="mt-4">
            <IntegrationStatus />
          </div>
        </div>
        <div>
          <SectionLabel>Etherscan proof panel</SectionLabel>
          <div className="mt-4">
            <VerificationPanel />
          </div>
        </div>
      </section>
    </div>
  );
}
