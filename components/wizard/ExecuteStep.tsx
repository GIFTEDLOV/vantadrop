"use client";

/**
 * Execute Distribution — the wizard's live issuer flow (first live phase).
 *
 * This replaces the previous phase's honest "not yet wired" panel with the
 * real thing: clicking "Create confidential distribution" runs the exact
 * sequence proven by scripts/spike-tokenops-sepolia.ts and the live browser
 * diagnostics, against real Sepolia, with real gas:
 *
 *   1. gates (wallet, Sepolia, valid recipients, burner acknowledgement)
 *   2. checking-operator     — free isOperator read
 *   3. approving-operator    — setOperator tx, ONLY if needed
 *   4. creating-and-funding  — createAndFundConfidentialAirdrop (1 tx; the
 *                              funding total is encrypted in-flight)
 *   5. encrypting-allocations — per-recipient encryptUint64 (free, relayer)
 *   6. signing-claims        — per-recipient EIP-712 signature (free, N prompts)
 *   7. registering-metadata  — VantaDropRegistry.registerDistribution (1 tx,
 *                              PUBLIC metadata only)
 *   8. save package to localStorage + result screen
 *
 * ORDERING NOTE: encryption runs AFTER create-and-fund, not before. Each
 * recipient's proof is bound to (airdropCloneAddress, recipientAddress) at
 * encrypt time (the ACL binding rule — see lib/tokenops/issuer.ts and
 * research doc §5), so the clone address must exist first. The funding total
 * inside create-and-fund is encrypted separately by the factory client.
 *
 * HONESTY CONTRACT: every status below reflects a real SDK call's real
 * outcome. No code path renders success without the underlying promise
 * resolving. "Wired" (this code exists) is not "proven live" (a human ran it
 * against Sepolia) — as of this phase the full sequence has NOT been run
 * live; the project owner does that with a burner wallet.
 *
 * PRIVACY: plaintext recipients/amounts exist only in this browser (component
 * memory + the localStorage package, lib/distribution.ts). The only on-chain
 * write with any distribution metadata is registerDistribution, which gets
 * title/useCase/token/clone/COUNT/metadataURI — nothing recipient-specific.
 */

import { useState } from "react";
import Link from "next/link";
import type { Address, Hex } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";
import { erc7984OperatorAbi } from "@tokenops/sdk/fhe";
import { isTokenOpsSdkError } from "@tokenops/sdk/fhe-airdrop";
import {
  CTTT_DECIMALS,
  CTTT_SYMBOL,
  CTTT_TOKEN_ADDRESS,
  REGISTRY_ADDRESS,
  SEPOLIA_CHAIN_ID,
  TOKENOPS_AIRDROP_FACTORY,
  etherscanAddress,
  shortHex,
} from "../../lib/constants";
import { formatRawUnits, toRawUnits, type CsvParseResult } from "../../lib/csv";
import {
  saveDistributionPackage,
  type DistributionPackage,
} from "../../lib/distribution";
import { getBrowserFheBundle } from "../../lib/tokenops/browser";
import {
  createAndFundAirdrop,
  encryptRecipientAllocations,
  ensureAirdropFactoryOperator,
  signRecipientClaims,
} from "../../lib/tokenops/issuer";
import { writeRegisterDistribution } from "../../lib/registry/client";
import { AddressLink, Badge, Card, KeyValueRow, TxLink } from "../ui";
import { useSepoliaWallet } from "../wallet/hooks";
import { WalletStatusBar } from "../wallet/WalletStatusBar";
import type { DistributionType, WizardState } from "./types";

/**
 * Hard safety cap for this phase: live execution refuses more than 3
 * recipients. The list is never truncated — the button is disabled and the
 * user is told to reduce the list. Raise only after the flow is proven live.
 */
export const LIVE_RECIPIENT_CAP = 3;

/** Claim window mirrors the proven spike: opens now, closes in 7 days. */
const CLAIM_WINDOW_SECONDS = 7 * 86400;

/**
 * Wall-clock helpers, module-scoped so the react-hooks purity lint can see
 * they are only ever invoked from the click-triggered execution run (never
 * during render).
 */
function nowUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
function nowMs(): number {
  return Date.now();
}

/* ------------------------------------------------------------------ */
/* Execution state machine                                             */
/* ------------------------------------------------------------------ */

type TimelineStepId =
  | "checking-operator"
  | "approving-operator"
  | "encrypting-allocations"
  | "creating-and-funding"
  | "signing-claims"
  | "registering-metadata";

type ExecutionPhase = "idle" | TimelineStepId | "completed" | "failed";

interface TimelineStep {
  id: TimelineStepId;
  label: string;
  status: "running" | "success" | "error";
  /** Live progress / outcome detail ("2/3 encrypted", "already approved", …). */
  detail?: string;
  /** Real tx hash, only when this step actually sent a transaction. */
  hash?: Hex;
  /** Specific, human-readable error — set only on status "error". */
  errorMessage?: string;
}

const STEP_LABELS: Record<TimelineStepId, string> = {
  "checking-operator": "Check operator approval (free read)",
  "approving-operator": "Approve TokenOps factory as operator (1 tx)",
  "creating-and-funding": "Create + fund confidential airdrop (1 tx)",
  "encrypting-allocations": "Encrypt recipient allocations (free, relayer)",
  "signing-claims": "Sign claim authorizations (free, 1 signature per recipient)",
  "registering-metadata": "Register public metadata in VantaDropRegistry (1 tx)",
};

interface ExecutionOutcome {
  airdrop: Address;
  createHash: Hex;
  operatorHash?: Hex;
  registryHash?: Hex;
  registryId?: number;
  /** Set when steps 5–8 succeeded but the registry write failed (partial success). */
  registryError?: string;
  pkg: DistributionPackage;
}

/* ------------------------------------------------------------------ */
/* Error translation — SDK typed codes first, viem/generic fallback    */
/* ------------------------------------------------------------------ */

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0];
}

/**
 * Turn a thrown error into a specific, actionable message. Uses the SDK's own
 * stable error codes (isTokenOpsSdkError / TokenOpsSdkErrorCode — see
 * docs/research/tokenops-sdk-notes.md "Error handling") before falling back
 * to viem shapes and finally the raw first line. No invented taxonomy.
 */
function describeExecutionError(error: unknown, stepId: TimelineStepId): string {
  if (isTokenOpsSdkError(error)) {
    switch (error.code) {
      case "TOKENOPS_WALLET_REJECTED":
        return "Transaction rejected in your wallet — nothing was sent for this step.";
      case "TOKENOPS_USER_REJECTED":
        return "Signature request rejected in your wallet.";
      case "TOKENOPS_INSUFFICIENT_GAS_FUNDS":
        return "Not enough Sepolia ETH in your wallet to pay gas for this transaction. Top up the burner wallet from a Sepolia faucet and retry.";
      case "TOKENOPS_INSUFFICIENT_BALANCE":
        return `Your confidential ${CTTT_SYMBOL} balance is lower than the total allocation you are trying to fund. Mint more via the TokenOps testnet faucet first.`;
      case "TOKENOPS_WALLET_CHAIN_MISMATCH":
        return "Your wallet left Sepolia mid-flow. Switch back to Sepolia and retry.";
      case "TOKENOPS_RELAYER_UNREACHABLE":
        return "The Zama testnet relayer is unreachable (network filter or outage). Encryption cannot proceed — retry later.";
      case "TOKENOPS_ENCRYPTION_FAILED":
        return `Client-side encryption failed: ${firstLine(error)}`;
      case "TOKENOPS_SIGNING_FAILED":
        return `Claim-authorization signing failed: ${firstLine(error)}`;
      case "TOKENOPS_NETWORK_ERROR":
        return `Network/RPC error: ${firstLine(error)}`;
      case "TOKENOPS_UNKNOWN_WRITE_FAILURE":
        return `Transaction failed to send (unknown write failure): ${firstLine(error)}`;
      default:
        return `${error.code}: ${firstLine(error)}`;
    }
  }
  // Registry writes go through plain viem (no TokenOps SDK) — surface a
  // wallet rejection there distinctly instead of a generic failure.
  if (
    error instanceof Error &&
    (error.name === "UserRejectedRequestError" ||
      error.message.includes("User rejected"))
  ) {
    return "Transaction rejected in your wallet — nothing was sent for this step.";
  }
  const context: Record<TimelineStepId, string> = {
    "checking-operator": "Operator check failed",
    "approving-operator": "Operator approval failed",
    "creating-and-funding": "Create + fund failed",
    "encrypting-allocations": "Allocation encryption failed",
    "signing-claims": "Claim signing failed",
    "registering-metadata": "Registry metadata registration failed",
  };
  return `${context[stepId]}: ${firstLine(error)}`;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function ExecuteStep({
  state,
  parsed,
  selectedType,
}: {
  state: WizardState;
  parsed: CsvParseResult;
  selectedType: DistributionType | null;
}) {
  const wallet = useSepoliaWallet();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [burnerAck, setBurnerAck] = useState(false);
  const [phase, setPhase] = useState<ExecutionPhase>("idle");
  const [timeline, setTimeline] = useState<TimelineStep[]>([]);
  const [outcome, setOutcome] = useState<ExecutionOutcome | undefined>();
  /** Clone address surfaced even on failure, if create+fund had already succeeded. */
  const [partialAirdrop, setPartialAirdrop] = useState<
    { airdrop: Address; hash: Hex } | undefined
  >();
  const [copied, setCopied] = useState<"package" | "instructions" | undefined>();

  const running =
    phase !== "idle" && phase !== "completed" && phase !== "failed";

  // Same validity signal the Recipients step gate uses — no separate path.
  const recipientsValid = parsed.validCount >= 1 && parsed.errorCount === 0;
  const overCap = parsed.validCount > LIVE_RECIPIENT_CAP;
  const title = state.title.trim();
  const useCase = selectedType?.label ?? "";
  const tokenAddress = state.tokenAddress.trim() as Address;
  const totalRaw = BigInt(parsed.totalRaw);

  const checks = [
    {
      ok: wallet.isConnected,
      label: "Wallet connected",
      missing: "Connect a browser wallet using the panel above.",
    },
    {
      ok: wallet.isOnSepolia,
      label: `Sepolia network selected (chain id ${SEPOLIA_CHAIN_ID})`,
      missing: wallet.isConnected
        ? "Switch your wallet to Sepolia using the panel above."
        : "Requires a connected wallet first.",
    },
    {
      ok: recipientsValid,
      label: `Recipients valid (${parsed.validCount} valid, ${parsed.errorCount} error${parsed.errorCount === 1 ? "" : "s"})`,
      missing: "Go back to the Recipients step and fix the CSV.",
    },
    {
      ok: !overCap,
      label: `At most ${LIVE_RECIPIENT_CAP} recipients (live-phase safety cap)`,
      missing: `Live execution in this phase is capped at ${LIVE_RECIPIENT_CAP} recipients — you have ${parsed.validCount}. Reduce your recipient list to proceed (it will not be truncated automatically).`,
    },
    {
      ok: title.length > 0 && !!selectedType,
      label: "Title and distribution type set",
      missing: "Go back to the Type step and set a title and distribution type.",
    },
    {
      ok: burnerAck,
      label: "Burner wallet confirmed",
      missing: "Check the burner-wallet acknowledgement below.",
    },
  ];

  const canExecute =
    checks.every((c) => c.ok) && !running && !!publicClient && !!walletClient;

  // Real prompt count for the connected run: 1 create+fund + N signatures +
  // 1 registry, plus 1 operator approval only if not already granted.
  const minPrompts = parsed.validCount + 2;
  const maxPrompts = parsed.validCount + 3;

  function pushStep(id: TimelineStepId, detail?: string) {
    setTimeline((t) => [
      ...t,
      { id, label: STEP_LABELS[id], status: "running", detail },
    ]);
  }

  function updateStep(id: TimelineStepId, patch: Partial<TimelineStep>) {
    setTimeline((t) => t.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function handleExecute() {
    if (running || !canExecute) return;
    if (!publicClient || !walletClient || !wallet.address) return;
    const sender = wallet.address;

    // Plaintext allocations: browser memory only from here on.
    const validRows = parsed.rows.filter((r) => r.errors.length === 0);
    const allocations = validRows.map((row) => ({
      recipient: row.wallet as Address,
      amountRaw: toRawUnits(row.amount, CTTT_DECIMALS),
    }));

    setTimeline([]);
    setOutcome(undefined);
    setPartialAirdrop(undefined);
    setCopied(undefined);

    let currentStep: TimelineStepId = "checking-operator";
    // Captured locally (not via React state) so the async run can read it
    // back synchronously when assembling the package.
    let operatorHash: Hex | undefined;
    try {
      /* ---- 1/2. checking-operator (free read) ---------------------- */
      setPhase("checking-operator");
      pushStep("checking-operator");
      // Same free isOperator read ensureAirdropFactoryOperator performs
      // internally (and the diagnostic page proved live) — done explicitly
      // here so the timeline can honestly distinguish "checking" from
      // "approving" instead of showing one opaque combined state.
      const alreadyOperator = await publicClient.readContract({
        address: tokenAddress,
        abi: erc7984OperatorAbi,
        functionName: "isOperator",
        args: [sender, TOKENOPS_AIRDROP_FACTORY as Address],
      });
      updateStep("checking-operator", {
        status: "success",
        detail: alreadyOperator
          ? "Factory already an authorized operator — no approval transaction needed"
          : "Approval required — one transaction follows",
      });

      /* ---- 3. approving-operator (only if actually needed) ---------- */
      if (!alreadyOperator) {
        currentStep = "approving-operator";
        setPhase("approving-operator");
        pushStep("approving-operator", "Confirm the prompt in your wallet…");
        // FOOTGUN NOTE (proven live via the diagnostic, tx 0x368d42…2585):
        // `account` is deliberately omitted inside this call — it falls back
        // to walletClient.account (wagmi's json-rpc account), which routes
        // signing to the wallet extension. Never pass a bare address string.
        const approval = await ensureAirdropFactoryOperator({
          publicClient,
          walletClient,
          token: tokenAddress,
        });
        operatorHash = approval.hash;
        updateStep("approving-operator", {
          status: "success",
          hash: approval.hash,
          detail: approval.alreadyOperator
            ? "Already approved at send time — no transaction was sent"
            : "Operator approval confirmed on Sepolia",
        });
      }

      /* ---- 4. creating-and-funding (1 tx) --------------------------- */
      currentStep = "creating-and-funding";
      setPhase("creating-and-funding");
      pushStep(
        "creating-and-funding",
        "Preparing encryption (first run downloads FHE params — can take a while), then confirm the prompt in your wallet…",
      );
      // Bundle construction is memoized per (address, chain); the relayer
      // worker + CDN WASM fetch happen lazily on first use inside the call.
      const bundle = getBrowserFheBundle({ publicClient, walletClient });
      const nowSeconds = nowUnixSeconds();
      // FOOTGUN NOTE: `account` omitted inside createAndFundAirdrop too —
      // same walletClient.account fallback rule as above.
      const created = await createAndFundAirdrop({
        publicClient,
        walletClient,
        encryptor: bundle.encryptor,
        token: tokenAddress,
        totalAmountRaw: totalRaw,
        // Mirrors the proven spike's window: opens immediately, 7 days.
        startTimestamp: nowSeconds,
        endTimestamp: nowSeconds + CLAIM_WINDOW_SECONDS,
        canExtendClaimWindow: false,
      });
      setPartialAirdrop({ airdrop: created.airdrop, hash: created.hash });
      updateStep("creating-and-funding", {
        status: "success",
        hash: created.hash,
        detail: `Airdrop clone deployed and funded at ${shortHex(created.airdrop)}`,
      });

      /* ---- 5. encrypting-allocations (free) -------------------------
       * Runs AFTER create-and-fund by necessity: each proof is bound to
       * (clone address, recipient address) — see the ordering note in the
       * file header. */
      currentStep = "encrypting-allocations";
      setPhase("encrypting-allocations");
      pushStep(
        "encrypting-allocations",
        `0/${allocations.length} encrypted — one relayer round-trip each, no wallet prompt`,
      );
      const encrypted = await encryptRecipientAllocations({
        encryptor: bundle.encryptor,
        airdropAddress: created.airdrop,
        allocations,
        onProgress: (done, total) =>
          updateStep("encrypting-allocations", {
            detail: `${done}/${total} encrypted — one relayer round-trip each, no wallet prompt`,
          }),
      });
      updateStep("encrypting-allocations", {
        status: "success",
        detail: `${encrypted.length}/${allocations.length} allocations encrypted (recipient-bound proofs)`,
      });

      /* ---- 6. signing-claims (free, N prompts) ----------------------- */
      currentStep = "signing-claims";
      setPhase("signing-claims");
      pushStep(
        "signing-claims",
        `0/${encrypted.length} signed — expect ${encrypted.length} EIP-712 signature prompt${encrypted.length === 1 ? "" : "s"}`,
      );
      const payloads = await signRecipientClaims({
        walletClient,
        airdropAddress: created.airdrop,
        allocations: encrypted,
        onProgress: (done, total) =>
          updateStep("signing-claims", { detail: `${done}/${total} signed` }),
      });
      updateStep("signing-claims", {
        status: "success",
        detail: `${payloads.length}/${encrypted.length} claim authorizations signed`,
      });

      /* ---- Save the local package BEFORE the registry write, so a
       * registry failure can never lose the sender's claim data. -------- */
      const pkg: DistributionPackage = {
        distributionId: crypto.randomUUID(),
        title,
        useCase,
        network: "Sepolia",
        chainId: SEPOLIA_CHAIN_ID,
        sender,
        token: tokenAddress,
        tokenOpsFactory: TOKENOPS_AIRDROP_FACTORY as Address,
        tokenOpsAirdrop: created.airdrop,
        registry: REGISTRY_ADDRESS as Address,
        recipientCount: payloads.length,
        recipients: payloads.map((payload, i) => ({
          wallet: payload.recipient,
          note: validRows[i].note,
          amount: validRows[i].amount,
          claimAuthorization: payload.signature,
          // Safe descriptor only: opaque ciphertext id (shortened) + proof
          // size. Never a plaintext amount.
          encryptedHandleSummary: `handle ${shortHex(payload.encryptedInput.handle, 10)} · proof ${(payload.encryptedInput.inputProof.length - 2) / 2} bytes`,
        })),
        txHashes: {
          // operatorApproval present only if approval actually sent a
          // transaction this run.
          ...(operatorHash ? { operatorApproval: operatorHash } : {}),
          createAndFund: created.hash,
        },
        createdAt: nowMs(),
      };
      saveDistributionPackage(pkg);

      /* ---- 7. registering-metadata (1 tx) — PARTIAL-FAILURE ZONE ----- */
      currentStep = "registering-metadata";
      setPhase("registering-metadata");
      pushStep("registering-metadata", "Confirm the prompt in your wallet…");
      try {
        // PRIVACY — deliberate and load-bearing: this on-chain write receives
        // ONLY public metadata: token, clone address, title, use case,
        // recipient COUNT, and an empty metadataURI. No recipient addresses,
        // no amounts, no notes, no signatures, no encrypted handles. The
        // registry ABI has no parameter shaped to accept them, and none are
        // passed. (writeRegisterDistribution passes the full wagmi account
        // object internally — never a bare address string.)
        const registered = await writeRegisterDistribution({
          publicClient,
          walletClient,
          distribution: {
            token: tokenAddress,
            tokenOpsAirdrop: created.airdrop,
            title,
            useCase,
            recipientCount: BigInt(payloads.length),
            metadataURI: "",
          },
        });
        updateStep("registering-metadata", {
          status: "success",
          hash: registered.hash,
          detail: `Registered as distribution #${registered.id.toString()}`,
        });
        const finalPkg: DistributionPackage = {
          ...pkg,
          registryDistributionId: Number(registered.id),
          txHashes: { ...pkg.txHashes, registry: registered.hash },
        };
        saveDistributionPackage(finalPkg);
        setOutcome({
          airdrop: created.airdrop,
          createHash: created.hash,
          operatorHash: pkg.txHashes.operatorApproval,
          registryHash: registered.hash,
          registryId: Number(registered.id),
          pkg: finalPkg,
        });
      } catch (registryError) {
        // Registry failure is NOT a distribution failure. The TokenOps
        // airdrop is created, funded, and fully signed — the registry is
        // optional public metadata, never the source of truth
        // (docs/research/registry-decision.md). Surface both truths.
        const message = describeExecutionError(
          registryError,
          "registering-metadata",
        );
        updateStep("registering-metadata", {
          status: "error",
          errorMessage: message,
        });
        setOutcome({
          airdrop: created.airdrop,
          createHash: created.hash,
          operatorHash: pkg.txHashes.operatorApproval,
          registryError: message,
          pkg,
        });
      }
      setPhase("completed");
    } catch (error) {
      const message = describeExecutionError(error, currentStep);
      updateStep(currentStep, { status: "error", errorMessage: message });
      setPhase("failed");
    }
  }

  async function copyText(kind: "package" | "instructions", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(undefined), 2000);
    } catch {
      // Clipboard unavailable — the JSON/instructions remain viewable via the
      // package in localStorage; nothing to fake here.
    }
  }

  function recipientInstructions(o: ExecutionOutcome): string {
    return [
      `You have a confidential token allocation waiting in "${o.pkg.title}" (VantaDrop, Sepolia testnet).`,
      "",
      `Airdrop contract (TokenOps confidential airdrop clone): ${o.airdrop}`,
      `View on Etherscan: ${etherscanAddress(o.airdrop)}`,
      `Token: ${o.pkg.token}`,
      "",
      "Your allocation amount is encrypted on-chain — only you will be able to decrypt it.",
      "",
      "IMPORTANT: the in-browser recipient claim flow is not live yet — recipient decrypt/claim wiring is the next phase of this project. The sender holds your encrypted claim payload and will share claim steps once the recipient portal ships. A demo walkthrough of what that flow will look like is at the sender's VantaDrop /recipient/demo page.",
    ].join("\n");
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Execute distribution</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Live issuer flow — this sends real Sepolia transactions from your connected
          wallet.
        </p>
      </div>

      <WalletStatusBar />

      {/* -------- What will be executed (real, current values) -------- */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-white">Distribution summary</h3>
        <div className="mt-2">
          <KeyValueRow label="Title (public — stored on-chain in the registry)">
            {title || <span className="text-amber-300">Not set — go back to the Type step</span>}
          </KeyValueRow>
          <KeyValueRow label="Use case (public)">
            {selectedType ? `${selectedType.icon} ${selectedType.label}` : (
              <span className="text-amber-300">Not set</span>
            )}
          </KeyValueRow>
          <KeyValueRow label="Recipients (count is public; the list never goes on-chain)">
            {parsed.validCount}
          </KeyValueRow>
          <KeyValueRow label="Total allocation (encrypted in-flight, never public)">
            {formatRawUnits(totalRaw, CTTT_DECIMALS)}{" "}
            {tokenAddress.toLowerCase() === CTTT_TOKEN_ADDRESS.toLowerCase()
              ? CTTT_SYMBOL
              : "tokens"}
          </KeyValueRow>
          <KeyValueRow label="Token (ERC-7984)">
            <AddressLink address={tokenAddress} />
          </KeyValueRow>
          <KeyValueRow label="TokenOps airdrop factory">
            <AddressLink address={TOKENOPS_AIRDROP_FACTORY} />
          </KeyValueRow>
          <KeyValueRow label="VantaDropRegistry (public metadata only)">
            <AddressLink address={REGISTRY_ADDRESS} />
          </KeyValueRow>
          <KeyValueRow label="Claim window">
            Opens immediately, closes after 7 days (spike-proven default)
          </KeyValueRow>
          <KeyValueRow label="Wallet prompts to expect">
            {parsed.validCount >= 1
              ? `${minPrompts}–${maxPrompts}: 1 create & fund tx + ${parsed.validCount} claim signature${parsed.validCount === 1 ? "" : "s"} + 1 registry tx, plus 1 operator-approval tx only if not already granted`
              : "—"}
          </KeyValueRow>
        </div>
      </Card>

      {/* -------- Warning + burner acknowledgement -------- */}
      <Card className="border-amber-500/40 bg-amber-500/10 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="pending">Real Sepolia execution</Badge>
          <Badge tone="pending">Burner wallet required</Badge>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-amber-200">
          This will create a REAL confidential distribution on Sepolia: real gas will be
          spent and real test tokens will be locked into a new TokenOps airdrop clone.
          There is no resume in this phase — if the flow fails partway after the
          create-and-fund transaction, retrying creates and funds a NEW clone.
        </p>
        <label className="mt-4 flex cursor-pointer items-start gap-3 text-[14px] text-zinc-100">
          <input
            type="checkbox"
            checked={burnerAck}
            onChange={(e) => setBurnerAck(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-violet-500"
          />
          <span>
            I am using a burner wallet and understand this will use real Sepolia gas/test
            tokens.
          </span>
        </label>
      </Card>

      {/* -------- Readiness checklist (real, live-checked) -------- */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-white">Execution readiness</h3>
        <ul className="mt-4 space-y-2.5">
          {checks.map((check) => (
            <li key={check.label} className="flex items-start gap-2.5 text-[13px]">
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] ${
                  check.ok
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                }`}
              >
                {check.ok ? "✓" : "!"}
              </span>
              <span className={check.ok ? "text-zinc-300" : "text-zinc-400"}>
                {check.label}
                {!check.ok && (
                  <span className="ml-2 text-amber-300/90">— {check.missing}</span>
                )}
              </span>
            </li>
          ))}
        </ul>

        {overCap && (
          <p className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-[13px] leading-relaxed text-amber-200">
            Live execution in this phase is capped at {LIVE_RECIPIENT_CAP} recipients —
            you have {parsed.validCount}. Reduce your recipient list to proceed. The
            list is never truncated silently.
          </p>
        )}

        <div className="mt-5">
          <button
            type="button"
            disabled={!canExecute}
            onClick={handleExecute}
            className="rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? "Executing — follow your wallet prompts…" : "Create confidential distribution"}
          </button>
        </div>
      </Card>

      {/* -------- Execution timeline (real step-by-step outcomes) -------- */}
      {timeline.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-white">Execution timeline</h3>
          <p className="mt-1 text-[13px] text-zinc-500">
            Every status below reflects a real call&apos;s real outcome — nothing is
            simulated.
          </p>
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
        </Card>
      )}

      {/* -------- Failure panel -------- */}
      {phase === "failed" && (
        <Card className="border-rose-500/30 bg-rose-500/[0.05] p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="pending">Execution stopped</Badge>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            The flow stopped at the step marked above — the specific error is shown in
            the timeline. Nothing after that step was executed, and no success was
            fabricated.
          </p>
          {partialAirdrop && (
            <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-4 text-[13px] leading-relaxed text-amber-200">
              <p className="font-semibold">
                Important: the airdrop clone WAS already created and funded before the
                failure.
              </p>
              <p className="mt-2">
                Clone: <AddressLink address={partialAirdrop.airdrop} /> · Create tx:{" "}
                <TxLink hash={partialAirdrop.hash} />
              </p>
              <p className="mt-2">
                Your tokens are locked in that clone. This phase has no resume — running
                the flow again creates and funds a new clone rather than continuing this
                one.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* -------- Result panel (full or partial success) -------- */}
      {phase === "completed" && outcome && (
        <Card className="border-emerald-500/30 bg-emerald-500/[0.04] p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="proven">TokenOps distribution created successfully</Badge>
            {outcome.registryError ? (
              <Badge tone="pending">Registry metadata registration failed</Badge>
            ) : (
              <Badge tone="proven">Registry metadata registered</Badge>
            )}
          </div>

          <div className="mt-3">
            <KeyValueRow label="Airdrop clone">
              <AddressLink address={outcome.airdrop} />
            </KeyValueRow>
            <KeyValueRow label="Create + fund tx">
              <TxLink hash={outcome.createHash} />
            </KeyValueRow>
            {outcome.operatorHash && (
              <KeyValueRow label="Operator approval tx">
                <TxLink hash={outcome.operatorHash} />
              </KeyValueRow>
            )}
            {outcome.registryHash && (
              <KeyValueRow label="Registry tx">
                <TxLink hash={outcome.registryHash} />
              </KeyValueRow>
            )}
            {outcome.registryId !== undefined && (
              <KeyValueRow label="Registry distribution id">
                #{outcome.registryId}
              </KeyValueRow>
            )}
          </div>

          {outcome.registryError && (
            <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-4 text-[13px] leading-relaxed text-amber-200">
              <p className="font-semibold">Registry metadata registration failed:</p>
              <p className="mt-1">{outcome.registryError}</p>
              <p className="mt-2 text-amber-200/90">
                This does NOT affect the distribution itself — the registry is optional
                public metadata, never the source of truth. Your airdrop clone is live
                and fully signed; share the clone address and package below directly.
              </p>
            </div>
          )}

          <p className="mt-4 rounded-lg border border-violet-500/25 bg-violet-500/[0.06] px-4 py-3 text-[13px] leading-relaxed text-violet-200">
            The full distribution package (recipient list, amounts, notes, claim
            authorizations) was saved to your browser&apos;s local storage — this is not
            on-chain and not shared with anyone. Only the public metadata above (title,
            use case, addresses, recipient count) exists on-chain.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() =>
                copyText("package", JSON.stringify(outcome.pkg, null, 2))
              }
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[13px] font-medium text-zinc-200 transition hover:bg-white/10"
            >
              {copied === "package" ? "Copied ✓" : "Copy distribution package JSON"}
            </button>
            <button
              type="button"
              onClick={() =>
                copyText("instructions", recipientInstructions(outcome))
              }
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[13px] font-medium text-zinc-200 transition hover:bg-white/10"
            >
              {copied === "instructions"
                ? "Copied ✓"
                : "Copy recipient portal instructions"}
            </button>
            <Link
              href="/drop/demo"
              className="text-[13px] text-violet-300 underline decoration-violet-500/40 underline-offset-4 hover:text-violet-200"
            >
              View the demo Distribution Room →
            </Link>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
            Next steps: keep the package JSON safe (it holds each recipient&apos;s claim
            authorization), and deliver claim data to recipients out-of-band. The demo
            Distribution Room link above is a demo example — this new distribution does
            not have its own room page yet, and the in-browser recipient decrypt/claim
            flow is the next phase.
          </p>
        </Card>
      )}
    </div>
  );
}