import { Card } from "./ui";

/**
 * Two-column "public vs confidential" breakdown of exactly what a VantaDrop
 * distribution reveals on-chain vs what stays encrypted or never leaves the
 * browser. Shared by the wizard's privacy-review step and /drop/demo.
 */

const publicItems: { title: string; detail: string }[] = [
  {
    title: "The distribution exists",
    detail: "Anyone can see that a confidential airdrop contract was created and funded.",
  },
  {
    title: "Sender address",
    detail: "The admin wallet that created and funded the distribution is visible on-chain.",
  },
  {
    title: "Token address",
    detail: "The ERC-7984 confidential token being distributed is a public contract address.",
  },
  {
    title: "Registry metadata",
    detail:
      "Title, use case, and recipient count — the VantaDropRegistry stores only this. It has no function or field for recipient lists or amounts.",
  },
  {
    title: "TokenOps clone address",
    detail: "The per-distribution ConfidentialAirdropCloneable contract address is public.",
  },
  {
    title: "Transaction hashes",
    detail: "Create, fund, and claim transactions are ordinary public Sepolia transactions.",
  },
];

const confidentialItems: { title: string; detail: string }[] = [
  {
    title: "Individual recipient allocations",
    detail:
      "Every amount is FHE-encrypted (euint64). No observer — not even VantaDrop — can read them on-chain.",
  },
  {
    title: "Private notes",
    detail:
      "The CSV note column never leaves your browser. It is never written on-chain, never sent to the registry, never sent to any server.",
  },
  {
    title: "CSV contents",
    detail:
      "Your recipient list is processed entirely client-side. Only encrypted per-recipient handles ever reach the chain.",
  },
  {
    title: "Encrypted claim details",
    detail:
      "Claim authorizations bind an encrypted handle to a recipient; the handle reveals nothing about the amount.",
  },
  {
    title: "Amounts until self-decryption",
    detail:
      "An allocation stays ciphertext until the recipient — and only the recipient — grants themselves ACL access and decrypts it with their own key.",
  },
];

function CheckIcon({ className }: { className: string }) {
  return (
    <svg className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeOpacity="0.35" />
      <path d="M5 8.2l2 2 4-4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon({ className }: { className: string }) {
  return (
    <svg className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeOpacity="0.9" />
      <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function PrivacyModel() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-sky-300">
            What becomes public
          </h3>
        </div>
        <ul className="space-y-4">
          {publicItems.map((item) => (
            <li key={item.title} className="flex gap-3">
              <CheckIcon className="text-sky-400" />
              <div>
                <p className="text-sm font-medium text-zinc-200">{item.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-500">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="border-violet-500/20 bg-violet-500/[0.03] p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-violet-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-violet-300">
            What stays confidential
          </h3>
        </div>
        <ul className="space-y-4">
          {confidentialItems.map((item) => (
            <li key={item.title} className="flex gap-3">
              <LockIcon className="text-violet-400" />
              <div>
                <p className="text-sm font-medium text-zinc-200">{item.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-500">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
