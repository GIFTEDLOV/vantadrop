import Link from "next/link";
import {
  CTTT_TOKEN_ADDRESS,
  DEMO,
  REGISTRY_ADDRESS,
  TOKENOPS_AIRDROP_FACTORY,
  TX,
} from "../lib/constants";
import { AddressLink, Badge, Card, SectionLabel, TxLink } from "../components/ui";

const useCases = [
  {
    title: "Confidential airdrops",
    detail: "Reward early users without publishing who got what.",
  },
  {
    title: "Team payouts",
    detail: "Pay contributors on-chain without leaking the salary table.",
  },
  {
    title: "Investor distributions",
    detail: "Settle allocations without exposing cap-table terms.",
  },
  {
    title: "DAO contributor rewards",
    detail: "Compensate contributors without turning comp into governance drama.",
  },
  {
    title: "Community rewards",
    detail: "Run campaigns where amounts stay private to each recipient.",
  },
];

const howItWorks = [
  {
    step: "01",
    title: "Create",
    detail:
      "Define the distribution: type, ERC-7984 token, and recipient list — all client-side.",
  },
  {
    step: "02",
    title: "Encrypt",
    detail:
      "Each allocation is FHE-encrypted per recipient (euint64). Plaintext amounts never touch the chain.",
  },
  {
    step: "03",
    title: "Distribute",
    detail:
      "A TokenOps ConfidentialAirdrop clone is created and funded in one transaction. Public: that it exists. Private: everything inside.",
  },
  {
    step: "04",
    title: "Recipient decrypts",
    detail:
      "Only each recipient can grant themselves decrypt access, verify their own allocation, and claim it.",
  },
];

export default function LandingPage() {
  return (
    <div>
      {/* ---------------- Hero ---------------- */}
      <section className="hero-glow border-b border-white/[0.05]">
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-24 text-center sm:px-6">
          <div className="mb-6 flex justify-center">
            <Badge tone="proven">Proven live on Sepolia — real transactions below</Badge>
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-white sm:text-6xl">
            Private token distributions.{" "}
            <span className="text-gradient">Public-chain settlement.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
            VantaDrop distributes confidential ERC-7984 tokens with FHE-encrypted amounts,
            powered by TokenOps and Zama. Recipients — and only recipients — decrypt their own
            allocation.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/create"
              className="w-full rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:brightness-110 sm:w-auto"
            >
              Create Distribution
            </Link>
            <Link
              href="/drop/demo"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 sm:w-auto"
            >
              View Demo Distribution
            </Link>
            <Link
              href="/recipient/demo"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 sm:w-auto"
            >
              Recipient Portal
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------- Problem ---------------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionLabel>The problem</SectionLabel>
        <div className="mt-3 grid gap-10 lg:grid-cols-2">
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Public token distributions leak everything.
          </h2>
          <div className="space-y-4 text-[15px] leading-relaxed text-zinc-400">
            <p>
              Every conventional on-chain distribution publishes the full recipient list and
              every allocation amount, forever. For an airdrop that may be tolerable — for
              payroll, cap tables, and investor terms it is disqualifying.
            </p>
            <p>
              Teams either give up on-chain settlement entirely, or accept that competitors,
              counterparties, and colleagues can read exactly who was paid what.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- Solution ---------------- */}
      <section className="border-y border-white/[0.05] bg-white/[0.015]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionLabel>The solution</SectionLabel>
          <div className="mt-3 grid gap-10 lg:grid-cols-2">
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Encrypted amounts. Verifiable settlement.
            </h2>
            <div className="space-y-4 text-[15px] leading-relaxed text-zinc-400">
              <p>
                VantaDrop distributes{" "}
                <span className="text-zinc-200">ERC-7984 confidential tokens</span> through
                TokenOps&apos; audited confidential-airdrop contracts. Allocation amounts are
                encrypted end-to-end with Zama&apos;s fully homomorphic encryption — the chain
                settles ciphertext, never plaintext.
              </p>
              <p>
                Only each recipient can decrypt their own allocation. Not the public, not other
                recipients, not VantaDrop.
              </p>
            </div>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {useCases.map((uc) => (
              <Card key={uc.title} className="p-5">
                <h3 className="text-sm font-semibold text-white">{uc.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">{uc.detail}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionLabel>How it works</SectionLabel>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Four steps, one confidential pipeline.
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {howItWorks.map((item, i) => (
            <Card key={item.step} className="relative p-6">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-violet-400">{item.step}</span>
                {i < howItWorks.length - 1 && (
                  <span className="hidden h-px flex-1 bg-gradient-to-r from-violet-500/40 to-transparent lg:block" />
                )}
              </div>
              <h3 className="mt-3 text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">{item.detail}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------- Proof panel ---------------- */}
      <section className="border-t border-white/[0.05] bg-white/[0.015]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <SectionLabel>Proof, not promises</SectionLabel>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                This already ran on Sepolia.
              </h2>
            </div>
            <Link
              href="/verification"
              className="text-sm text-violet-300 underline decoration-violet-500/40 underline-offset-4 transition hover:text-violet-200"
            >
              Full verification panel →
            </Link>
          </div>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-zinc-400">
            The complete flow — mint, create + fund a confidential airdrop, recipient
            self-decryption, and claim — was executed live against Sepolia. Every artifact below
            is real and independently verifiable on Etherscan.
          </p>

          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <Card className="p-6">
              <h3 className="mb-4 text-sm font-semibold text-white">Deployed contracts</h3>
              <div className="space-y-3 text-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-zinc-500">VantaDrop registry</span>
                  <AddressLink address={REGISTRY_ADDRESS} />
                </div>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-zinc-500">TokenOps airdrop factory</span>
                  <AddressLink address={TOKENOPS_AIRDROP_FACTORY} />
                </div>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-zinc-500">CTTT token (ERC-7984)</span>
                  <AddressLink address={CTTT_TOKEN_ADDRESS} />
                </div>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-zinc-500">Demo airdrop clone</span>
                  <AddressLink address={DEMO.airdropClone} />
                </div>
              </div>
            </Card>
            <Card className="p-6">
              <h3 className="mb-4 text-sm font-semibold text-white">Proven transactions</h3>
              <div className="space-y-3 text-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-zinc-500">Mint confidential CTTT</span>
                  <TxLink hash={TX.mintConfidential} />
                </div>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-zinc-500">Create + fund airdrop</span>
                  <TxLink hash={TX.createAndFundConfidentialAirdrop} />
                </div>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-zinc-500">Recipient decrypt access</span>
                  <TxLink hash={TX.getClaimAmount} />
                </div>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-zinc-500">Claim</span>
                  <TxLink hash={TX.claim} />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
