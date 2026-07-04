/**
 * CSV recipient-list parsing + validation for the distribution wizard.
 *
 * Format: `wallet,amount,note` — header row optional (auto-detected).
 * This is real client-side validation logic; nothing here touches the network.
 * The `note` column never leaves the browser — it is not written on-chain,
 * not sent to the registry, and not sent to any server.
 */

import { isAddress } from "viem";

export interface CsvRow {
  /** 1-based line number in the pasted text (for error messages). */
  line: number;
  wallet: string;
  /** Raw amount string as typed. */
  amount: string;
  note: string;
  /** Empty when the row is valid. */
  errors: string[];
}

export interface CsvParseResult {
  rows: CsvRow[];
  validCount: number;
  errorCount: number;
  /** Non-blocking warnings (e.g. soft recipient cap exceeded). */
  warnings: string[];
  headerDetected: boolean;
  /** Sum of valid amounts in raw token units (bigint as string), for review display. */
  totalRaw: string;
}

/**
 * Soft cap only: this per-recipient-signature airdrop style has no on-chain
 * batch limit, so we warn above this count rather than hard-blocking.
 */
export const RECIPIENT_SOFT_CAP = 200;

/** Amount must be a plain non-negative decimal (no exponents, no signs, no commas). */
const AMOUNT_PATTERN = /^\d+(\.\d+)?$/;

function looksLikeHeader(fields: string[]): boolean {
  const first = (fields[0] ?? "").trim().toLowerCase();
  return first === "wallet" || first === "address" || first === "recipient";
}

/** Convert a validated decimal string to raw units (10^decimals). */
export function toRawUnits(amount: string, decimals: number): bigint {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

export function formatRawUnits(raw: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = (raw % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac.length > 0 ? `${whole}.${frac}` : whole.toString();
}

export function parseRecipientsCsv(
  text: string,
  tokenDecimals: number,
): CsvParseResult {
  const rows: CsvRow[] = [];
  const warnings: string[] = [];
  const seenWallets = new Map<string, number>(); // lowercased wallet -> first line seen
  let headerDetected = false;
  let totalRaw = 0n;

  const lines = text.split(/\r\n|\r|\n/);

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) return; // skip blank lines silently

    // note may itself contain commas — only the first two commas delimit fields.
    const firstComma = trimmed.indexOf(",");
    const secondComma = firstComma === -1 ? -1 : trimmed.indexOf(",", firstComma + 1);
    const wallet = (firstComma === -1 ? trimmed : trimmed.slice(0, firstComma)).trim();
    const amount =
      firstComma === -1
        ? ""
        : (secondComma === -1
            ? trimmed.slice(firstComma + 1)
            : trimmed.slice(firstComma + 1, secondComma)
          ).trim();
    const note = secondComma === -1 ? "" : trimmed.slice(secondComma + 1).trim();

    // Header detection: only the first non-blank line qualifies.
    if (rows.length === 0 && !headerDetected && looksLikeHeader([wallet])) {
      headerDetected = true;
      return;
    }

    const errors: string[] = [];

    // --- wallet validation -------------------------------------------------
    if (wallet.length === 0) {
      errors.push("Missing wallet address.");
    } else if (!isAddress(wallet, { strict: false })) {
      errors.push(`"${wallet}" is not a valid hex address (expected 0x + 40 hex chars).`);
    } else {
      const key = wallet.toLowerCase();
      const firstSeen = seenWallets.get(key);
      if (firstSeen !== undefined) {
        errors.push(`Duplicate wallet — already listed on line ${firstSeen}.`);
      } else {
        seenWallets.set(key, lineNumber);
      }
    }

    // --- amount validation -------------------------------------------------
    if (amount.length === 0) {
      errors.push("Missing amount.");
    } else if (amount.startsWith("-")) {
      errors.push("Amount cannot be negative.");
    } else if (!AMOUNT_PATTERN.test(amount)) {
      errors.push(`"${amount}" is not a valid decimal amount.`);
    } else {
      const fracDigits = amount.includes(".") ? amount.split(".")[1].length : 0;
      if (fracDigits > tokenDecimals) {
        errors.push(
          `Too many decimal places (${fracDigits}) — this token supports ${tokenDecimals}.`,
        );
      } else if (toRawUnits(amount, tokenDecimals) === 0n) {
        errors.push("Amount must be greater than zero.");
      }
    }

    if (errors.length === 0) {
      totalRaw += toRawUnits(amount, tokenDecimals);
    }

    rows.push({ line: lineNumber, wallet, amount, note, errors });
  });

  const validCount = rows.filter((r) => r.errors.length === 0).length;
  const errorCount = rows.length - validCount;

  if (rows.length > RECIPIENT_SOFT_CAP) {
    warnings.push(
      `${rows.length} recipients exceeds the recommended soft cap of ${RECIPIENT_SOFT_CAP}. ` +
        `There is no on-chain batch limit for this per-recipient-signature airdrop style, ` +
        `but very large lists mean many claim authorizations to sign — consider splitting the distribution.`,
    );
  }

  return {
    rows,
    validCount,
    errorCount,
    warnings,
    headerDetected,
    totalRaw: totalRaw.toString(),
  };
}
