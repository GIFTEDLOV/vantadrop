import type { Metadata } from "next";
import Link from "next/link";
import {
  CTTT_TOKEN_ADDRESS,
  DEMO,
  REGISTRY_ADDRESS,
  TOKENOPS_AIRDROP_FACTORY,
  TX,
} from "../../../lib/constants";
import {
  AddressLink,
  Badge,
  GradientCard,
  KeyValueRow,
  SectionLabel,
  Timeline,
  TxLink,
} from "../../../components/ui";
import { PrivacyPanel } from "../../../components/PrivacyPanel";
import { VerificationPanel } from "../../../components/VerificationPanel";

export const metadata: Metadata = {
  title: "Genesis Confidential Airdrop - Demo Distribution",
  description:
    "The proven VantaDrop demo distribution on Sepolia: public metadata, TokenOps clone, registry boundary, and recipient instructions.",
};

const timeline = [
  {
    title: "Distribution created and funded",
    detail:
      "TokenOps deployed and funded a ConfidentialAirdrop clone on Sepolia. The funding amount was handled confidentially.",
    status: "done" as const,
    meta: <TxLink hash={TX.createAndFundConfidentialAirdrop} />,
  },
  {
    title: "Public metadata boundary",
    detail:
      "VantaDropRegistry is for title, use case, token address, clone address, and recipient count only.",
    status: "done" as const,
  },
  {
    title: "Recipient granted decrypt access",
    detail:
      "The recipient called getClaimAmount, granting their own address ACL access to decrypt their allocation.",
    status: "done" as const,
    meta: <TxLink hash={TX.getClaimAmount} />,
  },
  {
    title: "Recipient claimed and verified",
    detail:
      "The recipient claimed successfully and verified confidential balance client-side.",
    status: "done" as const,
    meta: <TxLink hash={TX.claim} />,
  },
];

const recipientSteps = [
  "Connect the recipient wallet on Sepolia.",
  "Open /drops and privately check eligible claim packages.",
  "Sign the harmless eligibility message and grant decrypt access.",
  "Decrypt only your own allocation, then claim and verify balance.",
];

export default function DemoDropPage() {
  return (
    <div className="page-section-tight">
      <section className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="demo">Distribution room</Badge>
            <Badge tone="proven">Proven live on Sepolia</Badge>
          </div>
          <h1 className="mt-4 max-w-4xl text-[clamp(38px,5vw,78px)] font-semibold leading-[0.96] tracking-[-0.075em] text-white">
            Genesis Confidential Airdrop
          </h1>
          <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-zinc-400">
            This room shows the public evidence for a confidential distribution. Anyone
            can verify the contracts and transactions. What remains private: recipient
            allocation amounts, claim signatures, handles, proofs, and Claim Vault
            capsules.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/drops" className="btn-primary">
              Open Drops Dashboard
            </Link>
            <Link href="/verification" className="btn-secondary">
              Open Verification
            </Link>
          </div>
        </div>

        <GradientCard className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
            Room status
          </p>
          <div className="mt-5 grid gap-3">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
              <span className="block text-[12px] uppercase tracking-[0.16em] text-zinc-500">
                Network
              </span>
              <b className="mt-1 block text-white">Sepolia</b>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
              <span className="block text-[12px] uppercase tracking-[0.16em] text-zinc-500">
                Recipients public count
              </span>
              <b className="mt-1 block text-white">{DEMO.recipientCount}</b>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
              <span className="block text-[12px] uppercase tracking-[0.16em] text-zinc-500">
                Allocation privacy
              </span>
              <b className="mt-1 block text-white">Recipient-only decrypt</b>
            </div>
          </div>
        </GradientCard>
      </section>

      <section className="mt-10 grid gap-4 xl:grid-cols-3">
        <GradientCard className="p-6">
          <SectionLabel>Public metadata</SectionLabel>
          <div className="mt-4">
            <KeyValueRow label="Name">Genesis Confidential Airdrop</KeyValueRow>
            <KeyValueRow label="Use case">Private airdrop</KeyValueRow>
            <KeyValueRow label="Network">Sepolia</KeyValueRow>
            <KeyValueRow label="Recipients">{DEMO.recipientCount}</KeyValueRow>
            <KeyValueRow label="Sender">
              <AddressLink address={DEMO.sender} />
            </KeyValueRow>
          </div>
        </GradientCard>

        <GradientCard className="p-6">
          <SectionLabel>TokenOps clone</SectionLabel>
          <div className="mt-4">
            <KeyValueRow label="Factory">
              <AddressLink address={TOKENOPS_AIRDROP_FACTORY} />
            </KeyValueRow>
            <KeyValueRow label="Airdrop clone">
              <AddressLink address={DEMO.airdropClone} />
            </KeyValueRow>
            <KeyValueRow label="Token">
              <AddressLink address={CTTT_TOKEN_ADDRESS} />
            </KeyValueRow>
            <KeyValueRow label="Token standard">ERC-7984 confidential token</KeyValueRow>
          </div>
        </GradientCard>

        <GradientCard className="p-6">
          <SectionLabel>Registry panel</SectionLabel>
          <div className="mt-4">
            <KeyValueRow label="Registry">
              <AddressLink address={REGISTRY_ADDRESS} />
            </KeyValueRow>
            <KeyValueRow label="Stores">Public metadata only</KeyValueRow>
            <KeyValueRow label="Does not store">
              <span className="text-right">recipients, amounts, notes, signatures</span>
            </KeyValueRow>
            <KeyValueRow label="Claim Vault">Encrypted off-chain capsules</KeyValueRow>
          </div>
        </GradientCard>
      </section>

      <section className="mt-12 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <SectionLabel>Status timeline</SectionLabel>
          <h2 className="mt-3 text-[clamp(30px,4vw,56px)] font-semibold leading-[0.98] tracking-[-0.065em] text-white">
            Public steps, private allocation.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">
            Every transaction link below is public. None of those links reveal the
            recipient allocation amount in plaintext.
          </p>
        </div>
        <Timeline items={timeline} />
      </section>

      <section className="mt-12">
        <SectionLabel>Privacy model</SectionLabel>
        <div className="mt-5">
          <PrivacyPanel />
        </div>
      </section>

      <section className="mt-12 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <GradientCard className="p-6">
          <SectionLabel>Recipient instructions</SectionLabel>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            The room is public. Claim material is not.
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">
            Recipients connect from /drops and sign a harmless wallet-ownership
            message. If the encrypted Claim Vault has a matching capsule, the claim
            flow opens without JSON paste, upload, or package handling.
          </p>
          <ol className="mt-5 grid gap-3">
            {recipientSteps.map((step, index) => (
              <li key={step} className="flex gap-3 text-[13px] text-zinc-300">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 font-mono text-[11px] text-violet-200">
                  {index + 1}
                </span>
                <span className="pt-1">{step}</span>
              </li>
            ))}
          </ol>
        </GradientCard>

        <GradientCard className="p-6">
          <SectionLabel>Public verification links</SectionLabel>
          <div className="mt-4 grid gap-3 text-[13px]">
            <KeyValueRow label="Mint confidential CTTT">
              <TxLink hash={TX.mintConfidential} />
            </KeyValueRow>
            <KeyValueRow label="Create + fund">
              <TxLink hash={TX.createAndFundConfidentialAirdrop} />
            </KeyValueRow>
            <KeyValueRow label="Grant decrypt access">
              <TxLink hash={TX.getClaimAmount} />
            </KeyValueRow>
            <KeyValueRow label="Claim">
              <TxLink hash={TX.claim} />
            </KeyValueRow>
          </div>
        </GradientCard>
      </section>

      <section className="mt-12">
        <SectionLabel>Standalone verification</SectionLabel>
        <div className="mt-5">
          <VerificationPanel compact />
        </div>
      </section>
    </div>
  );
}
