import type { Metadata } from "next";
import Link from "next/link";
import {
  CTTT_TOKEN_ADDRESS,
  DEMO,
  REGISTRY_ADDRESS,
  TOKENOPS_AIRDROP_FACTORY,
  TX,
} from "../../../lib/constants";
import { AddressLink, Badge, Card, KeyValueRow, SectionLabel, TxLink } from "../../../components/ui";
import { PrivacyModel } from "../../../components/PrivacyModel";
import { VerificationPanel } from "../../../components/VerificationPanel";

export const metadata: Metadata = {
  title: "Genesis Confidential Airdrop — Demo Distribution",
  description:
    "The proven VantaDrop demo distribution on Sepolia: real contracts, real transactions, encrypted allocation.",
};

const timeline = [
  {
    title: "Distribution created + funded",
    detail:
      "TokenOps ConfidentialAirdropCloneable clone deployed and funded with an FHE-encrypted amount in a single transaction.",
    tx: TX.createAndFundConfidentialAirdrop,
  },
  {
    title: "Claim window opened",
    detail:
      "Claim window opened immediately at creation (startTimestamp = now), 7-day duration. No separate transaction — configured in the create call.",
    tx: null,
  },
  {
    title: "Recipient granted own decrypt access",
    detail:
      "The recipient called getClaimAmount, granting themselves ACL access, then decrypted their allocation client-side: 1000000 raw units (1.0 CTTT).",
    tx: TX.getClaimAmount,
  },
  {
    title: "Claimed",
    detail:
      "The recipient claimed; post-claim balance decrypted to 1000000 raw units — confirming the confidential transfer moved real value.",
    tx: TX.claim,
  },
];

export default function DemoDropPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      {/* ---------------- Header ---------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="demo">Demo distribution</Badge>
        <Badge tone="proven">Proven live on Sepolia</Badge>
      </div>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
        Genesis Confidential Airdrop
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-zinc-400">
        The first VantaDrop distribution, executed end-to-end against Sepolia. This page is
        public — anyone can verify the contracts and transactions below. What no one can see:
        the allocation amount, until the recipient decrypted it themselves.
      </p>
      <div className="mt-6">
        <Link
          href="/recipient/demo"
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          View as recipient →
        </Link>
      </div>

      {/* ---------------- Facts ---------------- */}
      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="mb-3 text-sm font-semibold text-white">Distribution</h3>
          <KeyValueRow label="Name">Genesis Confidential Airdrop (demo)</KeyValueRow>
          <KeyValueRow label="Use case">Private airdrop</KeyValueRow>
          <KeyValueRow label="Network">Sepolia</KeyValueRow>
          <KeyValueRow label="Recipients">
            1 — the proven demo has exactly one recipient
          </KeyValueRow>
          <KeyValueRow label="Sender / admin">
            <AddressLink address={DEMO.sender} />
          </KeyValueRow>
        </Card>
        <Card className="p-6">
          <h3 className="mb-3 text-sm font-semibold text-white">Contracts</h3>
          <KeyValueRow label="Token (CTTT, ERC-7984)">
            <AddressLink address={CTTT_TOKEN_ADDRESS} />
          </KeyValueRow>
          <KeyValueRow label="VantaDrop registry">
            <AddressLink address={REGISTRY_ADDRESS} />
          </KeyValueRow>
          <KeyValueRow label="TokenOps factory">
            <AddressLink address={TOKENOPS_AIRDROP_FACTORY} />
          </KeyValueRow>
          <KeyValueRow label="Airdrop clone">
            <AddressLink address={DEMO.airdropClone} />
          </KeyValueRow>
        </Card>
      </div>

      {/* ---------------- Timeline ---------------- */}
      <section className="mt-16">
        <SectionLabel>Status timeline</SectionLabel>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
          Every step below actually happened, in this order.
        </h2>
        <ol className="mt-8">
          {timeline.map((item, i) => (
            <li key={item.title} className="relative flex gap-4 pb-8 last:pb-0">
              {i < timeline.length - 1 && (
                <span className="timeline-line absolute left-[11px] top-7 h-full w-px" aria-hidden="true" />
              )}
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-300">
                ✓
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                  <Badge tone="proven">Completed</Badge>
                </div>
                <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-zinc-500">
                  {item.detail}
                </p>
                {item.tx && (
                  <p className="mt-2 text-[13px]">
                    <span className="mr-2 text-zinc-600">tx:</span>
                    <TxLink hash={item.tx} />
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------- Privacy model ---------------- */}
      <section className="mt-16">
        <SectionLabel>Privacy model</SectionLabel>
        <h2 className="mb-8 mt-2 text-xl font-semibold tracking-tight text-white">
          What this page can show you — and what it never could.
        </h2>
        <PrivacyModel />
      </section>

      {/* ---------------- Verification ---------------- */}
      <section className="mt-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <SectionLabel>Live verification</SectionLabel>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
              Verify it yourself.
            </h2>
          </div>
          <Link
            href="/verification"
            className="text-sm text-violet-300 underline decoration-violet-500/40 underline-offset-4 hover:text-violet-200"
          >
            Open standalone panel →
          </Link>
        </div>
        <div className="mt-8">
          <VerificationPanel compact />
        </div>
      </section>
    </div>
  );
}
