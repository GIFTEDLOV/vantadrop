/**
 * Recipient-side claim package import: pure parsing, validation, and
 * error-formatting helpers for the public recipient portal
 * (components/RecipientPortal.tsx → /recipient/demo).
 *
 * EXTRACTION NOTE: this is a faithful port of the validation logic the hidden
 * developer diagnostic (app/dev/recipient-claim-diagnostic/page.tsx) proved
 * live on Sepolia on 2026-07-05 — same hex shape checks, same
 * encryptedHandleSummary cross-check. The diagnostic page itself is frozen as
 * the proven developer-only reference surface and is deliberately NOT
 * modified to import this module; it keeps its own inline copy. This module
 * is the forward-looking home for the same rules, with two deliberate
 * differences for the productized portal:
 *
 *   1. Per-field error COLLECTION — the portal reports every problem in the
 *      pasted package at once (specific field + message), not only the first.
 *   2. `recipients[].encryptedInput` is REQUIRED. lib/distribution.ts made it
 *      a required field on 2026-07-05 and every package produced by the
 *      current /create flow carries it automatically. The portal is the
 *      forward-looking product page, so it does not implement the
 *      diagnostic's manual-paste fallback for pre-fix packages — a package
 *      missing the field gets a specific error telling the recipient to ask
 *      their sender for a freshly exported package.
 *
 * PRIVACY (load-bearing): everything here is pure functions over
 * caller-supplied strings. Nothing in this module logs, persists, or
 * transmits anything — the claim material (claimAuthorization,
 * encryptedInput, plaintext amount) exists only in the calling component's
 * in-memory React state and is never echoed to the console.
 */

import type { Hex } from "viem";
import { isAddress } from "viem";
import type { EncryptedInput } from "@tokenops/sdk/fhe-airdrop";
import { isTokenOpsSdkError } from "@tokenops/sdk/fhe-airdrop";
import { SEPOLIA_CHAIN_ID } from "./constants";
import type {
  DistributionPackage,
  DistributionPackageRecipient,
} from "./distribution";

/* ------------------------------------------------------------------ */
/* Basic shape checks                                                   */
/* ------------------------------------------------------------------ */

/** Non-empty even-length 0x-hex; optionally an exact byte length. */
export function isHexOfBytes(value: unknown, bytes?: number): value is Hex {
  if (typeof value !== "string") return false;
  if (!/^0x[0-9a-fA-F]*$/.test(value)) return false;
  if ((value.length - 2) % 2 !== 0) return false;
  if (bytes !== undefined && value.length !== 2 + bytes * 2) return false;
  return value.length > 2;
}

/* ------------------------------------------------------------------ */
/* Package validation (per-field error collection)                      */
/* ------------------------------------------------------------------ */

export interface PackageFieldError {
  /** Dotted path of the offending field, e.g. "recipients[0].wallet". */
  field: string;
  message: string;
}

export type PackageValidation =
  | { ok: true; pkg: DistributionPackage }
  | { ok: false; errors: PackageFieldError[] };

/**
 * Validate a pasted/uploaded claim package against the exact
 * DistributionPackage shape from lib/distribution.ts. Collects every
 * field-level problem instead of stopping at the first, so the portal can
 * show the recipient a complete, specific list.
 */
export function validateDistributionPackage(raw: string): PackageValidation {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      errors: [
        {
          field: "(package)",
          message:
            "Not valid JSON. Copy the entire package exactly as your sender shared it — including the opening and closing braces.",
        },
      ],
    };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return {
      ok: false,
      errors: [
        {
          field: "(package)",
          message: "Expected a JSON object (the claim package your sender shared).",
        },
      ],
    };
  }

  const pkg = data as Partial<DistributionPackage>;
  const errors: PackageFieldError[] = [];

  if (pkg.network !== "Sepolia") {
    errors.push({
      field: "network",
      message: `Must be "Sepolia" — got ${JSON.stringify(pkg.network)}.`,
    });
  }
  if (pkg.chainId !== SEPOLIA_CHAIN_ID) {
    errors.push({
      field: "chainId",
      message: `Must be ${SEPOLIA_CHAIN_ID} (Sepolia) — got ${JSON.stringify(pkg.chainId)}.`,
    });
  }
  if (typeof pkg.tokenOpsAirdrop !== "string" || !isAddress(pkg.tokenOpsAirdrop)) {
    errors.push({
      field: "tokenOpsAirdrop",
      message: "Missing or not a valid Ethereum address (the airdrop contract).",
    });
  }
  if (typeof pkg.token !== "string" || !isAddress(pkg.token)) {
    errors.push({
      field: "token",
      message: "Missing or not a valid Ethereum address (the confidential token).",
    });
  }
  if (!Array.isArray(pkg.recipients) || pkg.recipients.length === 0) {
    errors.push({
      field: "recipients",
      message: "Must be a non-empty array of recipients.",
    });
  } else {
    for (const [i, r] of pkg.recipients.entries()) {
      if (typeof r !== "object" || r === null) {
        errors.push({ field: `recipients[${i}]`, message: "Not an object." });
        continue;
      }
      const rec = r as Partial<DistributionPackageRecipient>;
      if (typeof rec.wallet !== "string" || !isAddress(rec.wallet)) {
        errors.push({
          field: `recipients[${i}].wallet`,
          message: "Missing or not a valid Ethereum address.",
        });
      }
      if (!isHexOfBytes(rec.claimAuthorization)) {
        errors.push({
          field: `recipients[${i}].claimAuthorization`,
          message: "Missing or not 0x-hex — the claim authorization is required.",
        });
      }
      if (rec.encryptedInput === undefined) {
        errors.push({
          field: `recipients[${i}].encryptedInput`,
          message:
            "Missing. This package predates the 2026-07-05 package format and cannot be claimed from this portal — ask your sender for a freshly exported package (current packages include the encrypted input automatically).",
        });
      } else if (
        typeof rec.encryptedInput !== "object" ||
        rec.encryptedInput === null
      ) {
        errors.push({
          field: `recipients[${i}].encryptedInput`,
          message: "Present but not an object — expected { handle, inputProof }.",
        });
      } else {
        const enc = rec.encryptedInput as { handle?: unknown; inputProof?: unknown };
        if (!isHexOfBytes(enc.handle, 32)) {
          errors.push({
            field: `recipients[${i}].encryptedInput.handle`,
            message: "Must be 0x-hex bytes32 (66 characters).",
          });
        }
        if (!isHexOfBytes(enc.inputProof)) {
          errors.push({
            field: `recipients[${i}].encryptedInput.inputProof`,
            message: "Must be non-empty 0x-hex.",
          });
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, pkg: pkg as DistributionPackage };
}

/* ------------------------------------------------------------------ */
/* Recipient matching + claim material resolution                       */
/* ------------------------------------------------------------------ */

/** Case-insensitive match of the connected wallet against recipients[].wallet. */
export function matchRecipient(
  pkg: DistributionPackage,
  connectedAddress: string | undefined,
): DistributionPackageRecipient | undefined {
  if (!connectedAddress) return undefined;
  const lower = connectedAddress.toLowerCase();
  return pkg.recipients.find((r) => r.wallet.toLowerCase() === lower);
}

export type ClaimMaterialResolution =
  | { ok: true; input: EncryptedInput; crossCheckNote: string }
  | { ok: false; error: string };

/**
 * Real computed cross-check of the full encrypted input against the
 * package's truncated `encryptedHandleSummary` (format written by
 * ExecuteStep.tsx: `handle ${shortHex(handle, 10)} · proof ${bytes} bytes`).
 * Same check the diagnostic proved live. Returns `fatal` on a mismatch and a
 * surfaced (never silent) "skipped" note when the summary format is
 * unrecognized.
 */
export function crossCheckAgainstSummary(
  summary: string,
  input: EncryptedInput,
): { fatal: string | null; note: string } {
  const m = /^handle (0x[0-9a-fA-F]{10})…([0-9a-fA-F]{4}) · proof (\d+) bytes$/u.exec(
    summary,
  );
  if (!m) {
    return {
      fatal: null,
      note: "Summary cross-check skipped — the package's encryptedHandleSummary format was unrecognized.",
    };
  }
  const [, prefix, suffix, proofBytesStr] = m;
  const handle = input.handle.toLowerCase();
  const proofBytes = (input.inputProof.length - 2) / 2;
  if (!handle.startsWith(prefix.toLowerCase())) {
    return {
      fatal: `Handle prefix mismatch: the package summary says ${prefix}…, but the encrypted input's handle starts ${input.handle.slice(0, 12)}…`,
      note: "",
    };
  }
  if (!handle.endsWith(suffix.toLowerCase())) {
    return {
      fatal: `Handle suffix mismatch: the package summary says …${suffix}, but the encrypted input's handle ends …${input.handle.slice(-4)}`,
      note: "",
    };
  }
  if (proofBytes !== Number(proofBytesStr)) {
    return {
      fatal: `Proof size mismatch: the package summary says ${proofBytesStr} bytes, but the encrypted input's proof is ${proofBytes} bytes.`,
      note: "",
    };
  }
  return {
    fatal: null,
    note: `Cross-check passed — handle prefix/suffix and proof size (${proofBytes} bytes) match the package's own summary.`,
  };
}

/**
 * Resolve the matched recipient's full encrypted claim input, re-checking
 * shape (belt-and-braces on top of validateDistributionPackage) and
 * cross-checking it against the package's display summary.
 */
export function resolveClaimMaterial(
  recipient: DistributionPackageRecipient,
): ClaimMaterialResolution {
  const enc = recipient.encryptedInput as
    | { handle?: unknown; inputProof?: unknown }
    | undefined;
  if (enc === undefined || typeof enc !== "object" || enc === null) {
    return {
      ok: false,
      error:
        "This package does not include your encrypted claim input — ask your sender for a freshly exported package.",
    };
  }
  if (!isHexOfBytes(enc.handle, 32)) {
    return { ok: false, error: "Encrypted input handle is malformed (expected 0x-hex bytes32)." };
  }
  if (!isHexOfBytes(enc.inputProof)) {
    return { ok: false, error: "Encrypted input proof is malformed (expected non-empty 0x-hex)." };
  }
  const input: EncryptedInput = { handle: enc.handle, inputProof: enc.inputProof };
  const check = crossCheckAgainstSummary(recipient.encryptedHandleSummary ?? "", input);
  if (check.fatal) return { ok: false, error: check.fatal };
  return { ok: true, input, crossCheckNote: check.note };
}

/* ------------------------------------------------------------------ */
/* Error formatting                                                     */
/* ------------------------------------------------------------------ */

export function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0];
}

/**
 * Turn a thrown error from a recipient-side action into a specific, plain
 * message. Uses the SDK's own stable error codes (isTokenOpsSdkError /
 * TokenOpsSdkErrorCode — see docs/research/tokenops-sdk-notes.md "Error
 * handling"), the same pattern ExecuteStep.tsx and the diagnostic use — no
 * invented taxonomy.
 */
export function describeRecipientActionError(error: unknown): string {
  if (isTokenOpsSdkError(error)) {
    switch (error.code) {
      case "TOKENOPS_ALREADY_CLAIMED":
        return "This allocation has already been claimed — the single-use claim authorization is spent.";
      case "TOKENOPS_CLAIM_NOT_STARTED":
        return "The claim window has not opened yet. Try again after the start time.";
      case "TOKENOPS_CLAIM_WINDOW_CLOSED":
        return "The claim window has closed — this allocation can no longer be claimed.";
      case "TOKENOPS_INVALID_SIGNATURE":
        return "The claim authorization in this package is not valid for this wallet. Make sure you are connected with the exact wallet your sender allocated to.";
      case "TOKENOPS_FHE_HANDLE_NOT_ALLOWED":
        return "The contract refused access to the encrypted allocation (this can mean the distribution was never funded). Contact your sender.";
      case "TOKENOPS_USER_DECRYPT_NOT_ALLOWED":
        return "The decryption relayer refused: decrypt access has not been granted on-chain yet. Run “Grant decrypt access” first and wait for it to confirm.";
      case "TOKENOPS_WALLET_REJECTED":
        return "Transaction rejected in your wallet — nothing was sent.";
      case "TOKENOPS_USER_REJECTED":
        return "Signature request rejected in your wallet.";
      case "TOKENOPS_INSUFFICIENT_GAS_FUNDS":
        return "Not enough Sepolia ETH in this wallet to pay for the transaction. Top up from a Sepolia faucet and retry.";
      case "TOKENOPS_INSUFFICIENT_FEE":
        return "The attached claim fee was too low. Re-run the eligibility check to fetch the current fee, then retry.";
      case "TOKENOPS_PAUSED":
        return "This distribution is currently paused by its sender.";
      case "TOKENOPS_WALLET_CHAIN_MISMATCH":
        return "Your wallet left Sepolia mid-action. Switch back to Sepolia and retry.";
      case "TOKENOPS_RELAYER_UNREACHABLE":
        return "The Zama relayer is unreachable (network filter or outage). Retry later — a relayer outage does not affect your claim authorization.";
      case "TOKENOPS_DECRYPTION_FAILED":
        return `Decryption failed: ${firstLine(error)}`;
      case "TOKENOPS_NETWORK_ERROR":
        return `Network/RPC error: ${firstLine(error)}`;
      case "TOKENOPS_UNKNOWN_WRITE_FAILURE":
        return `Transaction failed to send: ${firstLine(error)}`;
      default:
        return `${error.code}: ${firstLine(error)}`;
    }
  }
  if (
    error instanceof Error &&
    (error.name === "UserRejectedRequestError" ||
      error.message.includes("User rejected"))
  ) {
    return "Rejected in your wallet — nothing was sent.";
  }
  return firstLine(error);
}
