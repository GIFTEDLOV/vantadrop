import { GradientCard } from "./ui";

const publicItems = [
  "Distribution title and use case",
  "Token address and TokenOps clone address",
  "Sender address, timestamps, transaction hashes",
  "Recipient count in VantaDropRegistry",
];

const privateItems = [
  "Recipient list and private notes",
  "Plaintext allocation amounts",
  "Claim signatures and encrypted input capsules",
  "Full handles, proofs, and recipient-specific claim material",
];

export function PrivacyPanel() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GradientCard className="p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">
          Public surface
        </p>
        <h3 className="mt-3 text-xl font-semibold tracking-tight text-white">
          Verifiable metadata only
        </h3>
        <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">
          The registry is intentionally narrow: it records public metadata needed for
          discovery and judging, not recipient-specific claim material.
        </p>
        <div className="mt-5 grid gap-2">
          {publicItems.map((item) => (
            <div
              key={item}
              className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-[13px] text-zinc-300"
            >
              {item}
            </div>
          ))}
        </div>
      </GradientCard>

      <GradientCard className="border-violet-500/30 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
          Confidential surface
        </p>
        <h3 className="mt-3 text-xl font-semibold tracking-tight text-white">
          Claim Vault capsules and encrypted allocations
        </h3>
        <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">
          Claim material is stored in encrypted backend capsules for wallet discovery.
          Recipients decrypt only their own allocation after explicit wallet actions.
        </p>
        <div className="mt-5 grid gap-2">
          {privateItems.map((item) => (
            <div
              key={item}
              className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-[13px] text-zinc-300"
            >
              {item}
            </div>
          ))}
        </div>
      </GradientCard>
    </div>
  );
}
