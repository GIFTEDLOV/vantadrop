/**
 * Sender-side distribution package: the local record of a live issuer run,
 * saved to the browser's OWN localStorage after a successful create flow.
 *
 * PRIVACY MODEL (read before changing anything here):
 * - This package contains plaintext recipient addresses, amounts, notes, and
 *   claim-authorization signatures. That is acceptable ONLY because it lives
 *   exclusively in the sender's own browser localStorage — local-only,
 *   sender-side working state, exactly like the wizard's CSV textarea already
 *   is during setup. It is never sent to a server, never logged, and NEVER
 *   written on-chain.
 * - The on-chain registry (VantaDropRegistry) receives none of this: it
 *   stores only token/clone addresses, title, use case, a recipient COUNT,
 *   and a metadata URI. See lib/registry/client.ts.
 * - Any change that would move this data off the user's machine (API call,
 *   analytics, on-chain write) is a privacy bug, not a feature.
 */

import type { Address, Hex } from "viem";

export interface DistributionPackageRecipient {
  wallet: Address;
  /** Sender's private note from the CSV — never leaves this browser. */
  note: string;
  /** Human-readable amount as entered, e.g. "1.0". Never written on-chain in plaintext. */
  amount: string;
  /** The signed EIP-712 claim authorization (single-use, recipient-bound). */
  claimAuthorization: Hex;
  /**
   * Safe descriptor of the encrypted allocation (shortened opaque ciphertext
   * id + proof size) — NOT a plaintext amount, and deliberately not the full
   * claim payload. The full { encryptedInput, signature } delivery format for
   * recipients is defined in the next phase (recipient decrypt/claim wiring).
   */
  encryptedHandleSummary: string;
}

export interface DistributionPackage {
  /** Locally generated id (crypto.randomUUID) — distinct from any registry id. */
  distributionId: string;
  title: string;
  useCase: string;
  network: "Sepolia";
  chainId: number; // 11155111
  sender: Address;
  token: Address;
  tokenOpsFactory: Address;
  /** The airdrop clone created by createAndFundAirdrop. */
  tokenOpsAirdrop: Address;
  /** VantaDropRegistry address (public metadata only). */
  registry: Address;
  /** Present only if the registry write succeeded. */
  registryDistributionId?: number;
  recipientCount: number;
  recipients: DistributionPackageRecipient[];
  txHashes: {
    /** Present only if operator approval actually required a transaction. */
    operatorApproval?: Hex;
    createAndFund: Hex;
    /** Present only if the registry write succeeded. */
    registry?: Hex;
  };
  createdAt: number;
}

/** Single localStorage key holding all packages created in this browser. */
export const DISTRIBUTION_STORAGE_KEY = "vantadrop:distributions";

/**
 * Read every saved package. Returns [] on server, missing key, or corrupt
 * JSON — a corrupt store must never crash the create flow.
 */
export function loadDistributionPackages(): DistributionPackage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DISTRIBUTION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DistributionPackage[]) : [];
  } catch {
    return [];
  }
}

/**
 * Upsert one package by its local distributionId (the execute flow saves the
 * package once after signing completes, then re-saves it with the registry id
 * if the registry write succeeds).
 *
 * localStorage is the deliberate ceiling for this data in the current phase:
 * browser-local, sender-only. Do not "upgrade" this to any shared storage.
 */
export function saveDistributionPackage(pkg: DistributionPackage): void {
  if (typeof window === "undefined") return;
  const existing = loadDistributionPackages();
  const next = [
    ...existing.filter((p) => p.distributionId !== pkg.distributionId),
    pkg,
  ];
  window.localStorage.setItem(DISTRIBUTION_STORAGE_KEY, JSON.stringify(next));
}
