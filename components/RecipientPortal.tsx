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
 * - The active claim package comes from /drops after wallet-ownership
 *   verification against VantaDrop's encrypted Claim Vault. The public
 *   registry never stores recipient lists, amounts, notes, signatures,
 *   handles, or proofs. Manual JSON import is intentionally absent here and
 *   remains only in /dev/recipient-claim-diagnostic.
 * - NOTHING on this page calls console.log/warn/error. The claim signature,
 *   input proof, and plaintext amount must never reach the console.
 * - Raw claim material is hidden by default (Task: product UX, not a
 *   developer dump). The optional "Advanced details" disclosure shows only
 *   TRUNCATED values (shortHex) and byte counts — never the full signature
 *   or proof bytes. The decrypted allocation IS shown on screen: it is the
 *   recipient's own number, shown only to them, only in their browser —
 *   that is the entire point of the flow.
 *
 * PACKAGE FORMAT: the vault capsule must include recipientWallet,
 * claimAuthorization, and encryptedInput { handle, inputProof }. The page
 * adapts that verified capsule into the same recipient-side TokenOps flow.
 *
 * BUTTON GATING (mirrors the diagnostic's documented, proven choices):
 * every action requires wallet connected on Sepolia + a vault capsule for the
 * connected wallet + resolved claim material. The irreversible claim action
 * also requires the single-use acknowledgement.
 *   - Grant (paid) requires a successful eligibility check — never sent blind.
 *   - Decrypt requires Grant — hard data dependency on the granted handle.
 *   - Claim requires eligibility but deliberately NOT decrypt: the decrypt
 *     preview is optional and a Zama relayer outage must not block an
 *     otherwise-valid claim. The claim handler additionally refuses when the
 *     latest eligibility check reported the signature invalid or preflight
 *     blocked, or when the wallet changed since that check ran.
 *   - Verify requires a successful claim.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import type { DistributionPackageRecipient } from "../lib/distribution";
import {
  describeRecipientActionError,
  resolveClaimMaterial,
} from "../lib/distribution-import";
import { readVaultClaimSession } from "../lib/claimVault/session";
import type { RecipientVaultSession } from "../lib/claimVault/types";
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

interface ActiveClaimPackage {
  distributionId: string;
  title: string;
  useCase: string;
  network: string;
  chainId: number;
  token: Address;
  tokenOpsAirdrop: Address;
  registry: Address;
  registryDistributionId?: number;
  recipientCount: number;
  recipients: DistributionPackageRecipient[];
}

const primaryButtonClass =
  "btn-primary disabled:cursor-not-allowed disabled:opacity-40";

/** Claim gets distinct, heavier styling — it is the one irreversible action. */
const claimButtonClass =
  "btn-danger px-5 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40";

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

function packageFromVaultSession(
  session: RecipientVaultSession | undefined,
): ActiveClaimPackage | undefined {
  if (!session) return undefined;
  const { capsule, publicDropMetadata } = session;
  return {
    distributionId: capsule.distributionId,
    title: publicDropMetadata.title,
    useCase: publicDropMetadata.useCase,
    network: publicDropMetadata.network,
    chainId: capsule.chainId,
    token: capsule.token,
    tokenOpsAirdrop: capsule.tokenOpsAirdrop,
    registry: publicDropMetadata.registry,
    ...(publicDropMetadata.registryDistributionId !== undefined
      ? { registryDistributionId: publicDropMetadata.registryDistributionId }
      : {}),
    recipientCount: publicDropMetadata.recipientCount,
    recipients: [
      {
        wallet: capsule.recipientWallet,
        note: capsule.note ?? "",
        amount: capsule.amountLabel ?? "",
        claimAuthorization: capsule.claimAuthorization,
        encryptedInput: capsule.encryptedInput,
        encryptedHandleSummary: `handle ${shortHex(capsule.encryptedInput.handle, 10)} · proof ${(capsule.encryptedInput.inputProof.length - 2) / 2} bytes`,
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export function RecipientPortal() {
  const wallet = useSepoliaWallet();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [vaultSession, setVaultSession] = useState<
    RecipientVaultSession | undefined
  >();
  const [sessionChecked, setSessionChecked] = useState(false);

  const [ack, setAck] = useState(false);
  const [elig, setElig] = useState<EligState>({ phase: "idle" });
  const [grant, setGrant] = useState<GrantState>({ phase: "idle" });
  const [decrypt, setDecrypt] = useState<DecryptState>({ phase: "idle" });
  const [claim, setClaim] = useState<ClaimState>({ phase: "idle" });
  const [verify, setVerify] = useState<VerifyState>({ phase: "idle" });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setVaultSession(readVaultClaimSession());
      setSessionChecked(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const pkg = useMemo(() => packageFromVaultSession(vaultSession), [vaultSession]);
  const matched =
    pkg && wallet.address
      ? pkg.recipients.find(
          (recipient) =>
            recipient.wallet.toLowerCase() === wallet.address?.toLowerCase(),
        )
      : undefined;
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

  // ALL action buttons require these base gates — real `disabled` attributes
  // below AND in-handler refusals (belt and braces). Claim adds the single-use
  // acknowledgement because it is the irreversible action.
  const baseGatesOk =
    walletReady && !!publicClient && !!walletClient && packageReady;
  const claimGatesOk = baseGatesOk && ack;

  const tokenIsCttt = pkg?.token.toLowerCase() === CTTT_TOKEN_ADDRESS.toLowerCase();

  function formatAmount(raw: bigint): string {
    return tokenIsCttt
      ? `${formatRawUnits(raw, CTTT_DECIMALS)} ${CTTT_SYMBOL}`
      : `${raw.toString()} raw token units`;
  }

  function refusalMessage(options: { requireAck?: boolean } = {}): string | undefined {
    if (!walletReady) return "Connect your wallet on Sepolia first.";
    if (!publicClient || !walletClient)
      return "Wallet client not ready — reconnect your wallet.";
    if (!pkg) return "No claim selected. Open Drops to privately check eligible airdrops.";
    if (!matched) return "The connected wallet is not the recipient for this package.";
    if (!encryptedInput)
      return "The vault capsule's encrypted claim input is missing or failed validation.";
    if (options.requireAck && !ack)
      return "Confirm the single-use acknowledgement checkbox first.";
    return undefined;
  }

  async function handleRevealAllocation() {
    if (busy) return;
    const refusal = refusalMessage();
    if (
      refusal ||
      !pkg ||
      !matched ||
      !encryptedInput ||
      !publicClient ||
      !walletClient ||
      !wallet.address
    ) {
      setElig({ phase: "error", message: refusal ?? "Prerequisites not met." });
      return;
    }

    let stage: "eligibility" | "grant" | "decrypt" = "eligibility";
    setElig({ phase: "running" });
    setGrant({ phase: "idle" });
    setDecrypt({ phase: "idle" });

    try {
      const client = createAirdropClient({
        publicClient,
        walletClient,
        airdropAddress: pkg.tokenOpsAirdrop,
      });
      const eligibility = await checkRecipientEligibility({
        client,
        caller: wallet.address,
        encryptedAmountHandle: encryptedInput.handle,
        signature: matched.claimAuthorization,
      });
      setElig({ phase: "success", result: eligibility, caller: wallet.address });

      if (!eligibility.signatureValid) {
        setGrant({
          phase: "error",
          message:
            "This claim is not valid for the connected wallet, or it has already been used.",
        });
        return;
      }
      if (!eligibility.preflight.ready) {
        setGrant({
          phase: "error",
          message: eligibility.preflight.blockers
            .map((b) => describeRecipientActionError(b))
            .join(" · "),
        });
        return;
      }

      stage = "grant";
      setGrant({ phase: "pending" });
      const granted = await grantDecryptAccess({
        client,
        encryptedInput,
        signature: matched.claimAuthorization,
      });
      setGrant({
        phase: "success",
        handle: granted.handle,
        hash: granted.hash,
        caller: wallet.address,
      });

      stage = "decrypt";
      setDecrypt({ phase: "running" });
      const bundle = getBrowserFheBundle({ publicClient, walletClient });
      const valueRaw = await decryptAllocationHandle({
        zama: bundle.zama,
        handle: granted.handle,
        airdropAddress: pkg.tokenOpsAirdrop,
        alsoAllowContracts: [pkg.token],
      });

      let expectedRaw: bigint | undefined;
      if (tokenIsCttt && /^\d+(\.\d+)?$/.test(matched.amount)) {
        expectedRaw = toRawUnits(matched.amount, CTTT_DECIMALS);
      }
      const matches = expectedRaw !== undefined ? valueRaw === expectedRaw : undefined;
      setDecrypt({ phase: "success", valueRaw, expectedRaw, matches });
    } catch (error) {
      const message = describeRecipientActionError(error);
      if (stage === "eligibility") {
        setElig({ phase: "error", message });
      } else if (stage === "grant") {
        setGrant({ phase: "error", message });
      } else {
        setDecrypt({ phase: "error", message });
      }
    }
  }

  /* ---------------- Action 4 — CLAIM (paid tx, single-use) ----------- */

  async function handleClaim() {
    if (busy) return;
    const refusal = refusalMessage({ requireAck: true });
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

  /* ---------------- Step timeline (simple product flow) -------------- */

  function actionStatus(
    phase: "idle" | "running" | "pending" | "success" | "error",
  ): StepStatus {
    if (phase === "success") return "done";
    if (phase === "error") return "error";
    if (phase === "running" || phase === "pending") return "running";
    return "todo";
  }

  const packageInvalid = !!claimMaterial && !claimMaterial.ok;
  const packageStepStatus: StepStatus = packageReady
    ? "done"
    : packageInvalid || walletMismatch
      ? "error"
      : pkg
        ? "running"
        : "todo";
  const revealStatus: StepStatus =
    decrypt.phase === "success"
      ? "done"
      : elig.phase === "error" || grant.phase === "error" || decrypt.phase === "error"
        ? "error"
        : elig.phase === "running" ||
            grant.phase === "pending" ||
            decrypt.phase === "running"
          ? "running"
          : "todo";

  const steps: { label: string; status: StepStatus; note?: string }[] = [
    {
      label: "Connect wallet",
      status: walletReady
        ? "done"
        : wallet.isConnected && !wallet.isOnSepolia
          ? "error"
          : "todo",
    },
    { label: "Claim package detected", status: packageStepStatus },
    { label: "Reveal my allocation", status: revealStatus, note: "eligibility + decrypt" },
    {
      label: "Claim allocation",
      status: actionStatus(claim.phase),
      note: "single-use",
    },
    {
      label: "Verify balance",
      status: actionStatus(verify.phase),
      note: "free",
    },
  ];

  const packageStatusLabel = packageInvalid
    ? "Invalid package"
    : walletMismatch
      ? "Wallet mismatch"
      : pkg
        ? "Detected"
        : "Waiting for package";
  const packageStatusTone =
    packageInvalid || walletMismatch ? "pending" : pkg ? "proven" : "neutral";
  const packageStatusTitle = packageInvalid
    ? "Invalid package"
    : walletMismatch
      ? "Package found, but this wallet is not the recipient."
      : pkg && wallet.address
        ? "Claim package detected"
        : pkg
          ? "Claim package detected. Connect wallet to continue."
          : "No claim selected";
  const packageStatusDescription = packageInvalid
    ? "The Claim Vault capsule could not be prepared for this wallet."
    : pkg
      ? "Claim material was released from VantaDrop's encrypted Claim Vault to this verified wallet. It is not stored in the public registry."
      : sessionChecked
        ? "No claim selected. Open Drops to privately check eligible airdrops."
        : "Checking for a vault claim package...";
  const packageHasClaimAuthorization = !!pkg?.recipients.some(
    (recipient) => !!recipient.claimAuthorization,
  );
  const packageHasEncryptedInput = !!pkg?.recipients.some(
    (recipient) => !!recipient.encryptedInput?.handle && !!recipient.encryptedInput?.inputProof,
  );

  const claimComplete = claim.phase === "success" && verify.phase === "success";

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="page-section-tight">
      {/* -------- Header -------- */}
      <SectionLabel>Recipient portal</SectionLabel>
      <h1 className="mt-3 max-w-5xl text-[clamp(38px,5vw,78px)] font-semibold leading-[0.96] tracking-[-0.075em] text-white">
        Claim your confidential allocation
      </h1>
      <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-zinc-400">
        Someone sent you a confidential token allocation through VantaDrop. Your
        amount is encrypted on-chain. Connect your wallet to privately check this
        claim, reveal your allocation, claim it, and verify your confidential
        balance. Nothing runs automatically.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone="confidential">Amounts encrypted end-to-end</Badge>
        <Badge tone="neutral">Sepolia testnet</Badge>
        <Badge tone="pending">Sends real transactions</Badge>
      </div>

      {/* -------- Step timeline -------- */}
      <Card className="mt-8 p-5">
        <h2 className="text-sm font-semibold text-white">Your progress</h2>
        <ol className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
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

      {/* -------- Wallet -------- */}
      <div className="mt-10">
        <SectionLabel>Step 1 · Connect wallet</SectionLabel>
        <div className="mt-3">
          <WalletStatusBar />
        </div>
        {!walletReady && (
          <p className="mt-2 text-[13px] text-zinc-500">
            Connect the exact wallet your sender allocated tokens to, on Sepolia
            (chain id {SEPOLIA_CHAIN_ID}). Only the matching recipient wallet can
            use this claim.
          </p>
        )}
      </div>

      {/* -------- Claim package status -------- */}
      <div className="mt-10">
        <SectionLabel>Step 2 · Claim package detected</SectionLabel>
        <Card className="mt-3 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold text-white">
                  Claim package
                </h2>
                <Badge tone={packageStatusTone}>{packageStatusLabel}</Badge>
              </div>
              <p className="mt-2 text-[14px] font-medium leading-relaxed text-zinc-200">
                {packageStatusTitle}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
                {packageStatusDescription}
              </p>
            </div>
            <Badge tone="confidential">Claim Vault</Badge>
          </div>

          {!pkg && sessionChecked && (
            <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-[13px] leading-relaxed text-zinc-400">
                No claim selected. Open Drops to privately check eligible
                airdrops.
              </p>
              <Link href="/drops" className="mt-3 inline-flex btn-primary px-4 py-2 text-[13px]">
                Go to Drops
              </Link>
            </div>
          )}

          {/* Plain, reassuring status lines — raw data hidden by default. */}
          {pkg && (
            <div className="mt-4 border-t border-white/[0.05] pt-3">
              <ul className="space-y-2">
                <li className="flex items-center gap-2.5 text-[13px] text-zinc-300">
                  <Badge tone="proven">OK</Badge> Claim package detected
                  <span className="text-zinc-500">{pkg.title}</span>
                </li>
                <li className="flex items-center gap-2.5 text-[13px] text-zinc-300">
                  {!wallet.address ? (
                    <>
                      <Badge tone="neutral">·</Badge>
                      <span className="text-zinc-500">
                        Recipient match waiting for wallet
                      </span>
                    </>
                  ) : walletMismatch ? (
                    <>
                      <Badge tone="pending">✕</Badge>
                      <span className="font-medium text-rose-300">
                        Package found, but this wallet is not the recipient.
                      </span>
                    </>
                  ) : (
                    <>
                      <Badge tone="proven">OK</Badge> Recipient matched
                    </>
                  )}
                </li>
                <li className="flex items-center gap-2.5 text-[13px] text-zinc-300">
                  {packageHasClaimAuthorization ? (
                    <>
                      <Badge tone="proven">OK</Badge> Claim authorization present
                    </>
                  ) : (
                    <>
                      <Badge tone="pending">Missing</Badge> Claim authorization missing
                    </>
                  )}
                </li>
                <li className="flex items-center gap-2.5 text-[13px] text-zinc-300">
                  {claimMaterial && !claimMaterial.ok ? (
                    <>
                      <Badge tone="pending">Check</Badge>
                      <span className="text-amber-300">{claimMaterial.error}</span>
                    </>
                  ) : packageHasEncryptedInput ? (
                    <>
                      <Badge tone="proven">OK</Badge> Encrypted input present
                    </>
                  ) : (
                    <>
                      <Badge tone="pending">Missing</Badge> Encrypted input missing
                    </>
                  )}
                </li>
                <li className="flex items-center gap-2.5 text-[13px] text-zinc-300">
                  <Badge tone="confidential">Private</Badge> Your allocation stays private
                  until your wallet decrypts it.
                </li>
              </ul>

              {/* Optional technical disclosure — truncated values only. */}
              <details className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <summary className="cursor-pointer select-none text-[13px] font-medium text-zinc-400 transition hover:text-zinc-200">
                  Advanced proof details
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
                  <KeyValueRow label="Recipients in drop">
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
                  Claim material is released through the encrypted Claim Vault.
                </span>{" "}
                The backend stores encrypted capsules at rest and releases this
                capsule only after wallet-ownership verification for the matching
                recipient wallet.
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

      {/* -------- Actions -------- */}
      <div className="mt-10">
        <SectionLabel>Step 3 · Claim your allocation</SectionLabel>

        {/* Button 1 — reveal allocation */}
        <Card className="mt-3 p-5">
          <h3 className="text-[14px] font-semibold text-zinc-100">
            Reveal my allocation
            <span className="ml-1.5 font-normal text-zinc-500">
              — checks eligibility, grants decrypt access, then decrypts
            </span>
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
            Your allocation stays private until your wallet decrypts it. This
            sequence checks the claim, sends the decrypt-access transaction, and
            reveals the amount only in your browser.
          </p>
          <div className="mt-3.5">
            <button
              type="button"
              onClick={handleRevealAllocation}
              disabled={!baseGatesOk || busy}
              className={primaryButtonClass}
            >
              {elig.phase === "running"
                ? "Checking eligibility..."
                : grant.phase === "pending"
                  ? "Granting decrypt access..."
                  : decrypt.phase === "running"
                    ? "Decrypting allocation..."
                : "Reveal my allocation"}
            </button>
          </div>
          <div className="mt-4 grid gap-2 text-[13px] text-zinc-400">
            <div className="flex items-center gap-2.5">
              <Badge tone={elig.phase === "success" ? "proven" : elig.phase === "error" ? "pending" : "neutral"}>
                {elig.phase === "success" ? "Done" : elig.phase === "running" ? "Running" : elig.phase === "error" ? "Check" : "Ready"}
              </Badge>
              <span>Checking eligibility</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Badge tone={grant.phase === "success" ? "proven" : grant.phase === "error" ? "pending" : grant.phase === "pending" ? "confidential" : "neutral"}>
                {grant.phase === "success" ? "Done" : grant.phase === "pending" ? "Running" : grant.phase === "error" ? "Check" : "Ready"}
              </Badge>
              <span>Granting decrypt access</span>
              {grant.phase === "success" && <TxLink hash={grant.hash} />}
            </div>
            <div className="flex items-center gap-2.5">
              <Badge tone={decrypt.phase === "success" ? "proven" : decrypt.phase === "error" ? "pending" : decrypt.phase === "running" ? "confidential" : "neutral"}>
                {decrypt.phase === "success" ? "Done" : decrypt.phase === "running" ? "Running" : decrypt.phase === "error" ? "Check" : "Ready"}
              </Badge>
              <span>Decrypting allocation</span>
            </div>
          </div>
          {elig.phase === "error" && (
            <p className="mt-3 text-[13px] leading-relaxed text-rose-300">{elig.message}</p>
          )}
          {grant.phase === "error" && (
            <p className="mt-3 text-[13px] leading-relaxed text-rose-300">{grant.message}</p>
          )}
          {decrypt.phase === "error" && (
            <p className="mt-3 text-[13px] leading-relaxed text-rose-300">{decrypt.message}</p>
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
                  Matches the amount label returned in the vault capsule.
                </p>
              )}
              {decrypt.matches === false && (
                <p className="mt-2 text-[13px] text-rose-300">
                  Does not match the vault capsule&apos;s amount label ({matched?.amount}) —
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

        {/* Button 2 — claim (irreversible) */}
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
          <label className="mt-4 flex cursor-pointer items-start gap-3 text-[13px] text-rose-100/90">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-rose-500"
            />
            <span>
              I understand this claim can only be used once.
              <span className="block text-[12px] leading-relaxed text-rose-200/60">
                Claiming consumes the authorization forever. Reveal and verify
                do not consume it.
              </span>
            </span>
          </label>
          <div className="mt-3.5">
            <button
              type="button"
              onClick={handleClaim}
              disabled={!claimGatesOk || busy || elig.phase !== "success"}
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

        {/* Button 3 — verify */}
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
              disabled={!baseGatesOk || busy || claim.phase !== "success"}
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
