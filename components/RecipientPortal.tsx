"use client";

/**
 * Public recipient portal — the productized recipient decrypt/claim flow
 * (/recipient/demo).
 *
 * This replaces the previous demo/walkthrough page with the real thing: the
 * five recipient-side service functions from lib/tokenops/recipient.ts —
 * checkRecipientEligibility, grantDecryptAccess, decryptAllocationHandle,
 * claimAllocation, verifyPostClaimBalance — wired behind real, manually
 * triggered buttons. That exact sequence was proven live on Sepolia on
 * 2026-07-05 via the hidden developer diagnostic
 * (/dev/recipient-claim-diagnostic — see
 * docs/research/browser-tokenops-integration.md "Live browser recipient
 * decrypt/claim result": eligibility passed, getClaimAmount tx, decrypted
 * 5 CTTT, claim tx, post-claim balance verified 5 CTTT). This page wires the
 * same proven functions into product-grade UX; THIS page's own buttons have
 * not themselves been clicked live yet (honesty distinction tracked on
 * /verification).
 *
 * PRIVACY / DATA-HANDLING RULES (load-bearing, same discipline as the
 * diagnostic):
 * - The imported claim package contains a real recipient wallet, a real
 *   plaintext allocation amount, and a real single-use EIP-712 claim
 *   authorization. It lives ONLY in React component state (plain in-memory
 *   useState) — never localStorage, never sessionStorage, never any server,
 *   never the registry, and it disappears on refresh. sessionStorage was
 *   considered and rejected: connecting an injected wallet does not navigate
 *   away from this page, so there is no redirect to survive and therefore no
 *   UX reason to widen the persistence surface beyond the diagnostic's
 *   proven in-memory precedent.
 * - NOTHING on this page calls console.log/warn/error. The claim signature,
 *   input proof, and plaintext amount must never reach the console.
 * - Raw claim material is hidden by default (Task: product UX, not a
 *   developer dump). The optional "Advanced details" disclosure shows only
 *   TRUNCATED values (shortHex) and byte counts — never the full signature
 *   or proof bytes. The decrypted allocation IS shown on screen: it is the
 *   recipient's own number, shown only to them, only in their browser —
 *   that is the entire point of the flow.
 *
 * PACKAGE FORMAT: recipients[].encryptedInput is required here.
 * lib/distribution.ts made it a required field on 2026-07-05 and every
 * package produced by the current /create flow includes it automatically.
 * Unlike the diagnostic (which keeps a manual-paste fallback for pre-fix
 * packages), this forward-looking product page rejects pre-fix packages
 * with a specific error — see lib/distribution-import.ts.
 *
 * BUTTON GATING (mirrors the diagnostic's documented, proven choices):
 * every action requires ALL base gates (wallet connected on Sepolia +
 * package valid + connected wallet matches a recipient + claim material
 * resolved + single-use acknowledgement checked), enforced both as real
 * `disabled` attributes and as in-handler refusals. Sequentially:
 *   - Grant (paid) requires a successful eligibility check — never sent blind.
 *   - Decrypt requires Grant — hard data dependency on the granted handle.
 *   - Claim requires eligibility but deliberately NOT decrypt: the decrypt
 *     preview is optional and a Zama relayer outage must not block an
 *     otherwise-valid claim. The claim handler additionally refuses when the
 *     latest eligibility check reported the signature invalid or preflight
 *     blocked, or when the wallet changed since that check ran.
 *   - Verify requires a successful claim.
 */

import { useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { formatEther } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";
import type { EncryptedInput } from "@tokenops/sdk/fhe-airdrop";
import {
  AddressLink,
  Badge,
  Card,
  KeyValueRow,
  SectionLabel,
  TxLink,
} from "./ui";
import { WalletStatusBar } from "./wallet/WalletStatusBar";
import { useSepoliaWallet } from "./wallet/hooks";
import {
  CTTT_DECIMALS,
  CTTT_SYMBOL,
  CTTT_TOKEN_ADDRESS,
  SEPOLIA_CHAIN_ID,
  shortHex,
} from "../lib/constants";
import { formatRawUnits, toRawUnits } from "../lib/csv";
import {
  describeRecipientActionError,
  matchRecipient,
  resolveClaimMaterial,
  validateDistributionPackage,
  type PackageValidation,
} from "../lib/distribution-import";
import { getBrowserFheBundle } from "../lib/tokenops/browser";
import {
  checkRecipientEligibility,
  claimAllocation,
  createAirdropClient,
  decryptAllocationHandle,
  grantDecryptAccess,
  verifyPostClaimBalance,
  type EligibilityResult,
} from "../lib/tokenops/recipient";

/* ------------------------------------------------------------------ */
/* Per-action state machines                                            */
/* ------------------------------------------------------------------ */

type EligState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "success"; result: EligibilityResult; caller: Address }
  | { phase: "error"; message: string };

type GrantState =
  | { phase: "idle" }
  | { phase: "pending" }
  | { phase: "success"; handle: Hex; hash: Hex; caller: Address }
  | { phase: "error"; message: string };

type DecryptState =
  | { phase: "idle" }
  | { phase: "running" }
  | {
      phase: "success";
      valueRaw: bigint;
      expectedRaw?: bigint;
      /** Real computed comparison — undefined when no expectation could be derived. */
      matches?: boolean;
    }
  | { phase: "error"; message: string };

type ClaimState =
  | { phase: "idle" }
  | { phase: "pending" }
  | { phase: "success"; hash: Hex }
  | { phase: "error"; message: string };

type VerifyState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "success"; balanceRaw: bigint }
  | { phase: "error"; message: string };

type StepStatus = "todo" | "running" | "done" | "error";

const primaryButtonClass =
  "rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40";

/** Claim gets distinct, heavier styling — it is the one irreversible action. */
const claimButtonClass =
  "rounded-lg border-2 border-rose-500/60 bg-rose-500/15 px-5 py-3 text-sm font-bold text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-40";

function StepDot({ status, index }: { status: StepStatus; index: number }) {
  const cls =
    status === "done"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : status === "error"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
        : status === "running"
          ? "border-violet-500/50 bg-violet-500/15 text-violet-200"
          : "border-white/10 bg-white/5 text-zinc-500";
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] ${cls}`}
    >
      {status === "done" ? "✓" : status === "error" ? "✕" : status === "running" ? "…" : index}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export function RecipientPortal() {
  const wallet = useSepoliaWallet();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // ---- Imported claim material: PLAIN COMPONENT STATE ONLY. -----------
  // Never mirrored to any storage, never sent anywhere, never logged.
  // Gone on refresh — by design (see file header).
  const [packageText, setPackageText] = useState("");
  const [validation, setValidation] = useState<PackageValidation | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [ack, setAck] = useState(false);
  const [elig, setElig] = useState<EligState>({ phase: "idle" });
  const [grant, setGrant] = useState<GrantState>({ phase: "idle" });
  const [decrypt, setDecrypt] = useState<DecryptState>({ phase: "idle" });
  const [claim, setClaim] = useState<ClaimState>({ phase: "idle" });
  const [verify, setVerify] = useState<VerifyState>({ phase: "idle" });

  /* ---------------- Package import ---------------------------------- */

  function handlePackageChange(text: string) {
    setPackageText(text);
    // A changed package invalidates every downstream result — old results
    // described a different package. Honest reset.
    setElig({ phase: "idle" });
    setGrant({ phase: "idle" });
    setDecrypt({ phase: "idle" });
    setClaim({ phase: "idle" });
    setVerify({ phase: "idle" });

    if (text.trim().length === 0) {
      setValidation(undefined);
      return;
    }
    setValidation(validateDistributionPackage(text));
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Allow choosing the same file again later.
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") handlePackageChange(reader.result);
    };
    reader.readAsText(file);
  }

  const pkg = validation?.ok ? validation.pkg : undefined;
  const matched = pkg ? matchRecipient(pkg, wallet.address) : undefined;
  const walletMismatch = !!pkg && !!wallet.address && !matched;
  const claimMaterial = matched ? resolveClaimMaterial(matched) : undefined;
  const encryptedInput: EncryptedInput | undefined = claimMaterial?.ok
    ? claimMaterial.input
    : undefined;

  const walletReady = wallet.isConnected && wallet.isOnSepolia && !!wallet.address;
  const packageReady = !!pkg && !!matched && !!encryptedInput;
  const busy =
    elig.phase === "running" ||
    grant.phase === "pending" ||
    decrypt.phase === "running" ||
    claim.phase === "pending" ||
    verify.phase === "running";

  // ALL action buttons require every one of these — real `disabled`
  // attributes below AND in-handler refusals (belt and braces).
  const gatesOk =
    walletReady && !!publicClient && !!walletClient && packageReady && ack;

  const tokenIsCttt = pkg?.token.toLowerCase() === CTTT_TOKEN_ADDRESS.toLowerCase();

  function formatAmount(raw: bigint): string {
    return tokenIsCttt
      ? `${formatRawUnits(raw, CTTT_DECIMALS)} ${CTTT_SYMBOL}`
      : `${raw.toString()} raw token units`;
  }

  function refusalMessage(): string | undefined {
    if (!walletReady) return "Connect your wallet on Sepolia first.";
    if (!publicClient || !walletClient)
      return "Wallet client not ready — reconnect your wallet.";
    if (!pkg) return "Import a valid claim package first.";
    if (!matched) return "The connected wallet is not the recipient for this package.";
    if (!encryptedInput)
      return "The package's encrypted claim input is missing or failed validation.";
    if (!ack) return "Confirm the single-use acknowledgement checkbox first.";
    return undefined;
  }

  /* ---------------- Action 1 — check eligibility (free) -------------- */

  async function handleCheckEligibility() {
    if (busy) return;
    const refusal = refusalMessage();
    if (refusal || !pkg || !matched || !encryptedInput || !publicClient || !wallet.address) {
      setElig({ phase: "error", message: refusal ?? "Prerequisites not met." });
      return;
    }
    setElig({ phase: "running" });
    try {
      const client = createAirdropClient({
        publicClient,
        walletClient,
        airdropAddress: pkg.tokenOpsAirdrop,
      });
      const result = await checkRecipientEligibility({
        client,
        caller: wallet.address,
        encryptedAmountHandle: encryptedInput.handle,
        signature: matched.claimAuthorization,
      });
      setElig({ phase: "success", result, caller: wallet.address });
    } catch (error) {
      setElig({ phase: "error", message: describeRecipientActionError(error) });
    }
  }

  /* ---------------- Action 2 — grant decrypt access (paid tx) -------- */

  async function handleGrantAccess() {
    if (busy) return;
    const refusal = refusalMessage();
    if (refusal || !pkg || !matched || !encryptedInput || !publicClient || !walletClient || !wallet.address) {
      setGrant({ phase: "error", message: refusal ?? "Prerequisites not met." });
      return;
    }
    if (elig.phase !== "success") {
      setGrant({
        phase: "error",
        message: "Check your eligibility first — this step sends a real transaction and should not run blind.",
      });
      return;
    }
    if (elig.caller.toLowerCase() !== wallet.address.toLowerCase()) {
      setGrant({
        phase: "error",
        message: "Your connected wallet changed since the eligibility check — re-run it first.",
      });
      return;
    }
    setGrant({ phase: "pending" });
    try {
      const client = createAirdropClient({
        publicClient,
        walletClient,
        airdropAddress: pkg.tokenOpsAirdrop,
      });
      const result = await grantDecryptAccess({
        client,
        encryptedInput,
        signature: matched.claimAuthorization,
      });
      setGrant({
        phase: "success",
        handle: result.handle,
        hash: result.hash,
        caller: wallet.address,
      });
    } catch (error) {
      setGrant({ phase: "error", message: describeRecipientActionError(error) });
    }
  }

  /* ---------------- Action 3 — decrypt allocation (free) ------------- */

  async function handleDecrypt() {
    if (busy) return;
    const refusal = refusalMessage();
    if (refusal || !pkg || !matched || !publicClient || !walletClient || !wallet.address) {
      setDecrypt({ phase: "error", message: refusal ?? "Prerequisites not met." });
      return;
    }
    if (grant.phase !== "success") {
      setDecrypt({
        phase: "error",
        message: "Grant decrypt access first — decryption uses the access that transaction grants.",
      });
      return;
    }
    if (grant.caller.toLowerCase() !== wallet.address.toLowerCase()) {
      setDecrypt({
        phase: "error",
        message: "Your connected wallet changed since access was granted — reconnect the recipient wallet.",
      });
      return;
    }
    setDecrypt({ phase: "running" });
    try {
      const bundle = getBrowserFheBundle({ publicClient, walletClient });
      const valueRaw = await decryptAllocationHandle({
        zama: bundle.zama,
        handle: grant.handle,
        airdropAddress: pkg.tokenOpsAirdrop,
        // One permit signature also covers the post-claim balance decrypt.
        alsoAllowContracts: [pkg.token],
      });
      // Real computed comparison against the package's plaintext amount —
      // only asserted when the token is CTTT (known 6 decimals).
      let expectedRaw: bigint | undefined;
      if (tokenIsCttt && /^\d+(\.\d+)?$/.test(matched.amount)) {
        expectedRaw = toRawUnits(matched.amount, CTTT_DECIMALS);
      }
      const matches = expectedRaw !== undefined ? valueRaw === expectedRaw : undefined;
      setDecrypt({ phase: "success", valueRaw, expectedRaw, matches });
    } catch (error) {
      setDecrypt({ phase: "error", message: describeRecipientActionError(error) });
    }
  }

  /* ---------------- Action 4 — CLAIM (paid tx, single-use) ----------- */

  async function handleClaim() {
    if (busy) return;
    const refusal = refusalMessage();
    if (refusal || !pkg || !matched || !encryptedInput || !publicClient || !walletClient || !wallet.address) {
      setClaim({ phase: "error", message: refusal ?? "Prerequisites not met." });
      return;
    }
    if (elig.phase !== "success") {
      setClaim({
        phase: "error",
        message: "Check your eligibility first. The claim can only be used once — it is never sent blind.",
      });
      return;
    }
    if (elig.caller.toLowerCase() !== wallet.address.toLowerCase()) {
      setClaim({
        phase: "error",
        message: "Your connected wallet changed since the eligibility check — re-run it first.",
      });
      return;
    }
    // Refuse a send the latest eligibility check says is doomed — the
    // authorization survives a revert but the gas does not, and a blocked
    // preflight usually means already-claimed or window-closed.
    if (!elig.result.signatureValid) {
      setClaim({
        phase: "error",
        message:
          "The latest eligibility check reported this claim invalid for your wallet (already claimed, window inactive, or wrong wallet). Re-run the check if anything changed.",
      });
      return;
    }
    if (!elig.result.preflight.ready) {
      setClaim({
        phase: "error",
        message: "The latest eligibility check reported blockers. Resolve them and re-run the check.",
      });
      return;
    }
    setClaim({ phase: "pending" });
    try {
      const client = createAirdropClient({
        publicClient,
        walletClient,
        airdropAddress: pkg.tokenOpsAirdrop,
      });
      // `value` omitted — the SDK attaches the clone's gasFee() automatically.
      const hash = await claimAllocation({
        client,
        encryptedInput,
        signature: matched.claimAuthorization,
      });
      setClaim({ phase: "success", hash });
    } catch (error) {
      setClaim({ phase: "error", message: describeRecipientActionError(error) });
    }
  }

  /* ---------------- Action 5 — verify balance (free) ----------------- */

  async function handleVerify() {
    if (busy) return;
    const refusal = refusalMessage();
    if (refusal || !pkg || !publicClient || !walletClient || !wallet.address) {
      setVerify({ phase: "error", message: refusal ?? "Prerequisites not met." });
      return;
    }
    if (claim.phase !== "success") {
      setVerify({
        phase: "error",
        message: "This verifies your balance after claiming — claim your allocation first.",
      });
      return;
    }
    setVerify({ phase: "running" });
    try {
      const bundle = getBrowserFheBundle({ publicClient, walletClient });
      const balanceRaw = await verifyPostClaimBalance({
        zama: bundle.zama,
        tokenAddress: pkg.token,
        owner: wallet.address,
      });
      setVerify({ phase: "success", balanceRaw });
    } catch (error) {
      setVerify({ phase: "error", message: describeRecipientActionError(error) });
    }
  }

  /* ---------------- Step timeline (all 9 steps, live statuses) ------- */

  function actionStatus(
    phase: "idle" | "running" | "pending" | "success" | "error",
  ): StepStatus {
    if (phase === "success") return "done";
    if (phase === "error") return "error";
    if (phase === "running" || phase === "pending") return "running";
    return "todo";
  }

  const validateStatus: StepStatus =
    packageReady
      ? "done"
      : (validation && !validation.ok) ||
          walletMismatch ||
          (claimMaterial && !claimMaterial.ok)
        ? "error"
        : "todo";

  const steps: { label: string; status: StepStatus; note?: string }[] = [
    { label: "Connect wallet", status: wallet.isConnected ? "done" : "todo" },
    { label: "Switch to Sepolia", status: wallet.isOnSepolia ? "done" : "todo" },
    {
      label: "Import claim package",
      status: packageText.trim().length > 0 ? "done" : "todo",
    },
    { label: "Validate package", status: validateStatus },
    { label: "Check eligibility", status: actionStatus(elig.phase), note: "free" },
    {
      label: "Grant decrypt access",
      status: actionStatus(grant.phase),
      note: "1 transaction",
    },
    {
      label: "Decrypt allocation",
      status: actionStatus(decrypt.phase),
      note: "free · optional preview",
    },
    {
      label: "Claim allocation",
      status: actionStatus(claim.phase),
      note: "1 transaction · single-use",
    },
    {
      label: "Verify confidential balance",
      status: actionStatus(verify.phase),
      note: "free",
    },
  ];

  const claimComplete = claim.phase === "success" && verify.phase === "success";

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      {/* -------- Header -------- */}
      <SectionLabel>Recipient portal</SectionLabel>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
        Claim your confidential allocation
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
        Someone sent you a confidential token allocation through VantaDrop. Your
        amount is encrypted on-chain — only you can decrypt it, and only you can
        claim it. Import the claim package your sender shared with you, then walk
        through the steps below at your own pace. Nothing runs automatically.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone="confidential">Amounts encrypted end-to-end</Badge>
        <Badge tone="neutral">Sepolia testnet</Badge>
        <Badge tone="pending">Sends real transactions</Badge>
      </div>

      {/* -------- Step timeline -------- */}
      <Card className="mt-8 p-5">
        <h2 className="text-sm font-semibold text-white">Your progress</h2>
        <ol className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.label} className="flex items-center gap-2.5">
              <StepDot status={step.status} index={i + 1} />
              <span className="min-w-0">
                <span
                  className={`block text-[13px] font-medium ${
                    step.status === "done"
                      ? "text-zinc-200"
                      : step.status === "error"
                        ? "text-rose-300"
                        : "text-zinc-400"
                  }`}
                >
                  {step.label}
                </span>
                {step.note && (
                  <span className="block text-[11px] text-zinc-600">{step.note}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      {/* -------- 1 & 2 · Wallet -------- */}
      <div className="mt-10">
        <SectionLabel>Step 1 · Connect on Sepolia</SectionLabel>
        <div className="mt-3">
          <WalletStatusBar />
        </div>
        {!walletReady && (
          <p className="mt-2 text-[13px] text-zinc-500">
            Connect the exact wallet your sender allocated tokens to, on Sepolia
            (chain id {SEPOLIA_CHAIN_ID}). The package below can only be used by
            that wallet.
          </p>
        )}
      </div>

      {/* -------- 3 & 4 · Import + validate package -------- */}
      <div className="mt-10">
        <SectionLabel>Step 2 · Import your claim package</SectionLabel>
        <Card className="mt-3 p-5">
          <p className="text-[14px] font-medium leading-relaxed text-zinc-200">
            Your sender privately shares this claim package with you. It is not
            stored in the public registry.
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
            Paste the package JSON below, or upload the file if your sender sent
            one. It stays in this page&apos;s memory only — it is never uploaded,
            never stored, never logged, and is gone when you refresh.
          </p>

          <textarea
            value={packageText}
            onChange={(e) => handlePackageChange(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder='{"distributionId":"…","network":"Sepolia","chainId":11155111,…}'
            className="mt-4 w-full rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
            aria-label="Claim package JSON"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json,text/plain"
              onChange={handleFileUpload}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[13px] font-medium text-zinc-200 transition hover:bg-white/10"
            >
              Upload JSON file
            </button>
            {packageText.trim().length > 0 && (
              <button
                type="button"
                onClick={() => handlePackageChange("")}
                className="text-[13px] text-zinc-500 underline decoration-white/20 underline-offset-4 transition hover:text-zinc-300"
              >
                Clear
              </button>
            )}
          </div>

          {/* Per-field validation errors — specific, not generic. */}
          {validation && !validation.ok && (
            <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-4">
              <p className="text-[13px] font-semibold text-amber-200">
                This package has {validation.errors.length} problem
                {validation.errors.length === 1 ? "" : "s"}:
              </p>
              <ul className="mt-2 space-y-1.5">
                {validation.errors.map((err) => (
                  <li key={`${err.field}:${err.message}`} className="text-[13px] leading-relaxed text-amber-200/90">
                    <span className="font-mono text-[12px] text-amber-300">{err.field}</span>
                    {" — "}
                    {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Plain, reassuring status lines — raw data hidden by default. */}
          {pkg && (
            <div className="mt-4 border-t border-white/[0.05] pt-3">
              <ul className="space-y-2">
                <li className="flex items-center gap-2.5 text-[13px] text-zinc-300">
                  <Badge tone="proven">✓</Badge> Package loaded — “{pkg.title}”
                </li>
                <li className="flex items-center gap-2.5 text-[13px] text-zinc-300">
                  {!wallet.address ? (
                    <>
                      <Badge tone="neutral">·</Badge>
                      <span className="text-zinc-500">
                        Connect your wallet to check this package is addressed to you
                      </span>
                    </>
                  ) : walletMismatch ? (
                    <>
                      <Badge tone="pending">✕</Badge>
                      <span className="font-medium text-rose-300">
                        Connected wallet is not the recipient for this package.
                      </span>
                    </>
                  ) : (
                    <>
                      <Badge tone="proven">✓</Badge> Recipient matched — this package is
                      addressed to your connected wallet
                    </>
                  )}
                </li>
                {matched && (
                  <>
                    <li className="flex items-center gap-2.5 text-[13px] text-zinc-300">
                      <Badge tone="proven">✓</Badge> Claim authorization present
                    </li>
                    <li className="flex items-center gap-2.5 text-[13px] text-zinc-300">
                      {claimMaterial?.ok ? (
                        <>
                          <Badge tone="proven">✓</Badge> Encrypted input present
                        </>
                      ) : (
                        <>
                          <Badge tone="pending">✕</Badge>
                          <span className="text-amber-300">{claimMaterial?.error}</span>
                        </>
                      )}
                    </li>
                    <li className="flex items-center gap-2.5 text-[13px] text-zinc-300">
                      <Badge tone="confidential">🔒</Badge> Allocation private until you
                      decrypt it
                    </li>
                  </>
                )}
              </ul>

              {/* Optional technical disclosure — truncated values only. */}
              <details className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <summary className="cursor-pointer select-none text-[13px] font-medium text-zinc-400 transition hover:text-zinc-200">
                  Advanced details
                </summary>
                <div className="mt-2">
                  <KeyValueRow label="Distribution title (public)">{pkg.title}</KeyValueRow>
                  <KeyValueRow label="Airdrop contract">
                    <AddressLink address={pkg.tokenOpsAirdrop} />
                  </KeyValueRow>
                  <KeyValueRow label="Token (ERC-7984)">
                    <AddressLink address={pkg.token} />
                  </KeyValueRow>
                  <KeyValueRow label="Network">
                    Sepolia (chain id {pkg.chainId})
                  </KeyValueRow>
                  <KeyValueRow label="Recipients in package">
                    {pkg.recipients.length}
                  </KeyValueRow>
                  {pkg.registryDistributionId !== undefined && (
                    <KeyValueRow label="Registry distribution id">
                      #{pkg.registryDistributionId}
                    </KeyValueRow>
                  )}
                  {matched && (
                    <>
                      <KeyValueRow label="Claim authorization (truncated — never shown in full)">
                        <span className="font-mono text-[12px]">
                          {shortHex(matched.claimAuthorization, 8)}
                        </span>
                      </KeyValueRow>
                      {claimMaterial?.ok && (
                        <>
                          <KeyValueRow label="Encrypted handle (truncated ciphertext id)">
                            <span className="font-mono text-[12px]">
                              {shortHex(claimMaterial.input.handle, 10)}
                            </span>
                          </KeyValueRow>
                          <KeyValueRow label="Input proof">
                            {(claimMaterial.input.inputProof.length - 2) / 2} bytes (raw
                            bytes not displayed)
                          </KeyValueRow>
                          <KeyValueRow label="Package self-check">
                            <span
                              className={
                                claimMaterial.crossCheckNote.startsWith("Cross-check passed")
                                  ? "text-emerald-300"
                                  : "text-amber-300"
                              }
                            >
                              {claimMaterial.crossCheckNote}
                            </span>
                          </KeyValueRow>
                        </>
                      )}
                    </>
                  )}
                </div>
              </details>
            </div>
          )}
        </Card>
      </div>

      {/* -------- Privacy story -------- */}
      <div className="mt-10">
        <SectionLabel>How your privacy works</SectionLabel>
        <Card className="mt-3 border-violet-500/20 bg-violet-500/[0.03] p-5">
          <ul className="space-y-3.5">
            <li className="flex gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
              <p className="text-[13px] leading-relaxed text-zinc-400">
                <span className="font-medium text-zinc-200">
                  The public registry stores only distribution metadata.
                </span>{" "}
                VantaDropRegistry holds the title, use case, token and airdrop
                contract addresses, and a recipient count — nothing else. It has no
                field for recipient lists, amounts, or claim data.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
              <p className="text-[13px] leading-relaxed text-zinc-400">
                <span className="font-medium text-zinc-200">
                  Your claim package was shared privately, out-of-band.
                </span>{" "}
                Your sender delivered it to you directly. This page never uploads it
                anywhere — it lives only in this browser tab&apos;s memory.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
              <p className="text-[13px] leading-relaxed text-zinc-400">
                <span className="font-medium text-zinc-200">
                  The recipient list and allocation amounts are never stored on-chain
                  in plaintext.
                </span>{" "}
                On-chain, your allocation exists only as FHE ciphertext — no
                observer, not even VantaDrop, can read it.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
              <p className="text-[13px] leading-relaxed text-zinc-400">
                <span className="font-medium text-zinc-200">
                  You decrypt only your own allocation.
                </span>{" "}
                Decrypt access is granted to your address alone. You cannot see
                anyone else&apos;s amount, and no one else can see yours.
              </p>
            </li>
          </ul>
        </Card>
      </div>

      {/* -------- Acknowledgement -------- */}
      <div className="mt-10">
        <SectionLabel>Before you act</SectionLabel>
        <Card className="mt-3 p-5">
          <label className="flex cursor-pointer items-start gap-3 text-[14px] text-zinc-200">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-violet-500"
            />
            <span>
              I understand this claim can only be used once.
              <span className="block text-[12px] leading-relaxed text-zinc-500">
                The action buttons below stay disabled until your wallet is connected
                on Sepolia, a valid package addressed to your wallet is imported, and
                this box is checked.
              </span>
            </span>
          </label>
          <p className="mt-4 border-t border-white/[0.05] pt-3 text-[13px] leading-relaxed text-zinc-500">
            Checking eligibility, decrypting, and verifying your balance are free
            (your first decrypt adds one free signature prompt). Granting decrypt
            access is a real Sepolia transaction that does <em>not</em> use up your
            claim. Claiming is the one irreversible action: it consumes your
            single-use authorization forever.
          </p>
        </Card>
      </div>

      {/* -------- Actions -------- */}
      <div className="mt-10">
        <SectionLabel>Step 3 · Claim your allocation</SectionLabel>

        {/* Action 1 — eligibility */}
        <Card className="mt-3 p-5">
          <h3 className="text-[14px] font-semibold text-zinc-100">
            Check eligibility <span className="ml-1.5 font-normal text-zinc-500">— free</span>
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
            Confirms your claim authorization is valid and unclaimed, the claim
            window is open, and shows the exact claim fee. Read-only — no
            transaction, no cost.
          </p>
          <div className="mt-3.5">
            <button
              type="button"
              onClick={handleCheckEligibility}
              disabled={!gatesOk || busy}
              className={primaryButtonClass}
            >
              {elig.phase === "running" ? "Checking…" : "Check eligibility"}
            </button>
          </div>
          {elig.phase === "error" && (
            <p className="mt-3 text-[13px] leading-relaxed text-rose-300">{elig.message}</p>
          )}
          {elig.phase === "success" && (
            <div className="mt-3 border-t border-white/[0.05] pt-1">
              <KeyValueRow label="Status">
                {elig.result.preflight.ready && elig.result.signatureValid ? (
                  <Badge tone="proven">Eligible — ready to proceed</Badge>
                ) : (
                  <Badge tone="pending">
                    {elig.result.signatureValid
                      ? "Blocked — see below"
                      : "Claim not valid for this wallet (already claimed, window inactive, or wrong wallet)"}
                  </Badge>
                )}
              </KeyValueRow>
              {!elig.result.preflight.ready && (
                <KeyValueRow label="Blockers">
                  <span className="text-amber-300">
                    {elig.result.preflight.blockers
                      .map((b) => describeRecipientActionError(b))
                      .join(" · ")}
                  </span>
                </KeyValueRow>
              )}
              <KeyValueRow label="Claim fee (attached automatically when you claim)">
                {formatEther(elig.result.gasFeeWei)} ETH
              </KeyValueRow>
            </div>
          )}
        </Card>

        {/* Action 2 — grant decrypt access */}
        <Card className="mt-3 p-5">
          <h3 className="text-[14px] font-semibold text-zinc-100">
            Grant decrypt access{" "}
            <span className="ml-1.5 font-normal text-zinc-500">
              — 1 transaction · does not use your claim
            </span>
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
            Gives your wallet — and only your wallet — permission to decrypt your
            allocation. This is a real Sepolia transaction (one wallet prompt, real
            gas) and it does <em>not</em> consume your single-use claim.
          </p>
          <div className="mt-3.5">
            <button
              type="button"
              onClick={handleGrantAccess}
              disabled={!gatesOk || busy || elig.phase !== "success"}
              className={primaryButtonClass}
            >
              {grant.phase === "pending"
                ? "Waiting for wallet confirmation…"
                : "Grant decrypt access"}
            </button>
          </div>
          {grant.phase === "error" && (
            <p className="mt-3 text-[13px] leading-relaxed text-rose-300">{grant.message}</p>
          )}
          {grant.phase === "success" && (
            <div className="mt-3 border-t border-white/[0.05] pt-1">
              <KeyValueRow label="Status">
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Badge tone="proven">Access granted</Badge>
                  <TxLink hash={grant.hash} />
                </span>
              </KeyValueRow>
            </div>
          )}
        </Card>

        {/* Action 3 — decrypt */}
        <Card className="mt-3 p-5">
          <h3 className="text-[14px] font-semibold text-zinc-100">
            Decrypt my allocation{" "}
            <span className="ml-1.5 font-normal text-zinc-500">— free · optional preview</span>
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
            Decrypts your amount in your browser so you can see it before claiming.
            Your first decrypt asks for one free signature (a decryption permit) —
            no transaction, no cost. The plaintext exists only on this screen.
          </p>
          <div className="mt-3.5">
            <button
              type="button"
              onClick={handleDecrypt}
              disabled={!gatesOk || busy || grant.phase !== "success"}
              className={primaryButtonClass}
            >
              {decrypt.phase === "running" ? "Decrypting…" : "Decrypt my allocation"}
            </button>
          </div>
          {decrypt.phase === "error" && (
            <p className="mt-3 text-[13px] leading-relaxed text-rose-300">{decrypt.message}</p>
          )}
          {decrypt.phase === "success" && (
            <div className="mt-4 rounded-lg border border-violet-500/30 bg-violet-500/[0.07] px-5 py-4">
              <p className="text-xs uppercase tracking-wider text-violet-300">
                Your confidential allocation
              </p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {formatAmount(decrypt.valueRaw)}
              </p>
              {decrypt.matches === true && (
                <p className="mt-2 text-[13px] text-emerald-300">
                  Matches the amount your sender recorded in the package.
                </p>
              )}
              {decrypt.matches === false && (
                <p className="mt-2 text-[13px] text-rose-300">
                  Does not match the package&apos;s recorded amount ({matched?.amount}) —
                  contact your sender before claiming.
                </p>
              )}
              <p className="mt-2 text-[12px] text-zinc-500">
                Decrypted locally in your browser. This number never appears
                on-chain in plaintext.
              </p>
            </div>
          )}
        </Card>

        {/* Action 4 — claim (irreversible) */}
        <Card className="mt-3 border-rose-500/40 bg-rose-500/[0.06] p-5">
          <h3 className="text-[14px] font-bold text-rose-200">
            Claim allocation{" "}
            <span className="ml-1.5 font-semibold text-rose-300/80">
              — 1 transaction · single-use · irreversible
            </span>
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-rose-200/80">
            Transfers your tokens to your wallet (the amount stays encrypted
            on-chain) and consumes your one-time claim authorization forever. There
            is no second attempt. This button refuses to send if your latest
            eligibility check reported a problem.
          </p>
          <div className="mt-3.5">
            <button
              type="button"
              onClick={handleClaim}
              disabled={!gatesOk || busy || elig.phase !== "success"}
              className={claimButtonClass}
            >
              {claim.phase === "pending"
                ? "Waiting for wallet confirmation…"
                : "Claim allocation"}
            </button>
          </div>
          {claim.phase === "error" && (
            <p className="mt-3 text-[13px] leading-relaxed text-rose-300">{claim.message}</p>
          )}
          {claim.phase === "success" && (
            <div className="mt-3 border-t border-rose-500/20 pt-1">
              <KeyValueRow label="Status">
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Badge tone="proven">Claim submitted — authorization consumed</Badge>
                  <TxLink hash={claim.hash} />
                </span>
              </KeyValueRow>
            </div>
          )}
        </Card>

        {/* Action 5 — verify */}
        <Card className="mt-3 p-5">
          <h3 className="text-[14px] font-semibold text-zinc-100">
            Verify confidential balance{" "}
            <span className="ml-1.5 font-normal text-zinc-500">— free</span>
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
            Decrypts your token balance after the claim — proof that value actually
            moved to your wallet, not just that a transaction went through.
          </p>
          <div className="mt-3.5">
            <button
              type="button"
              onClick={handleVerify}
              disabled={!gatesOk || busy || claim.phase !== "success"}
              className={primaryButtonClass}
            >
              {verify.phase === "running" ? "Verifying…" : "Verify confidential balance"}
            </button>
          </div>
          {verify.phase === "error" && (
            <p className="mt-3 text-[13px] leading-relaxed text-rose-300">{verify.message}</p>
          )}
          {verify.phase === "success" && (
            <div className="mt-3 border-t border-white/[0.05] pt-1">
              <KeyValueRow label="Your confidential balance">
                <span className="font-mono text-[13px]">
                  {formatAmount(verify.balanceRaw)}
                </span>
              </KeyValueRow>
            </div>
          )}
        </Card>
      </div>

      {/* -------- Final proof panel -------- */}
      {claimComplete && pkg && (
        <div className="mt-10">
          <SectionLabel>Done</SectionLabel>
          <Card className="mt-3 border-emerald-500/30 bg-emerald-500/[0.04] p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="proven">Claim complete</Badge>
              <Badge tone="confidential">Amount stayed encrypted on-chain</Badge>
            </div>
            <p className="mt-3 text-[14px] leading-relaxed text-zinc-300">
              Your confidential allocation has been claimed and verified. Every
              link below is a real Sepolia record — note that none of them reveal
              your amount.
            </p>
            <div className="mt-4">
              <KeyValueRow label="Decrypted allocation">
                {decrypt.phase === "success" ? (
                  <span className="font-semibold text-white">
                    {formatAmount(decrypt.valueRaw)}
                  </span>
                ) : (
                  <span className="text-zinc-500">
                    Not previewed — the optional decrypt step was skipped
                  </span>
                )}
              </KeyValueRow>
              <KeyValueRow label="Post-claim confidential balance">
                {verify.phase === "success" ? (
                  <span className="font-semibold text-white">
                    {formatAmount(verify.balanceRaw)}
                  </span>
                ) : (
                  "—"
                )}
              </KeyValueRow>
              <KeyValueRow label="Claim transaction">
                {claim.phase === "success" ? <TxLink hash={claim.hash} /> : "—"}
              </KeyValueRow>
              {grant.phase === "success" && (
                <KeyValueRow label="Decrypt-access transaction">
                  <TxLink hash={grant.hash} />
                </KeyValueRow>
              )}
              <KeyValueRow label="Token (ERC-7984)">
                <AddressLink address={pkg.token} />
              </KeyValueRow>
              <KeyValueRow label="Airdrop contract">
                <AddressLink address={pkg.tokenOpsAirdrop} />
              </KeyValueRow>
              <KeyValueRow label="Network">
                Sepolia (chain id {SEPOLIA_CHAIN_ID})
              </KeyValueRow>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
