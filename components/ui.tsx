import type { ReactNode } from "react";
import { etherscanAddress, etherscanTx, shortHex } from "../lib/constants";

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

export type BadgeTone = "proven" | "demo" | "pending" | "neutral" | "confidential";

const badgeTones: Record<BadgeTone, string> = {
  proven: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  demo: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  neutral: "border-white/10 bg-white/5 text-zinc-300",
  confidential: "border-violet-500/30 bg-violet-500/10 text-violet-300",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Dot({ className = "bg-emerald-400" }: { className?: string }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${className}`} />;
}

export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return <Badge tone={tone}>{children}</Badge>;
}

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`surface-card border border-white/[0.08] bg-white/[0.025] ${className}`}
    >
      {children}
    </div>
  );
}

export function GradientCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`gradient-card ${className}`}>{children}</div>;
}

export function ProofCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`proof-card ${className}`}>{children}</div>;
}

export type TimelineItem = {
  title: string;
  detail?: ReactNode;
  status?: "done" | "current" | "pending" | "error";
  meta?: ReactNode;
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="grid gap-3">
      {items.map((item, index) => {
        const status = item.status ?? "pending";
        const tone =
          status === "done"
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            : status === "error"
              ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
              : status === "current"
                ? "border-violet-500/50 bg-violet-500/15 text-violet-200"
                : "border-white/10 bg-white/5 text-zinc-500";
        return (
          <li key={`${item.title}-${index}`} className="flow-step">
            <span className={`flow-num border ${tone}`}>
              {status === "done" ? "OK" : index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-white">
                {item.title}
              </span>
              {item.detail && (
                <span className="mt-1 block text-[12px] leading-relaxed text-zinc-500">
                  {item.detail}
                </span>
              )}
            </span>
            {item.meta && <span className="text-[12px] text-zinc-500">{item.meta}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Etherscan links                                                     */
/* ------------------------------------------------------------------ */

function ExternalIcon() {
  return (
    <svg
      className="h-3 w-3 shrink-0 opacity-60"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4.5 2H2.5A1.5 1.5 0 0 0 1 3.5v6A1.5 1.5 0 0 0 2.5 11h6A1.5 1.5 0 0 0 10 9.5V7.5M7 1h4m0 0v4m0-4L5.5 6.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AddressLink({ address, label }: { address: string; label?: string }) {
  return (
    <a
      href={etherscanAddress(address)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 font-mono text-[13px] text-zinc-300 underline decoration-white/20 underline-offset-4 transition hover:text-white hover:decoration-white/50"
      title={address}
    >
      {label ?? shortHex(address)}
      <ExternalIcon />
    </a>
  );
}

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  return (
    <a
      href={etherscanTx(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 font-mono text-[13px] text-zinc-300 underline decoration-white/20 underline-offset-4 transition hover:text-white hover:decoration-white/50"
      title={hash}
    >
      {label ?? shortHex(hash)}
      <ExternalIcon />
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Small layout helpers                                                */
/* ------------------------------------------------------------------ */

export function KeyValueRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-white/[0.05] py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="text-sm text-zinc-200">{children}</span>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400/80">
      {children}
    </p>
  );
}
