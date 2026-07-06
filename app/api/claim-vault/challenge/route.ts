import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import {
  buildEligibilityChallengeMessage,
  CHALLENGE_TTL_MS,
} from "../../../../lib/claimVault/auth";
import { hasClaimVaultEncryptionKey } from "../../../../lib/claimVault/crypto";
import {
  getClaimVaultStorageStatus,
  saveEligibilityChallenge,
} from "../../../../lib/claimVault/store";
import type {
  ClaimVaultChallenge,
  ClaimVaultChallengeRequest,
  ClaimVaultChallengeResponse,
  ClaimVaultErrorResponse,
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

function validDistributionId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  if (!hasClaimVaultEncryptionKey()) {
    return errorResponse(
      503,
      "CLAIM_VAULT_NOT_CONFIGURED",
      "Claim Vault is not configured.",
    );
  }

  const storage = getClaimVaultStorageStatus();
  if (!storage.encryptedVaultConfigured) {
    return errorResponse(
      503,
      "CLAIM_VAULT_NOT_CONFIGURED",
      "Claim Vault is not configured.",
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

  const challengeRequest = body as Partial<ClaimVaultChallengeRequest>;
  if (
    !validDistributionId(challengeRequest.distributionId) ||
    typeof challengeRequest.walletAddress !== "string" ||
    !isAddress(challengeRequest.walletAddress)
  ) {
    return errorResponse(
      400,
      "CLAIM_VAULT_BAD_REQUEST",
      "Invalid eligibility challenge request.",
    );
  }

  const walletAddress = getAddress(challengeRequest.walletAddress);
  const nonce = randomBytes(32).toString("hex");
  const issuedAt = Date.now();
  const expiresAt = issuedAt + CHALLENGE_TTL_MS;
  const distributionId = challengeRequest.distributionId.trim();
  const message = buildEligibilityChallengeMessage({
    distributionId,
    walletAddress,
    nonce,
    expiresAt,
  });

  const challenge: ClaimVaultChallenge = {
    nonce,
    distributionId,
    walletAddressLowercase: walletAddress.toLowerCase(),
    message,
    issuedAt,
    expiresAt,
  };

  try {
    await saveEligibilityChallenge({ challenge, ttlMs: CHALLENGE_TTL_MS });
  } catch {
    return errorResponse(
      503,
      "CLAIM_VAULT_NOT_CONFIGURED",
      "Claim Vault is not configured.",
    );
  }

  return NextResponse.json({
    message,
    nonce,
    expiresAt,
  } satisfies ClaimVaultChallengeResponse);
}
