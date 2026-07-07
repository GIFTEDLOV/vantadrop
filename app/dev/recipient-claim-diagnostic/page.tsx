"use client";

/**
 * Hidden, dev-only RECIPIENT claim diagnostic.
 *
 * Route: /dev/recipient-claim-diagnostic — deliberately NOT linked from the
 * landing page, header nav (app/layout.tsx), or any production surface. It
 * exists so a developer holding a real distribution package can manually
 * prove, in a real browser with the exact recipient burner wallet, the five
 * recipient-side steps from lib/tokenops/recipient.ts against a live Sepolia
 * distribution (the first target: registry distribution #2, airdrop clone
 * 0x62a4cBdD9DE1ccfc396605874929a44ea9C14c27 — see
 * docs/research/browser-tokenops-integration.md "Live browser issuer create
 * flow result"):
 *
 *   1. checkRecipientEligibility  — free reads (preflight + isSignatureValid + gasFee)
 *   2. grantDecryptAccess         — getClaimAmount: PAID tx, grants ACL decrypt
 *                                   access, does NOT consume the claim
 *   3. decryptAllocationHandle    — Zama allow() permit + userDecrypt (free)
 *   4. claimAllocation            — claim: PAID tx, SINGLE-USE, IRREVERSIBLE
 *   5. verifyPostClaimBalance     — confidentialBalanceOf + decrypt (free)
 *
 * PRIVACY / DATA-HANDLING RULES (load-bearing, not style):
 * - The pasted distribution package contains a real recipient wallet, a real
 *   plaintext allocation amount, and a real single-use EIP-712 claim
 *   signature. It lives ONLY in React component state (plain in-memory
 *   useState) — it is NEVER written to localStorage, NEVER sent to any
 *   server, NEVER written on-chain, and disappears on refresh. That is
 *   deliberate: this page must not create a second persistence surface for
 *   claim material.
 * - NOTHING on this page calls console.log/warn/error — not even a redacted
 *   summary. The claim signature, input proof, and plaintext amount must
 *   never reach the console; rather than maintain a "safe subset" log we log
 *   nothing at all. If you add debugging output here, log ONLY public fields
 *   (clone address, recipient count) — never claimAuthorization, never
 *   inputProof, never a plaintext amount.
 * - The full claim signature is never rendered — only a truncated summary
 *   (first/last hex chars) to show that one was found. Encrypted HANDLES are
 *   opaque bytes32 ciphertext ids and are safe to display (the issuer
 *   diagnostic already does); the decrypted allocation is shown on screen
 *   because that is the entire point of the recipient flow — it is the
 *   recipient's own number, shown only to them, only in their browser.
 *
 * WHY THERE ARE TWO PASTE FIELDS: fixed 2026-07-05 (see
 * docs/research/browser-tokenops-integration.md "Distribution package
 * encrypted input fix") — lib/distribution.ts's DistributionPackageRecipient
 * now includes the FULL `recipients[].encryptedInput: { handle, inputProof }`
 * that every recipient-side SDK call actually requires (the signature
 * commits to the exact bytes32 handle; the proof is required calldata — see
 * the ClaimArgs TSDoc in @tokenops/sdk), alongside the pre-existing
 * `encryptedHandleSummary` display string. Freshly-created packages (from the
 * fixed ExecuteStep.tsx) therefore resolve automatically — this page detects
 * `recipients[].encryptedInput` on the matched recipient and uses it with no
 * further action. The manual paste field below is kept ONLY as a fallback for
 * packages created before this fix (e.g. registry distribution #2, whose
 * saved package predates it and only has the summary) — for those, paste the
 * full `{ handle, inputProof }` separately and it is CROSS-CHECKED against
 * the package's `encryptedHandleSummary` (prefix, suffix, and proof byte
 * length — a real computed comparison, not an assumption). A mismatch
 * hard-disables all action buttons.
 *
 * BUTTON GATING (documented choice — clarity over rigidity): every button
 * requires ALL base gates (wallet connected on Sepolia + package parsed +
 * connected wallet matches a recipient + full encrypted input resolved and
 * cross-checked + single-use acknowledgement checked). On top of that the
 * steps gate sequentially on the results they actually consume:
 *   - Grant (2) requires a successful eligibility check (1) — it is a paid
 *     tx and should not be sent blind.
 *   - Decrypt (3) requires Grant (2) — a hard data dependency: it decrypts
 *     the handle returned by the grant tx receipt.
 *   - Claim (4) requires eligibility (1) but deliberately NOT decrypt (3):
 *     the decrypt preview is optional, and a Zama relayer outage must not
 *     block an otherwise-valid claim. The claim handler additionally REFUSES
 *     (in-handler, not just disabled styling) when the latest eligibility
 *     check reported the signature invalid or preflight blocked — the claim
 *     is single-use and refusing a doomed send costs nothing.
 *   - Verify (5) requires a successful claim (4) — a pre-claim "post-claim
 *     balance" would be dishonest labeling.
 */

import { notFound } from "next/navigation";
import { useState } from "react";
import type { Hex } from "viem";
import { formatEther, isAddress } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";
import type { EncryptedInput } from "@tokenops/sdk/fhe-airdrop";
import {
  AddressLink,
  Badge,
  Card,
  KeyValueRow,
  SectionLabel,
  TxLink,
} from "../../../components/ui";
import { WalletStatusBar } from "../../../components/wallet/WalletStatusBar";
import { useSepoliaWallet } from "../../../components/wallet/hooks";
import {
  CTTT_DECIMALS,
  CTTT_SYMBOL,
  CTTT_TOKEN_ADDRESS,
  SEPOLIA_CHAIN_ID,
  shortHex,
} from "../../../lib/constants";
import { formatRawUnits, toRawUnits } from "../../../lib/csv";
import type {
  DistributionPackage,
  DistributionPackageRecipient,
} from "../../../lib/distribution";
import { getBrowserFheBundle } from "../../../lib/tokenops/browser";
import {
  checkRecipientEligibility,
  claimAllocation,
  createAirdropClient,
  decryptAllocationHandle,
  grantDecryptAccess,
  verifyPostClaimBalance,
  type EligibilityResult,
} from "../../../lib/tokenops/recipient";

/* ------------------------------------------------------------------ */
/* Package parsing / validation (pure — no persistence, no logging)    */
/* ------------------------------------------------------------------ */

/**
 * `DistributionPackageRecipient.encryptedInput` is now the canonical field
 * (see lib/distribution.ts) for freshly-created packages. This local
 * override re-declares it as optional/`unknown`-shaped purely so parsing
 * tolerates PRE-FIX packages that predate the 2026-07-05 fix and lack the
 * field entirely (e.g. registry distribution #2) — those still validate
 * successfully here and fall back to the manual paste field below. The
 * runtime shape is always re-checked via validateEncryptedInputShape()
 * regardless of what this compile-time type implies.
 */
type RecipientMaybeWithPayload = DistributionPackageRecipient & {
  encryptedInput?: { handle?: unknown; inputProof?: unknown };
};

type PackageParse =
  | { ok: true; pkg: DistributionPackage }
  | { ok: false; error: string };

function isHexOfBytes(value: unknown, bytes?: number): value is Hex {
  if (typeof value !== "string") return false;
  if (!/^0x[0-9a-fA-F]*$/.test(value)) return false;
  if ((value.length - 2) % 2 !== 0) return false;
  if (bytes !== undefined && value.length !== 2 + bytes * 2) return false;
  return value.length > 2;
}

/** Validate pasted JSON against the exact DistributionPackage shape. */
function parseDistributionPackage(raw: string): PackageParse {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Not valid JSON." };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "Expected a JSON object (the distribution package)." };
  }
  const pkg = data as Partial<DistributionPackage>;
  if (pkg.network !== "Sepolia") {
    return { ok: false, error: `network must be "Sepolia" (got ${JSON.stringify(pkg.network)}).` };
  }
  if (pkg.chainId !== SEPOLIA_CHAIN_ID) {
    return { ok: false, error: `chainId must be ${SEPOLIA_CHAIN_ID} (got ${JSON.stringify(pkg.chainId)}).` };
  }
  if (typeof pkg.tokenOpsAirdrop !== "string" || !isAddress(pkg.tokenOpsAirdrop)) {
    return { ok: false, error: "tokenOpsAirdrop is missing or not a valid address." };
  }
  if (typeof pkg.token !== "string" || !isAddress(pkg.token)) {
    return { ok: false, error: "token is missing or not a valid address." };
  }
  if (!Array.isArray(pkg.recipients) || pkg.recipients.length === 0) {
    return { ok: false, error: "recipients must be a non-empty array." };
  }
  for (const [i, r] of pkg.recipients.entries()) {
    if (typeof r !== "object" || r === null) {
      return { ok: false, error: `recipients[${i}] is not an object.` };
    }
    const rec = r as Partial<DistributionPackageRecipient>;
    if (typeof rec.wallet !== "string" || !isAddress(rec.wallet)) {
      return { ok: false, error: `recipients[${i}].wallet is missing or not a valid address.` };
    }
    if (!isHexOfBytes(rec.claimAuthorization)) {
      return { ok: false, error: `recipients[${i}].claimAuthorization is missing or not 0x-hex.` };
    }
  }
  return { ok: true, pkg: pkg as DistributionPackage };
}

/* ------------------------------------------------------------------ */
/* Full encrypted claim input resolution + summary cross-check         */
/* ------------------------------------------------------------------ */

type EncryptedInputResolution =
  | { ok: true; input: EncryptedInput; source: "package" | "pasted"; crossCheck: string }
  | { ok: false; needsPaste: boolean; error: string };

function validateEncryptedInputShape(
  candidate: { handle?: unknown; inputProof?: unknown },
  where: string,
): { ok: true; input: EncryptedInput } | { ok: false; error: string } {
  if (!isHexOfBytes(candidate.handle, 32)) {
    return { ok: false, error: `${where}: handle must be 0x-hex bytes32 (66 characters).` };
  }
  if (!isHexOfBytes(candidate.inputProof)) {
    return { ok: false, error: `${where}: inputProof must be non-empty 0x-hex.` };
  }
  return {
    ok: true,
    input: { handle: candidate.handle as Hex, inputProof: candidate.inputProof as Hex },
  };
}

/**
 * Real computed cross-check of a full encrypted input against the package's
 * truncated `encryptedHandleSummary` (format written by ExecuteStep.tsx:
 * `handle ${shortHex(handle, 10)} · proof ${bytes} bytes`, where
 * shortHex(v, 10) = v.slice(0, 12) + "…" + v.slice(-4)).
 * Returns null when the summary matches, a specific error string when it
 * does not, and a "skipped" marker when the summary format is unrecognized
 * (older/foreign packages) — skipping is surfaced, never silent.
 */
function crossCheckAgainstSummary(
  summary: string,
  input: EncryptedInput,
): { fatal: string | null; note: string } {
  const m = /^handle (0x[0-9a-fA-F]{10})…([0-9a-fA-F]{4}) · proof (\d+) bytes$/u.exec(summary);
  if (!m) {
    return {
      fatal: null,
      note: "Cross-check SKIPPED — encryptedHandleSummary format unrecognized; the pasted handle/proof could not be verified against the package.",
    };
  }
  const [, prefix, suffix, proofBytesStr] = m;
  const handle = input.handle.toLowerCase();
  const proofBytes = (input.inputProof.length - 2) / 2;
  if (!handle.startsWith(prefix.toLowerCase())) {
    return { fatal: `Handle prefix mismatch: package summary says ${prefix}…, pasted handle starts ${input.handle.slice(0, 12)}…`, note: "" };
  }
  if (!handle.endsWith(suffix.toLowerCase())) {
    return { fatal: `Handle suffix mismatch: package summary says …${suffix}, pasted handle ends …${input.handle.slice(-4)}`, note: "" };
  }
  if (proofBytes !== Number(proofBytesStr)) {
    return { fatal: `Proof size mismatch: package summary says ${proofBytesStr} bytes, pasted proof is ${proofBytes} bytes.`, note: "" };
  }
  return { fatal: null, note: `Cross-check passed: handle prefix/suffix and proof size (${proofBytes} bytes) match the package's encryptedHandleSummary.` };
}

function resolveEncryptedInput(
  matched: RecipientMaybeWithPayload | undefined,
  pastedText: string,
): EncryptedInputResolution | undefined {
  if (!matched) return undefined;

  // Preferred: the package itself carries the full payload for this recipient.
  if (matched.encryptedInput !== undefined) {
    if (typeof matched.encryptedInput !== "object" || matched.encryptedInput === null) {
      return { ok: false, needsPaste: false, error: "recipients[].encryptedInput is present but not an object." };
    }
    const shape = validateEncryptedInputShape(matched.encryptedInput, "package encryptedInput");
    if (!shape.ok) return { ok: false, needsPaste: false, error: shape.error };
    const check = crossCheckAgainstSummary(matched.encryptedHandleSummary ?? "", shape.input);
    if (check.fatal) return { ok: false, needsPaste: false, error: check.fatal };
    return { ok: true, input: shape.input, source: "package", crossCheck: check.note };
  }

  // Fallback: separate paste field.
  if (pastedText.trim().length === 0) {
    return {
      ok: false,
      needsPaste: true,
      error:
        "The package stores only a truncated encryptedHandleSummary — paste the full encrypted claim input ({ handle, inputProof }) below.",
    };
  }
  let data: unknown;
  try {
    data = JSON.parse(pastedText);
  } catch {
    return { ok: false, needsPaste: true, error: "Encrypted claim input: not valid JSON." };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, needsPaste: true, error: "Encrypted claim input: expected a JSON object { handle, inputProof }." };
  }
  const shape = validateEncryptedInputShape(data as { handle?: unknown; inputProof?: unknown }, "Encrypted claim input");
  if (!shape.ok) return { ok: false, needsPaste: true, error: shape.error };
  const check = crossCheckAgainstSummary(matched.encryptedHandleSummary ?? "", shape.input);
  if (check.fatal) return { ok: false, needsPaste: true, error: check.fatal };
  return { ok: true, input: shape.input, source: "pasted", crossCheck: check.note };
}

/* ------------------------------------------------------------------ */
/* Per-button state machines + status timeline                         */
/* ------------------------------------------------------------------ */

type EligState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "success"; result: EligibilityResult }
  | { phase: "error"; message: string };

type GrantState =
  | { phase: "idle" }
  | { phase: "pending" }
  | { phase: "success"; handle: Hex; hash: Hex }
  | { phase: "error"; message: string };

type DecryptState =
  | { phase: "idle" }
  | { phase: "running" }
  | {
      phase: "success";
      valueRaw: bigint;
      /** Expected raw amount from the package, when computable. */
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

type TimelineId =
  | "package-loaded"
  | "eligibility-checked"
  | "decrypt-access-granted"
  | "allocation-decrypted"
  | "claim-submitted"
  | "balance-verified";

interface TimelineEntry {
  id: TimelineId;
  label: string;
  status: "running" | "success" | "error";
  detail?: string;
  hash?: Hex;
  errorMessage?: string;
}

const TIMELINE_LABELS: Record<TimelineId, string> = {
  "package-loaded": "Package loaded",
  "eligibility-checked": "Eligibility checked",
  "decrypt-access-granted": "Decrypt access granted",
  "allocation-decrypted": "Allocation decrypted",
  "claim-submitted": "Claim submitted",
  "balance-verified": "Balance verified",
};

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0];
}

const buttonClass =
  "rounded-lg border border-violet-500/40 bg-violet-500/10 px-3.5 py-2 text-[13px] font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40";

/** Claim gets distinct, heavier styling — it is the one irreversible action. */
const claimButtonClass =
  "rounded-lg border-2 border-rose-500/60 bg-rose-500/15 px-4 py-2.5 text-[13px] font-bold text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-40";

export default function RecipientClaimDiagnosticPage() {
  // Production guard: this hidden developer diagnostic handles real claim
  // material and must never be reachable on a production build (e.g. the public
  // vantadrop.vercel.app domain). In a client component `process.env.NODE_ENV`
  // is inlined at build time, so this is a static branch — no rules-of-hooks
  // concern — and the page stays fully available under local `next dev`.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const wallet = useSepoliaWallet();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // ---- Pasted claim material: PLAIN COMPONENT STATE ONLY. -------------
  // Never mirrored to localStorage/sessionStorage, never sent anywhere,
  // never logged. Gone on refresh — by design.
  const [packageText, setPackageText] = useState("");
  const [parsed, setParsed] = useState<PackageParse | undefined>();
  const [encryptedInputText, setEncryptedInputText] = useState("");

  const [ack, setAck] = useState(false);
  const [elig, setElig] = useState<EligState>({ phase: "idle" });
  const [grant, setGrant] = useState<GrantState>({ phase: "idle" });
  const [decrypt, setDecrypt] = useState<DecryptState>({ phase: "idle" });
  const [claim, setClaim] = useState<ClaimState>({ phase: "idle" });
  const [verify, setVerify] = useState<VerifyState>({ phase: "idle" });
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);

  function upsertTimeline(id: TimelineId, patch: Omit<Partial<TimelineEntry>, "id" | "label">) {
    setTimeline((t) => {
      const base: TimelineEntry = { id, label: TIMELINE_LABELS[id], status: "running" };
      const existing = t.find((e) => e.id === id);
      if (!existing) return [...t, { ...base, ...patch }];
      // Re-running a step replaces its entry's outcome (fresh run, fresh
      // fields) rather than appending duplicates.
      return t.map((e) => (e.id === id ? { ...base, ...patch } : e));
    });
  }

  function removeTimeline(id: TimelineId) {
    setTimeline((t) => t.filter((e) => e.id !== id));
  }

  /* ---------------- Section 2 — package input ---------------------- */

  function handlePackageChange(text: string) {
    setPackageText(text);
    // A changed package invalidates every downstream result — reset all
    // action states and their timeline entries (honest: old results
    // described a different package).
    setElig({ phase: "idle" });
    setGrant({ phase: "idle" });
    setDecrypt({ phase: "idle" });
    setClaim({ phase: "idle" });
    setVerify({ phase: "idle" });
    setTimeline((t) => t.filter((e) => e.id === "package-loaded"));

    if (text.trim().length === 0) {
      setParsed(undefined);
      removeTimeline("package-loaded");
      return;
    }
    const result = parseDistributionPackage(text);
    setParsed(result);
    if (result.ok) {
      upsertTimeline("package-loaded", {
        status: "success",
        detail: `"${result.pkg.title}" — ${result.pkg.recipients.length} recipient(s), clone ${shortHex(result.pkg.tokenOpsAirdrop)}${result.pkg.registryDistributionId !== undefined ? `, registry #${result.pkg.registryDistributionId}` : ""}`,
      });
    } else {
      upsertTimeline("package-loaded", { status: "error", errorMessage: result.error });
    }
  }

  const pkg = parsed?.ok ? parsed.pkg : undefined;

  // Case-insensitive recipient match against the connected wallet.
  const connectedLower = wallet.address?.toLowerCase();
  const matched: RecipientMaybeWithPayload | undefined =
    pkg && connectedLower
      ? (pkg.recipients as RecipientMaybeWithPayload[]).find(
          (r) => r.wallet.toLowerCase() === connectedLower,
        )
      : undefined;

  const walletMismatch = !!pkg && !!wallet.address && !matched;

  const encResolution = resolveEncryptedInput(matched, encryptedInputText);
  const encryptedInput = encResolution?.ok ? encResolution.input : undefined;

  const walletReady = wallet.isConnected && wallet.isOnSepolia && !!wallet.address;
  const busy =
    elig.phase === "running" ||
    grant.phase === "pending" ||
    decrypt.phase === "running" ||
    claim.phase === "pending" ||
    verify.phase === "running";

  // ALL FIVE buttons require every one of these (real `disabled` attributes
  // below AND in-handler refusals — belt and braces, like the issuer
  // diagnostic's burner gating).
  const gatesOk =
    walletReady &&
    !!publicClient &&
    !!walletClient &&
    !!pkg &&
    !!matched &&
    !!encryptedInput &&
    ack;

  const tokenIsCttt = pkg?.token.toLowerCase() === CTTT_TOKEN_ADDRESS.toLowerCase();

  function refusalMessage(): string | undefined {
    if (!walletReady) return "Refused: connect the recipient wallet on Sepolia first.";
    if (!publicClient || !walletClient) return "Refused: wallet client not ready — reconnect the wallet.";
    if (!pkg) return "Refused: paste and validate a distribution package first.";
    if (!matched) return "Refused: connected wallet is not the recipient for this package.";
    if (!encryptedInput) return "Refused: the full encrypted claim input is missing or failed validation.";
    if (!ack) return "Refused: confirm the single-use acknowledgement checkbox first.";
    return undefined;
  }

  /* ---------------- Button 1 — check eligibility (free) ------------- */

  async function handleCheckEligibility() {
    if (busy) return;
    const refusal = refusalMessage();
    if (refusal || !pkg || !matched || !encryptedInput || !publicClient || !wallet.address) {
      setElig({ phase: "error", message: refusal ?? "Refused: prerequisites not met." });
      return;
    }
    setElig({ phase: "running" });
    upsertTimeline("eligibility-checked", { status: "running", detail: "Free reads: preflightClaim + isSignatureValid + gasFee…" });
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
      setElig({ phase: "success", result });
      upsertTimeline("eligibility-checked", {
        status: "success",
        detail: `preflight ${result.preflight.ready ? "ready" : `blocked (${result.preflight.blockers.length})`} · signature ${result.signatureValid ? "valid" : "INVALID"} · claim fee ${formatEther(result.gasFeeWei)} ETH`,
      });
    } catch (error) {
      const message = firstLine(error);
      setElig({ phase: "error", message });
      upsertTimeline("eligibility-checked", { status: "error", errorMessage: message });
    }
  }

  /* ---------------- Button 2 — grant decrypt access (PAID tx) ------- */

  async function handleGrantAccess() {
    if (busy) return;
    const refusal = refusalMessage();
    if (refusal || !pkg || !matched || !encryptedInput || !publicClient || !walletClient) {
      setGrant({ phase: "error", message: refusal ?? "Refused: prerequisites not met." });
      return;
    }
    if (elig.phase !== "success") {
      setGrant({ phase: "error", message: "Refused: run the eligibility check first — this is a paid transaction and should not be sent blind." });
      return;
    }
    setGrant({ phase: "pending" });
    upsertTimeline("decrypt-access-granted", {
      status: "running",
      detail: "getClaimAmount tx — confirm the wallet prompt. Grants ACL decrypt access; does NOT consume the claim.",
    });
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
      setGrant({ phase: "success", handle: result.handle, hash: result.hash });
      upsertTimeline("decrypt-access-granted", {
        status: "success",
        detail: `Granted handle ${shortHex(result.handle, 10)} (opaque ciphertext id)`,
        hash: result.hash,
      });
    } catch (error) {
      const message = firstLine(error);
      setGrant({ phase: "error", message });
      upsertTimeline("decrypt-access-granted", { status: "error", errorMessage: message });
    }
  }

  /* ---------------- Button 3 — decrypt allocation (free) ------------ */

  async function handleDecrypt() {
    if (busy) return;
    const refusal = refusalMessage();
    if (refusal || !pkg || !matched || !publicClient || !walletClient) {
      setDecrypt({ phase: "error", message: refusal ?? "Refused: prerequisites not met." });
      return;
    }
    if (grant.phase !== "success") {
      setDecrypt({ phase: "error", message: "Refused: grant decrypt access first — decryption uses the handle returned by that transaction." });
      return;
    }
    setDecrypt({ phase: "running" });
    upsertTimeline("allocation-decrypted", {
      status: "running",
      detail: "Zama allow() permit (one EIP-712 signature, cached) + userDecrypt relayer call…",
    });
    try {
      const bundle = getBrowserFheBundle({ publicClient, walletClient });
      const valueRaw = await decryptAllocationHandle({
        zama: bundle.zama,
        handle: grant.handle,
        airdropAddress: pkg.tokenOpsAirdrop,
        // One permit signature also covers the post-claim token balance decrypt.
        alsoAllowContracts: [pkg.token],
      });
      // Real computed comparison against the package's plaintext amount.
      // Raw-unit conversion assumes the token's decimals; only asserted when
      // the package token IS CTTT (6 decimals, the live distribution's token).
      let expectedRaw: bigint | undefined;
      if (tokenIsCttt && /^\d+(\.\d+)?$/.test(matched.amount)) {
        expectedRaw = toRawUnits(matched.amount, CTTT_DECIMALS);
      }
      const matches = expectedRaw !== undefined ? valueRaw === expectedRaw : undefined;
      setDecrypt({ phase: "success", valueRaw, expectedRaw, matches });
      upsertTimeline("allocation-decrypted", {
        status: "success",
        detail:
          matches === undefined
            ? `Decrypted ${valueRaw.toString()} raw units (no package comparison — token is not CTTT or amount not parseable)`
            : `Decrypted ${formatRawUnits(valueRaw, CTTT_DECIMALS)} ${CTTT_SYMBOL} — ${matches ? "MATCHES" : "DOES NOT MATCH"} the package amount ${matched.amount}`,
      });
    } catch (error) {
      const message = firstLine(error);
      setDecrypt({ phase: "error", message });
      upsertTimeline("allocation-decrypted", { status: "error", errorMessage: message });
    }
  }

  /* ---------------- Button 4 — CLAIM (PAID tx, single-use) ---------- */

  async function handleClaim() {
    if (busy) return;
    const refusal = refusalMessage();
    if (refusal || !pkg || !matched || !encryptedInput || !publicClient || !walletClient) {
      setClaim({ phase: "error", message: refusal ?? "Refused: prerequisites not met." });
      return;
    }
    if (elig.phase !== "success") {
      setClaim({ phase: "error", message: "Refused: run the eligibility check first. The claim is single-use — never send it blind." });
      return;
    }
    // Refuse a send the latest eligibility check says is doomed. The claim
    // signature survives a revert, but the gas does not — and a blocked
    // preflight usually means already-claimed or window-closed.
    if (!elig.result.signatureValid) {
      setClaim({ phase: "error", message: "Refused: the latest eligibility check reported the signature INVALID for this caller (already claimed, window inactive, or wrong wallet). Re-run the check if state changed." });
      return;
    }
    if (!elig.result.preflight.ready) {
      setClaim({ phase: "error", message: "Refused: the latest eligibility preflight reported blockers. Resolve them and re-run the eligibility check." });
      return;
    }
    setClaim({ phase: "pending" });
    upsertTimeline("claim-submitted", {
      status: "running",
      detail: `claim tx — confirm the wallet prompt. Attaches the claim fee (${formatEther(elig.result.gasFeeWei)} ETH) as msg.value. THIS CONSUMES THE SINGLE-USE CLAIM.`,
    });
    try {
      const client = createAirdropClient({
        publicClient,
        walletClient,
        airdropAddress: pkg.tokenOpsAirdrop,
      });
      // `value` omitted — the SDK auto-attaches gasFee() fetched live.
      const hash = await claimAllocation({
        client,
        encryptedInput,
        signature: matched.claimAuthorization,
      });
      setClaim({ phase: "success", hash });
      upsertTimeline("claim-submitted", {
        status: "success",
        detail: "Claim transaction submitted — the single-use authorization is now consumed.",
        hash,
      });
    } catch (error) {
      const message = firstLine(error);
      setClaim({ phase: "error", message });
      upsertTimeline("claim-submitted", { status: "error", errorMessage: message });
    }
  }

  /* ---------------- Button 5 — verify post-claim balance (free) ----- */

  async function handleVerify() {
    if (busy) return;
    const refusal = refusalMessage();
    if (refusal || !pkg || !publicClient || !walletClient || !wallet.address) {
      setVerify({ phase: "error", message: refusal ?? "Refused: prerequisites not met." });
      return;
    }
    if (claim.phase !== "success") {
      setVerify({ phase: "error", message: "Refused: this verifies the POST-claim balance — submit the claim first." });
      return;
    }
    setVerify({ phase: "running" });
    upsertTimeline("balance-verified", {
      status: "running",
      detail: "confidentialBalanceOf + Zama decrypt (free; permit may already cover the token)…",
    });
    try {
      const bundle = getBrowserFheBundle({ publicClient, walletClient });
      const balanceRaw = await verifyPostClaimBalance({
        zama: bundle.zama,
        tokenAddress: pkg.token,
        owner: wallet.address,
      });
      setVerify({ phase: "success", balanceRaw });
      upsertTimeline("balance-verified", {
        status: "success",
        detail: tokenIsCttt
          ? `Post-claim confidential balance: ${formatRawUnits(balanceRaw, CTTT_DECIMALS)} ${CTTT_SYMBOL}`
          : `Post-claim confidential balance: ${balanceRaw.toString()} raw units`,
      });
    } catch (error) {
      const message = firstLine(error);
      setVerify({ phase: "error", message });
      upsertTimeline("balance-verified", { status: "error", errorMessage: message });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <SectionLabel>Developer diagnostic</SectionLabel>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
        Recipient claim diagnostic
      </h1>

      {/* Warning banner (exact required wording) */}
      <Card className="mt-6 border-amber-500/40 bg-amber-500/10 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="pending">Developer diagnostic only</Badge>
          <Badge tone="pending">Single-use claim</Badge>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-amber-200">
          Developer diagnostic only. Use the exact recipient burner wallet from the
          distribution package. Not part of the public recipient flow. This may
          consume the claim once.
        </p>
      </Card>

      {/* Section 1 — wallet readiness */}
      <div className="mt-10">
        <SectionLabel>1 · Wallet readiness</SectionLabel>
        <div className="mt-3">
          <WalletStatusBar />
        </div>
        <Card className="mt-3 p-4">
          <KeyValueRow label="Connected">
            {wallet.isConnected ? <Badge tone="proven">Connected</Badge> : <Badge tone="pending">Not connected</Badge>}
          </KeyValueRow>
          <KeyValueRow label="Address">
            {wallet.address ? (
              <span className="font-mono text-[13px]" title={wallet.address}>
                {shortHex(wallet.address)}
              </span>
            ) : (
              "—"
            )}
          </KeyValueRow>
          <KeyValueRow label="Current chain">
            {wallet.chainId !== undefined
              ? `${wallet.chainName ?? "Unrecognised chain"} (id ${wallet.chainId})`
              : "—"}
          </KeyValueRow>
          <KeyValueRow label="Required chain">Sepolia (id {SEPOLIA_CHAIN_ID})</KeyValueRow>
          <KeyValueRow label="Ready">
            {walletReady ? (
              <Badge tone="proven">Yes</Badge>
            ) : (
              <Badge tone="pending">No — connect on Sepolia (switch via the panel above)</Badge>
            )}
          </KeyValueRow>
        </Card>
      </div>

      {/* Section 2 — package input */}
      <div className="mt-10">
        <SectionLabel>2 · Package input</SectionLabel>
        <Card className="mt-3 p-4">
          <label className="block text-[13px] font-medium text-zinc-300" htmlFor="pkg-json">
            Paste distribution package JSON
          </label>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
            The package stays in this page&apos;s memory only — it is never uploaded,
            never written to localStorage or the registry, never logged, and is gone on
            refresh.
          </p>
          <textarea
            id="pkg-json"
            value={packageText}
            onChange={(e) => handlePackageChange(e.target.value)}
            rows={7}
            spellCheck={false}
            placeholder='{"distributionId":"…","network":"Sepolia","chainId":11155111,…}'
            className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
          />

          <div className="mt-3 border-t border-white/[0.05] pt-1">
            <KeyValueRow label="Package">
              {!parsed && <span className="text-zinc-500">Nothing pasted yet</span>}
              {parsed && !parsed.ok && <span className="text-amber-300">Invalid: {parsed.error}</span>}
              {parsed?.ok && <Badge tone="proven">Valid Sepolia package</Badge>}
            </KeyValueRow>
            {pkg && (
              <>
                <KeyValueRow label="Title (public)">{pkg.title}</KeyValueRow>
                <KeyValueRow label="Airdrop clone">
                  <AddressLink address={pkg.tokenOpsAirdrop} />
                </KeyValueRow>
                <KeyValueRow label="Token">
                  <AddressLink address={pkg.token} />
                </KeyValueRow>
                <KeyValueRow label="Recipients in package">{pkg.recipients.length}</KeyValueRow>
                {pkg.registryDistributionId !== undefined && (
                  <KeyValueRow label="Registry distribution id">#{pkg.registryDistributionId}</KeyValueRow>
                )}
                <KeyValueRow label="Connected wallet is a recipient">
                  {!wallet.address && <span className="text-zinc-500">Connect a wallet to check</span>}
                  {walletMismatch && (
                    <span className="font-medium text-rose-300">
                      Connected wallet is not the recipient for this package.
                    </span>
                  )}
                  {matched && <Badge tone="proven">Match found</Badge>}
                </KeyValueRow>
                {matched && (
                  <>
                    <KeyValueRow label="Claim authorization (truncated — never shown in full)">
                      <span className="font-mono text-[12px]">{shortHex(matched.claimAuthorization, 8)}</span>
                    </KeyValueRow>
                    <KeyValueRow label="Package amount (plaintext, local-only)">
                      {matched.amount}
                      {tokenIsCttt ? ` ${CTTT_SYMBOL}` : ""}
                    </KeyValueRow>
                  </>
                )}
              </>
            )}
          </div>

          {/* Full encrypted claim input — auto-detected from recipient.encryptedInput
              on freshly-created packages (fixed 2026-07-05); the paste field below
              is a fallback for older packages that predate the fix (see file header). */}
          {matched && (
            <div className="mt-4 border-t border-white/[0.05] pt-4">
              <p className="text-[13px] font-medium text-zinc-300">Full encrypted claim input</p>
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                The recipient-side SDK calls need the full{" "}
                <code className="rounded bg-white/5 px-1 py-0.5 font-mono text-[11px]">
                  {"{ handle, inputProof }"}
                </code>{" "}
                pair the issuer signed. Packages created after the 2026-07-05 fix include
                this automatically as{" "}
                <code className="rounded bg-white/5 px-1 py-0.5 font-mono text-[11px]">recipients[].encryptedInput</code>{" "}
                and it is detected with no further action. Older packages (e.g. registry
                distribution #2) predate the fix and stored only the truncated summary
                below — paste the full input manually in that case; it is cross-checked
                against the summary and held in memory only.
              </p>
              <p className="mt-2 text-[11px] text-zinc-600">
                Summary on file: <span className="font-mono text-zinc-400">{matched.encryptedHandleSummary}</span>
              </p>
              {encResolution && !encResolution.ok && encResolution.needsPaste && (
                <textarea
                  value={encryptedInputText}
                  onChange={(e) => setEncryptedInputText(e.target.value)}
                  rows={4}
                  spellCheck={false}
                  placeholder='{"handle":"0x… (66 chars)","inputProof":"0x…"}'
                  className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
                />
              )}
              <div className="mt-2">
                <KeyValueRow label="Encrypted claim input">
                  {!encResolution && <span className="text-zinc-500">—</span>}
                  {encResolution && !encResolution.ok && (
                    <span className="text-amber-300">{encResolution.error}</span>
                  )}
                  {encResolution?.ok && (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <Badge tone="proven">
                        {encResolution.source === "package"
                          ? "Full encrypted input found in package."
                          : "Resolved (pasted fallback)"}
                      </Badge>
                    </span>
                  )}
                </KeyValueRow>
                {encResolution?.ok && (
                  <>
                    <KeyValueRow label="Handle (opaque ciphertext id — safe to display)">
                      <span className="break-all font-mono text-[12px]">{encResolution.input.handle}</span>
                    </KeyValueRow>
                    <KeyValueRow label="Input proof">
                      {(encResolution.input.inputProof.length - 2) / 2} bytes (raw bytes not displayed)
                    </KeyValueRow>
                    <KeyValueRow label="Summary cross-check">
                      <span className={encResolution.crossCheck.startsWith("Cross-check passed") ? "text-emerald-300" : "text-amber-300"}>
                        {encResolution.crossCheck}
                      </span>
                    </KeyValueRow>
                  </>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Section 4 lives visually before the action buttons: safety controls */}
      <div className="mt-10">
        <SectionLabel>Safety controls</SectionLabel>
        <Card className="mt-3 p-4">
          <label className="flex cursor-pointer items-start gap-3 text-[14px] text-zinc-200">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-violet-500"
            />
            <span>
              I understand this claim can only be consumed once.
              <span className="block text-[12px] text-zinc-500">
                All five action buttons stay disabled until: wallet connected on Sepolia,
                package parsed, connected wallet matches a package recipient, the full
                encrypted claim input resolved, and this box checked.
              </span>
            </span>
          </label>
          <p className="mt-4 border-t border-white/[0.05] pt-3 text-[13px] leading-relaxed text-zinc-500">
            Steps 1, 3 and 5 are free (reads / relayer calls; step 3&apos;s first run may
            add one free EIP-712 permit signature). Step 2 is a real paid Sepolia
            transaction that grants decrypt access WITHOUT consuming the claim. Step 4 is
            the real claim: a paid transaction that consumes the single-use authorization
            irreversibly — there is no second attempt.
          </p>
        </Card>
      </div>

      {/* Section 3 — the five-step recipient flow */}
      <div className="mt-10">
        <SectionLabel>3 · Recipient flow (five manual steps)</SectionLabel>

        {/* Step 1 */}
        <Card className="mt-3 p-4">
          <p className="text-[13px] font-semibold text-zinc-200">Step 1 — Check eligibility (free)</p>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
            preflightClaim + isSignatureValid + gasFee. Note the SDK&apos;s documented
            limitation: preflight does NOT check pool funding — an unfunded pool passes
            preflight and reverts at claim time.
          </p>
          <div className="mt-3">
            <button
              type="button"
              onClick={handleCheckEligibility}
              disabled={!gatesOk || busy}
              className={buttonClass}
            >
              {elig.phase === "running" ? "Checking…" : "Check eligibility"}
            </button>
          </div>
          <div className="mt-3 border-t border-white/[0.05] pt-1">
            <KeyValueRow label="Result">
              {elig.phase === "idle" && <span className="text-zinc-500">Not run yet</span>}
              {elig.phase === "running" && <span className="text-zinc-400">Running free reads…</span>}
              {elig.phase === "error" && <span className="text-rose-300">{elig.message}</span>}
              {elig.phase === "success" && (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {elig.result.preflight.ready ? (
                    <Badge tone="proven">Preflight ready</Badge>
                  ) : (
                    <Badge tone="pending">Preflight blocked</Badge>
                  )}
                  {elig.result.signatureValid ? (
                    <Badge tone="proven">Signature valid</Badge>
                  ) : (
                    <Badge tone="pending">Signature invalid for this caller</Badge>
                  )}
                </span>
              )}
            </KeyValueRow>
            {elig.phase === "success" && (
              <>
                {!elig.result.preflight.ready && (
                  <KeyValueRow label="Preflight blockers">
                    <span className="text-amber-300">
                      {elig.result.preflight.blockers.map((b) => `${b.code}: ${firstLine(b)}`).join(" · ")}
                    </span>
                  </KeyValueRow>
                )}
                <KeyValueRow label="Claim fee (msg.value the claim attaches)">
                  {formatEther(elig.result.gasFeeWei)} ETH ({elig.result.gasFeeWei.toString()} wei)
                </KeyValueRow>
              </>
            )}
          </div>
        </Card>

        {/* Step 2 */}
        <Card className="mt-3 p-4">
          <p className="text-[13px] font-semibold text-zinc-200">
            Step 2 — Grant decrypt access (1 paid Sepolia tx — does NOT consume the claim)
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
            getClaimAmount under the hood: the contract runs FHE.allow(handle, you) and
            the SDK extracts the granted handle from the receipt&apos;s ACL event. Real
            gas, one wallet prompt, runs BEFORE the claim.
          </p>
          <div className="mt-3">
            <button
              type="button"
              onClick={handleGrantAccess}
              disabled={!gatesOk || busy || elig.phase !== "success"}
              className={buttonClass}
            >
              {grant.phase === "pending" ? "Waiting for wallet / confirmation…" : "Grant decrypt access (1 tx)"}
            </button>
          </div>
          <div className="mt-3 border-t border-white/[0.05] pt-1">
            <KeyValueRow label="Result">
              {grant.phase === "idle" && <span className="text-zinc-500">Not run yet</span>}
              {grant.phase === "pending" && <span className="text-zinc-400">Sent to wallet — confirm the prompt…</span>}
              {grant.phase === "error" && <span className="text-rose-300">{grant.message}</span>}
              {grant.phase === "success" && (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Badge tone="proven">Access granted</Badge>
                  <TxLink hash={grant.hash} />
                </span>
              )}
            </KeyValueRow>
            {grant.phase === "success" && (
              <KeyValueRow label="Granted allocation handle (opaque ciphertext id)">
                <span className="break-all font-mono text-[12px]">{grant.handle}</span>
              </KeyValueRow>
            )}
          </div>
        </Card>

        {/* Step 3 */}
        <Card className="mt-3 p-4">
          <p className="text-[13px] font-semibold text-zinc-200">Step 3 — Decrypt allocation (free)</p>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
            Zama allow() permit (one free EIP-712 signature, cached in IndexedDB) +
            userDecrypt relayer call on the handle granted in step 2. The plaintext exists
            only in this browser&apos;s memory and on this screen.
          </p>
          <div className="mt-3">
            <button
              type="button"
              onClick={handleDecrypt}
              disabled={!gatesOk || busy || grant.phase !== "success"}
              className={buttonClass}
            >
              {decrypt.phase === "running" ? "Decrypting…" : "Decrypt allocation"}
            </button>
          </div>
          <div className="mt-3 border-t border-white/[0.05] pt-1">
            <KeyValueRow label="Result">
              {decrypt.phase === "idle" && <span className="text-zinc-500">Not run yet</span>}
              {decrypt.phase === "running" && <span className="text-zinc-400">Permit + relayer decrypt…</span>}
              {decrypt.phase === "error" && <span className="text-rose-300">{decrypt.message}</span>}
              {decrypt.phase === "success" && <Badge tone="proven">Decrypted</Badge>}
            </KeyValueRow>
            {decrypt.phase === "success" && (
              <>
                <KeyValueRow label="Decrypted allocation">
                  <span className="font-mono text-[13px]">
                    {tokenIsCttt
                      ? `${formatRawUnits(decrypt.valueRaw, CTTT_DECIMALS)} ${CTTT_SYMBOL} (${decrypt.valueRaw.toString()} raw)`
                      : `${decrypt.valueRaw.toString()} raw units`}
                  </span>
                </KeyValueRow>
                <KeyValueRow label="Matches package amount">
                  {decrypt.matches === undefined && (
                    <span className="text-zinc-500">
                      Not compared — token is not CTTT or package amount not parseable
                    </span>
                  )}
                  {decrypt.matches === true && (
                    <Badge tone="proven">Match — decrypted value equals the package amount</Badge>
                  )}
                  {decrypt.matches === false && (
                    <span className="text-rose-300">
                      MISMATCH — decrypted {decrypt.valueRaw.toString()} raw vs package{" "}
                      {decrypt.expectedRaw?.toString()} raw
                    </span>
                  )}
                </KeyValueRow>
              </>
            )}
          </div>
        </Card>

        {/* Step 4 — the irreversible one */}
        <Card className="mt-3 border-rose-500/40 bg-rose-500/[0.06] p-4">
          <p className="text-[13px] font-bold text-rose-200">
            Step 4 — Claim allocation (1 paid tx · SINGLE-USE · IRREVERSIBLE)
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-rose-200/80">
            This submits the real claim and consumes the one-time authorization forever.
            If it succeeds, the tokens move; if you are testing the live distribution,
            there is no second chance. The handler refuses to send if the latest
            eligibility check reported the signature invalid or preflight blocked.
          </p>
          <div className="mt-3">
            <button
              type="button"
              onClick={handleClaim}
              disabled={!gatesOk || busy || elig.phase !== "success"}
              className={claimButtonClass}
            >
              {claim.phase === "pending"
                ? "Waiting for wallet / confirmation…"
                : "Claim allocation — consumes the single-use claim"}
            </button>
          </div>
          <div className="mt-3 border-t border-rose-500/20 pt-1">
            <KeyValueRow label="Result">
              {claim.phase === "idle" && <span className="text-zinc-500">Not run yet</span>}
              {claim.phase === "pending" && <span className="text-zinc-400">Sent to wallet — confirm the prompt…</span>}
              {claim.phase === "error" && <span className="text-rose-300">{claim.message}</span>}
              {claim.phase === "success" && (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Badge tone="proven">Claim submitted</Badge>
                  <TxLink hash={claim.hash} />
                </span>
              )}
            </KeyValueRow>
          </div>
        </Card>

        {/* Step 5 */}
        <Card className="mt-3 p-4">
          <p className="text-[13px] font-semibold text-zinc-200">Step 5 — Verify post-claim balance (free)</p>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
            Decrypts your confidential token balance via the Zama token convenience —
            proves the confidential transfer moved value, not merely that the claim tx
            didn&apos;t revert.
          </p>
          <div className="mt-3">
            <button
              type="button"
              onClick={handleVerify}
              disabled={!gatesOk || busy || claim.phase !== "success"}
              className={buttonClass}
            >
              {verify.phase === "running" ? "Verifying…" : "Verify post-claim balance"}
            </button>
          </div>
          <div className="mt-3 border-t border-white/[0.05] pt-1">
            <KeyValueRow label="Result">
              {verify.phase === "idle" && <span className="text-zinc-500">Not run yet</span>}
              {verify.phase === "running" && <span className="text-zinc-400">Reading + decrypting balance…</span>}
              {verify.phase === "error" && <span className="text-rose-300">{verify.message}</span>}
              {verify.phase === "success" && <Badge tone="proven">Balance decrypted</Badge>}
            </KeyValueRow>
            {verify.phase === "success" && (
              <KeyValueRow label="Post-claim confidential balance">
                <span className="font-mono text-[13px]">
                  {tokenIsCttt
                    ? `${formatRawUnits(verify.balanceRaw, CTTT_DECIMALS)} ${CTTT_SYMBOL} (${verify.balanceRaw.toString()} raw)`
                    : `${verify.balanceRaw.toString()} raw units`}
                </span>
              </KeyValueRow>
            )}
          </div>
        </Card>
      </div>

      {/* Section 5 — status timeline */}
      <div className="mt-10">
        <SectionLabel>4 · Status timeline</SectionLabel>
        <Card className="mt-3 p-5">
          <h3 className="text-sm font-semibold text-white">Diagnostic timeline</h3>
          <p className="mt-1 text-[13px] text-zinc-500">
            Every status below reflects a real call&apos;s real outcome — nothing is
            simulated.
          </p>
          {timeline.length === 0 ? (
            <p className="mt-4 text-[13px] text-zinc-500">
              Nothing yet — paste a package to begin.
            </p>
          ) : (
            <ol className="mt-4 space-y-3">
              {timeline.map((step) => (
                <li key={step.id} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] ${
                      step.status === "success"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : step.status === "error"
                          ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                          : "border-violet-500/40 bg-violet-500/10 text-violet-300"
                    }`}
                  >
                    {step.status === "success" ? "✓" : step.status === "error" ? "✕" : "…"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-zinc-200">{step.label}</p>
                    {step.detail && (
                      <p className="mt-0.5 text-[12px] text-zinc-500">{step.detail}</p>
                    )}
                    {step.hash && (
                      <p className="mt-1">
                        <TxLink hash={step.hash} />
                      </p>
                    )}
                    {step.errorMessage && (
                      <p className="mt-1 text-[13px] leading-relaxed text-rose-300">
                        {step.errorMessage}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
