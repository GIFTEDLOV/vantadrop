import { NextResponse } from "next/server";
import { getAddress, isAddress, type Hex } from "viem";
import { verifyWalletOwnership } from "../../../../lib/claimVault/auth";
import {
  decryptClaimCapsule,
  hasClaimVaultEncryptionKey,
} from "../../../../lib/claimVault/crypto";
import {
  getEncryptedCapsuleForRecipient,
  getClaimVaultStorageStatus,
  deleteEligibilityChallenge,
  getEligibilityChallenge,
  getPublicDrop,
} from "../../../../lib/claimVault/store";
import type {
  ClaimVaultErrorResponse,
  ClaimVaultLookupRequest,
  ClaimVaultLookupResponse,
} from "../../../../lib/claimVault/types";

export const runtime = "nodejs";

function errorResponse(
  status: number,
  code: ClaimVaultErrorResponse["code"],
  error: string,
) {
  return NextResponse.json({ code, error } satisfies ClaimVaultErrorResponse, {
    status,
  });
}

function isHex(value: unknown): value is Hex {
  return (
    typeof value === "string" &&
    /^0x[0-9a-fA-F]*$/.test(value) &&
    (value.length - 2) % 2 === 0 &&
    value.length > 2
  );
}

function expiredChallengeResponse() {
  return errorResponse(
    401,
    "CLAIM_VAULT_CHALLENGE_EXPIRED",
    "Eligibility check expired. Please try again.",
  );
}

export async function POST(request: Request) {
  if (!hasClaimVaultEncryptionKey()) {
    return errorResponse(
      503,
      "CLAIM_VAULT_NOT_CONFIGURED",
      "Claim Vault is not configured. Set CLAIM_VAULT_ENCRYPTION_KEY.",
    );
  }
  if (!getClaimVaultStorageStatus().encryptedVaultConfigured) {
    return errorResponse(
      503,
      "CLAIM_VAULT_STORAGE_ERROR",
      "Claim Vault storage is not configured or unavailable.",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      400,
      "CLAIM_VAULT_BAD_REQUEST",
      "Expected a JSON request body.",
    );
  }

  const lookup = body as Partial<ClaimVaultLookupRequest>;
  if (
    typeof lookup.distributionId !== "string" ||
    lookup.distributionId.trim().length === 0 ||
    typeof lookup.walletAddress !== "string" ||
    !isAddress(lookup.walletAddress) ||
    typeof lookup.message !== "string" ||
    typeof lookup.nonce !== "string" ||
    lookup.nonce.trim().length === 0 ||
    !isHex(lookup.signature)
  ) {
    return errorResponse(
      400,
      "CLAIM_VAULT_BAD_REQUEST",
      "Invalid lookup request.",
    );
  }

  const walletAddress = getAddress(lookup.walletAddress);
  const challenge = await getEligibilityChallenge(lookup.nonce);
  if (!challenge) {
    return expiredChallengeResponse();
  }
  if (
    challenge.distributionId !== lookup.distributionId ||
    challenge.walletAddressLowercase !== walletAddress.toLowerCase() ||
    challenge.expiresAt <= Date.now()
  ) {
    await deleteEligibilityChallenge(lookup.nonce);
    return expiredChallengeResponse();
  }

  const verified = await verifyWalletOwnership({
    distributionId: lookup.distributionId,
    walletAddress,
    message: lookup.message,
    signature: lookup.signature,
    expectedMessage: challenge.message,
  });
  if (!verified.ok) {
    return errorResponse(
      401,
      "CLAIM_VAULT_UNAUTHORIZED",
      "Wallet ownership could not be verified.",
    );
  }

  await deleteEligibilityChallenge(lookup.nonce);

  const verifiedWalletAddress = getAddress(verified.walletAddress);
  const encryptedCapsule = await getEncryptedCapsuleForRecipient({
    distributionId: lookup.distributionId,
    recipientWalletLowercase: verifiedWalletAddress.toLowerCase(),
  });

  if (!encryptedCapsule) {
    return NextResponse.json({
      eligible: false,
      reason: "not_eligible",
      message: "No claim found for this wallet.",
    } satisfies ClaimVaultLookupResponse);
  }

  const publicDropMetadata = await getPublicDrop(lookup.distributionId);
  if (!publicDropMetadata) {
    return NextResponse.json({
      eligible: false,
      reason: "not_eligible",
      message: "No claim found for this wallet.",
    } satisfies ClaimVaultLookupResponse);
  }

  let capsule;
  try {
    capsule = decryptClaimCapsule(encryptedCapsule);
  } catch {
    return errorResponse(
      503,
      "CLAIM_VAULT_STORAGE_ERROR",
      "Claim Vault capsule could not be decrypted.",
    );
  }

  if (capsule.recipientWallet.toLowerCase() !== verifiedWalletAddress.toLowerCase()) {
    return errorResponse(
      401,
      "CLAIM_VAULT_UNAUTHORIZED",
      "Wallet ownership could not be verified for this capsule.",
    );
  }

  return NextResponse.json({
    eligible: true,
    publicDropMetadata,
    capsule,
  } satisfies ClaimVaultLookupResponse);
}
