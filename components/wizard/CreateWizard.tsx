"use client";

import { useMemo, useState } from "react";
import { isAddress } from "viem";
import { CTTT_DECIMALS, CTTT_TOKEN_ADDRESS } from "../../lib/constants";
import { Badge, Card } from "../ui";
import { PrivacyModel } from "../PrivacyModel";
import { WalletStatusBar } from "../wallet/WalletStatusBar";
import { ExecuteStep } from "./ExecuteStep";
import { RecipientsStep, useCsvParse } from "./RecipientsStep";
import { DISTRIBUTION_TYPES, WIZARD_STEPS, type WizardState } from "./types";

export function CreateWizard() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    typeId: null,
    title: "",
    tokenAddress: CTTT_TOKEN_ADDRESS,
    csvText: "",
  });
  const [copied, setCopied] = useState(false);

  const parsed = useCsvParse(state.csvText);
  const tokenValid = isAddress(state.tokenAddress.trim(), { strict: false });
  const selectedType = DISTRIBUTION_TYPES.find((t) => t.id === state.typeId) ?? null;

  const canProceed = useMemo(() => {
    switch (step) {
      case 0:
        // Title is required here because it becomes the PUBLIC on-chain
        // registry title at execution (ExecuteStep step 9).
        return state.typeId !== null && state.title.trim().length > 0;
      case 1:
        return tokenValid;
      case 2:
        return parsed.validCount >= 1 && parsed.errorCount === 0;
      default:
        return true;
    }
  }, [step, state.typeId, state.title, tokenValid, parsed.validCount, parsed.errorCount]);

  const shareLink = "/recipient/demo";

  async function copyShareLink() {
    try {
      const absolute =
        typeof window !== "undefined" ? `${window.location.origin}${shareLink}` : shareLink;
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions/insecure context) — leave the link visible for manual copy.
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="mb-2 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Create distribution
        </h1>
        <Badge tone="neutral">Sepolia</Badge>
      </div>
      <p className="mb-6 text-sm text-zinc-500">
        Six steps. Recipient data stays in your browser — at execution only encrypted
        handles and public metadata go on-chain.
      </p>

      {/* Wallet + network status (ExecuteStep renders its own copy on step 4) */}
      {step !== 4 && (
        <div className="mb-8">
          <WalletStatusBar />
        </div>
      )}

      {/* ---------------- Stepper ---------------- */}
      <ol className="mb-10 flex flex-wrap items-center gap-2">
        {WIZARD_STEPS.map((label, i) => {
          const isDone = i < step;
          const isCurrent = i === step;
          return (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  // Free navigation backwards; forward only through Continue.
                  if (i < step) setStep(i);
                }}
                disabled={i > step}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
                  isCurrent
                    ? "border-violet-500/50 bg-violet-500/15 text-violet-200"
                    : isDone
                      ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-300 hover:bg-emerald-500/[0.14]"
                      : "border-white/[0.07] bg-white/[0.02] text-zinc-600"
                }`}
              >
                <span className="font-mono">{isDone ? "✓" : i + 1}</span>
                {label}
              </button>
              {i < WIZARD_STEPS.length - 1 && (
                <span className="hidden h-px w-4 bg-white/10 sm:block" />
              )}
            </li>
          );
        })}
      </ol>

      {/* ---------------- Step content ---------------- */}
      <div className="min-h-[360px]">
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Choose distribution type</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Every type runs the same confidential flow — the choice sets the framing, not
                the mechanics.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DISTRIBUTION_TYPES.map((t) => {
                const selected = state.typeId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setState((s) => ({ ...s, typeId: t.id }))}
                    className={`rounded-xl border p-4 text-left transition ${
                      selected
                        ? "border-violet-500/60 bg-violet-500/[0.08] ring-1 ring-violet-500/40"
                        : "border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="text-lg text-violet-300">{t.icon}</span>
                    <h3 className="mt-2 text-sm font-semibold text-white">{t.label}</h3>
                    <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                      {t.description}
                    </p>
                  </button>
                );
              })}
            </div>
            <Card className="p-5">
              <label
                htmlFor="distribution-title"
                className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500"
              >
                Distribution title
              </label>
              <input
                id="distribution-title"
                value={state.title}
                onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
                placeholder="e.g. Genesis contributor round"
                maxLength={120}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-[14px] text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
              />
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
                <span className="text-amber-300/90">Public:</span> the title and the
                distribution type above are written on-chain to VantaDropRegistry at
                execution. Do not put recipient names or amounts in the title —
                recipients and amounts never go on-chain.
              </p>
            </Card>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Select confidential token</h2>
              <p className="mt-1 text-sm text-zinc-500">
                The token must implement ERC-7984 (confidential balances). Default is CTTT, the
                TokenOps confidential test token proven in the demo run.
              </p>
            </div>
            <Card className="p-5">
              <label
                htmlFor="token-address"
                className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500"
              >
                ERC-7984 token address
              </label>
              <input
                id="token-address"
                value={state.tokenAddress}
                onChange={(e) => setState((s) => ({ ...s, tokenAddress: e.target.value }))}
                spellCheck={false}
                className={`w-full rounded-lg border bg-black/30 px-4 py-3 font-mono text-[13px] text-zinc-200 focus:outline-none ${
                  tokenValid
                    ? "border-white/10 focus:border-violet-500/50"
                    : "border-rose-500/50 focus:border-rose-500/70"
                }`}
              />
              {!tokenValid && (
                <p className="mt-2 text-[13px] text-rose-300">
                  Not a valid hex address (expected 0x followed by 40 hex characters).
                </p>
              )}
              {tokenValid &&
                state.tokenAddress.trim().toLowerCase() === CTTT_TOKEN_ADDRESS.toLowerCase() && (
                  <p className="mt-2 flex items-center gap-2 text-[13px] text-emerald-300">
                    <Badge tone="proven">Proven live</Badge> CTTT — used in the verified Sepolia
                    demo run ({CTTT_DECIMALS} decimals).
                  </p>
                )}
              {tokenValid &&
                state.tokenAddress.trim().toLowerCase() !== CTTT_TOKEN_ADDRESS.toLowerCase() && (
                  <p className="mt-2 text-[13px] text-zinc-500">
                    Format looks valid. On-chain ERC-7984 interface verification runs at
                    execution time — the frontend is not yet wired to a live wallet, so no
                    contract call is made here.
                  </p>
                )}
              <button
                type="button"
                onClick={() => setState((s) => ({ ...s, tokenAddress: CTTT_TOKEN_ADDRESS }))}
                className="mt-4 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] font-medium text-zinc-200 transition hover:bg-white/10"
              >
                Use CTTT (default)
              </button>
            </Card>
          </div>
        )}

        {step === 2 && (
          <RecipientsStep
            csvText={state.csvText}
            onChange={(csvText) => setState((s) => ({ ...s, csvText }))}
            parsed={parsed}
          />
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Review privacy model</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Exactly what this distribution reveals — and what it never does.
              </p>
            </div>
            <PrivacyModel />
          </div>
        )}

        {step === 4 && (
          // Live issuer flow — real Sepolia transactions. All gating,
          // warnings, the burner checkbox, the execution timeline, and the
          // result screen live in ExecuteStep.
          <ExecuteStep state={state} parsed={parsed} selectedType={selectedType} />
        )}

        {step === 5 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Share recipient portal link</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Each distribution gets a portal link where recipients connect, decrypt their own
                allocation, and claim. This is the pattern — pointing at the live demo portal.
              </p>
            </div>
            <Card className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <code className="flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-4 py-3 font-mono text-[13px] text-violet-200">
                  {shareLink}
                </code>
                <button
                  type="button"
                  onClick={copyShareLink}
                  className="rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110"
                >
                  {copied ? "Copied ✓" : "Copy link"}
                </button>
              </div>
              <p className="mt-3 text-[13px] text-zinc-500">
                Live distributions will use per-drop links (e.g.{" "}
                <span className="font-mono">/recipient/&lt;distribution-id&gt;</span>). The demo
                portal shows the full recipient flow backed by the proven Sepolia run.
              </p>
            </Card>
          </div>
        )}
      </div>

      {/* ---------------- Navigation ---------------- */}
      <div className="mt-10 flex items-center justify-between border-t border-white/[0.06] pt-6">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Back
        </button>
        {step < WIZARD_STEPS.length - 1 ? (
          <div className="flex items-center gap-3">
            {!canProceed && step === 2 && parsed.rows.length > 0 && (
              <span className="text-[13px] text-amber-300">
                Fix the rows marked with errors to continue.
              </span>
            )}
            <button
              type="button"
              onClick={() => canProceed && setStep((s) => s + 1)}
              disabled={!canProceed}
              className="rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue →
            </button>
          </div>
        ) : (
          <span className="text-[13px] text-zinc-500">End of wizard — state kept in session.</span>
        )}
      </div>
    </div>
  );
}
