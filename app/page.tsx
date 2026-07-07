import Link from "next/link";
import {
  CTTT_TOKEN_ADDRESS,
  DEMO,
  REGISTRY_ADDRESS,
  TOKENOPS_AIRDROP_FACTORY,
  TX,
} from "../lib/constants";
import { MotionOrb } from "../components/MotionOrb";
import { PrivacyPanel } from "../components/PrivacyPanel";
import {
  AddressLink,
  Badge,
  GradientCard,
  ProofCard,
  SectionLabel,
  Timeline,
  TxLink,
} from "../components/ui";

const useCases = [
  {
    title: "Confidential airdrops",
    detail: "Reward users without publishing who received which allocation.",
  },
  {
    title: "Team distributions",
    detail: "Settle contributor grants on-chain without exposing the compensation table.",
  },
  {
    title: "Investor allocations",
    detail: "Prove settlement while keeping individual terms confidential.",
  },
  {
    title: "DAO rewards",
    detail: "Pay contributors without turning every amount into public governance drama.",
  },
];

const workflow = [
  {
    title: "Sender prepares",
    detail:
      "The sender connects on Sepolia, mints test CTTT if needed, approves TokenOps as operator, and reviews public registry metadata.",
    status: "done" as const,
  },
  {
    title: "Create confidential distribution",
    detail:
      "TokenOps creates and funds a ConfidentialAirdrop clone. Funding is encrypted in-flight; the registry stores public metadata only.",
    status: "done" as const,
  },
  {
    title: "Store in encrypted Claim Vault",
    detail:
      "The app stores encrypted recipient claim capsules off-chain. VantaDropRegistry still stores public metadata only.",
    status: "done" as const,
  },
  {
    title: "Recipient decrypts and claims",
    detail:
      "The recipient connects from /drops, signs a harmless eligibility message, receives only their matching capsule, decrypts their own allocation, claims, and verifies balance.",
    status: "done" as const,
  },
];

const demoGuide = [
  {
    title: "Create",
    detail:
      "Use the live sender wizard. It preserves the proven TokenOps flow and stores encrypted claim capsules when the Claim Vault is configured.",
    href: "/create",
  },
  {
    title: "Distribution room",
    detail:
      "Inspect public metadata, registry facts, TokenOps clone links, and the privacy boundary.",
    href: "/drop/demo",
  },
  {
    title: "Drops dashboard",
    detail:
      "Connect your wallet to privately check eligible claim packages and open the claim flow.",
    href: "/drops",
  },
];

export default function LandingPage() {
  return (
    <div>
      <section className="min-h-[calc(100vh-56px)] border-b border-white/[0.06]">
        <div className="page-section grid min-h-[calc(100vh-56px)] items-center gap-10 py-14 lg:grid-cols-[1.02fr_0.98fr]">
          <div>
            <div className="mb-5 flex flex-wrap gap-2">
              <Badge tone="proven">Proven live on Sepolia</Badge>
              <Badge tone="confidential">ERC-7984 confidential token</Badge>
              <Badge tone="demo">TokenOps + Zama FHE</Badge>
            </div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-violet-300">
              Confidential distribution infrastructure
            </p>
            <h1 className="max-w-5xl text-[clamp(48px,7vw,108px)] font-semibold leading-[0.91] tracking-[-0.075em] text-white">
              Private token distributions.{" "}
              <span className="text-gradient">Public-chain settlement.</span>
            </h1>
            <p className="mt-7 max-w-3xl text-[15px] leading-[1.72] text-zinc-400 sm:text-[16px]">
              Public token distributions leak allocation data: recipient lists,
              amounts, and timing become permanent chain intelligence. VantaDrop keeps
              allocation data confidential while preserving public settlement. The sender
              creates a confidential distribution, stores claim material in the encrypted
              Claim Vault, and each recipient decrypts only their own allocation.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/create" className="btn-primary">
                Create Distribution
              </Link>
              <Link href="/drops" className="btn-secondary">
                Browse Drops
              </Link>
              <Link href="/verification" className="btn-secondary">
                Verification
              </Link>
            </div>

            <div className="mt-9 grid max-w-4xl gap-3 sm:grid-cols-3">
              <ProofCard className="p-4">
                <b className="block text-[20px] text-white">Public</b>
                <span className="mt-1 block text-[12px] leading-relaxed text-zinc-500">
                  token, clone, sender, title, use case, recipient count
                </span>
              </ProofCard>
              <ProofCard className="p-4">
                <b className="block text-[20px] text-white">Private</b>
                <span className="mt-1 block text-[12px] leading-relaxed text-zinc-500">
                  recipients, notes, amounts, signatures, handles, proofs
                </span>
              </ProofCard>
              <ProofCard className="p-4">
                <b className="block text-[20px] text-white">Verified</b>
                <span className="mt-1 block text-[12px] leading-relaxed text-zinc-500">
                  issuer flow, recipient decrypt, claim, registry writes
                </span>
              </ProofCard>
            </div>
          </div>

          <MotionOrb
            label="Encrypted allocation"
            primary="Ciphertext on-chain"
            secondary="Recipient decrypts only their own"
          />
        </div>
      </section>

      <section className="page-section">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <SectionLabel>Use cases</SectionLabel>
            <h2 className="mt-3 max-w-3xl text-[clamp(34px,4vw,66px)] font-semibold leading-[0.96] tracking-[-0.07em] text-white">
              On-chain settlement for allocations that should not become public data.
            </h2>
          </div>
          <p className="max-w-xl text-[15px] leading-relaxed text-zinc-400">
            VantaDrop is designed for serious token operations: auditable public
            infrastructure, confidential allocation data, and recipient-controlled
            decryption.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {useCases.map((useCase) => (
            <GradientCard key={useCase.title} className="p-6">
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.10] bg-white/[0.05] text-cyan-300">
                V
              </div>
              <h3 className="text-[15px] font-semibold text-white">{useCase.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-zinc-400">
                {useCase.detail}
              </p>
            </GradientCard>
          ))}
        </div>
      </section>

      <section className="proof-band">
        <div className="page-section">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <SectionLabel>Privacy model</SectionLabel>
              <h2 className="mt-3 text-[clamp(34px,4vw,66px)] font-semibold leading-[0.96] tracking-[-0.07em] text-white">
                The registry is public. The allocation data is not.
              </h2>
              <p className="mt-5 text-[15px] leading-relaxed text-zinc-400">
                VantaDropRegistry stores only public metadata. It never stores recipient
                lists, allocation amounts, notes, claim signatures, handles, or proofs.
                Claim material is stored in the encrypted Claim Vault and released only
                after wallet-ownership verification for the matching recipient.
              </p>
            </div>
            <PrivacyPanel />
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <SectionLabel>Workflow</SectionLabel>
            <h2 className="mt-3 text-[clamp(34px,4vw,66px)] font-semibold leading-[0.96] tracking-[-0.07em] text-white">
              Sender timeline to recipient proof.
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-zinc-400">
              The flow is explicit because privacy is the product. Every public fact is
              separated from private claim material, and every live action remains
              behind a user click.
            </p>
          </div>
          <Timeline items={workflow} />
        </div>
      </section>

      <section className="proof-band">
        <div className="page-section">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <SectionLabel>Proof, not promises</SectionLabel>
              <h2 className="mt-3 text-[clamp(34px,4vw,66px)] font-semibold leading-[0.96] tracking-[-0.07em] text-white">
                Judge the project from public Sepolia evidence.
              </h2>
            </div>
            <Link href="/verification" className="btn-secondary">
              Open Verification
            </Link>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <GradientCard className="p-6">
              <h3 className="text-[15px] font-semibold text-white">Contracts</h3>
              <div className="mt-5 grid gap-3 text-[13px]">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-500">VantaDropRegistry</span>
                  <AddressLink address={REGISTRY_ADDRESS} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-500">TokenOps factory</span>
                  <AddressLink address={TOKENOPS_AIRDROP_FACTORY} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-500">CTTT token</span>
                  <AddressLink address={CTTT_TOKEN_ADDRESS} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-500">Demo airdrop clone</span>
                  <AddressLink address={DEMO.airdropClone} />
                </div>
              </div>
            </GradientCard>
            <GradientCard className="p-6">
              <h3 className="text-[15px] font-semibold text-white">Live transactions</h3>
              <div className="mt-5 grid gap-3 text-[13px]">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-500">Mint confidential CTTT</span>
                  <TxLink hash={TX.mintConfidential} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-500">Create + fund airdrop</span>
                  <TxLink hash={TX.createAndFundConfidentialAirdrop} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-500">Grant decrypt access</span>
                  <TxLink hash={TX.getClaimAmount} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-500">Claim allocation</span>
                  <TxLink hash={TX.claim} />
                </div>
              </div>
            </GradientCard>
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <SectionLabel>Demo guide</SectionLabel>
            <h2 className="mt-3 text-[clamp(34px,4vw,66px)] font-semibold leading-[0.96] tracking-[-0.07em] text-white">
              Three public surfaces for the complete story.
            </h2>
          </div>
          <p className="max-w-xl text-[15px] leading-relaxed text-zinc-400">
            Start with the sender console, inspect the distribution room, then run the
            recipient-side decrypt and claim portal. Live transaction buttons remain
            explicit; nothing auto-executes.
          </p>
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {demoGuide.map((item) => (
            <GradientCard key={item.href} className="p-6">
              <h3 className="text-xl font-semibold tracking-tight text-white">
                {item.title}
              </h3>
              <p className="mt-3 min-h-20 text-[14px] leading-relaxed text-zinc-400">
                {item.detail}
              </p>
              <Link href={item.href} className="btn-secondary mt-6">
                Open
              </Link>
            </GradientCard>
          ))}
        </div>
      </section>

      <section className="page-section pt-0">
        <div className="final-cta-panel p-8 text-center md:p-12">
          <SectionLabel>Ready for review</SectionLabel>
          <h2 className="mx-auto mt-3 max-w-4xl text-[clamp(36px,5vw,76px)] font-semibold leading-[0.96] tracking-[-0.075em] text-white">
            Confidential allocation data. Public settlement proof.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-zinc-400">
            VantaDrop keeps the sensitive parts out of the registry and lets the chain
            prove the parts that should be public.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/create" className="btn-primary">
              Create Distribution
            </Link>
            <Link href="/verification" className="btn-secondary">
              Verify the Build
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
