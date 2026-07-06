import { createHmac } from "crypto";
import { getAddress, isAddress, verifyMessage, type Hex } from "viem";

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function buildEligibilityChallengeMessage({
  distributionId,
  walletAddress,
  nonce,
  expiresAt,
}: {
  distributionId: string;
  walletAddress: string;
  nonce: string;
  expiresAt: number;
}): string {
  return [
    "VantaDrop eligibility check",
    "",
    `Distribution: ${distributionId}`,
    `Wallet: ${getAddress(walletAddress)}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt}`,
    "",
    "This signature only proves wallet ownership.",
    "It does not move funds or grant token approvals.",
  ].join("\n");
}

export function hasClaimVaultLookupSecret(): boolean {
  return !!(
    process.env.CLAIM_VAULT_LOOKUP_SECRET?.trim() ||
    process.env.CLAIM_VAULT_ENCRYPTION_KEY?.trim()
  );
}

function claimVaultLookupSecret(): string {
  const secret =
    process.env.CLAIM_VAULT_LOOKUP_SECRET?.trim() ||
    process.env.CLAIM_VAULT_ENCRYPTION_KEY?.trim();
  if (!secret) {
    throw new Error("Claim Vault is not configured.");
  }
  return secret;
}

export function claimVaultLookupKey({
  distributionId,
  recipientWalletLowercase,
}: {
  distributionId: string;
  recipientWalletLowercase: string;
}): string {
  return createHmac("sha256", claimVaultLookupSecret())
    .update(`${distributionId}:${recipientWalletLowercase}`)
    .digest("hex");
}

export async function verifyWalletOwnership({
  distributionId,
  walletAddress,
  message,
  signature,
  expectedMessage,
}: {
  distributionId: string;
  walletAddress: string;
  message: string;
  signature: Hex;
  expectedMessage: string;
}): Promise<{ ok: true; walletAddress: string } | { ok: false; error: string }> {
  if (!distributionId.trim()) {
    return { ok: false, error: "Missing distribution id." };
  }
  if (!isAddress(walletAddress)) {
    return { ok: false, error: "Invalid wallet address." };
  }
  if (message !== expectedMessage) {
    return { ok: false, error: "Unexpected eligibility message." };
  }

  const checksumAddress = getAddress(walletAddress);
  const valid = await verifyMessage({
    address: checksumAddress,
    message,
    signature,
  });
  if (!valid) {
    return { ok: false, error: "Wallet ownership signature did not verify." };
  }

  return { ok: true, walletAddress: checksumAddress };
}
