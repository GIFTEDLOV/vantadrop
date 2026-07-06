import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  encryptClaimCapsule,
  hasClaimVaultEncryptionKey,
} from "../../../../lib/claimVault/crypto";
import { claimVaultLookupKey } from "../../../../lib/claimVault/auth";
import {
  getClaimVaultStorageStatus,
  saveDropAndCapsules,
} from "../../../../lib/claimVault/store";
import type {
  ClaimVaultCapsuleInput,
  ClaimVaultCapsulesRequest,
  ClaimVaultErrorResponse,
  PublicDropMetadata,
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

function isHex(value: unknown, bytes?: number): boolean {
  if (typeof value !== "string") return false;
  if (!/^0x[0-9a-fA-F]*$/.test(value)) return false;
  if ((value.length - 2) % 2 !== 0) return false;
  if (bytes !== undefined && value.length !== 2 + bytes * 2) return false;
  return value.length > 2;
}

function validateDropMetadata(value: unknown): value is PublicDropMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const metadata = value as Partial<PublicDropMetadata>;
  return (
    typeof metadata.distributionId === "string" &&
    metadata.distributionId.trim().length > 0 &&
    typeof metadata.title === "string" &&
    metadata.title.trim().length > 0 &&
    typeof metadata.useCase === "string" &&
    metadata.useCase.trim().length > 0 &&
    (metadata.status === "scheduled" ||
      metadata.status === "active" ||
      metadata.status === "ended") &&
    (metadata.privacyMode === "private_link" ||
      metadata.privacyMode === "discoverable") &&
    typeof metadata.token === "string" &&
    isAddress(metadata.token) &&
    typeof metadata.tokenOpsAirdrop === "string" &&
    isAddress(metadata.tokenOpsAirdrop) &&
    typeof metadata.registry === "string" &&
    isAddress(metadata.registry) &&
    typeof metadata.recipientCount === "number" &&
    Number.isInteger(metadata.recipientCount) &&
    metadata.recipientCount > 0 &&
    typeof metadata.createdAt === "number" &&
    Number.isFinite(metadata.createdAt) &&
    typeof metadata.startsAt === "number" &&
    Number.isFinite(metadata.startsAt) &&
    typeof metadata.endsAt === "number" &&
    Number.isFinite(metadata.endsAt) &&
    typeof metadata.network === "string" &&
    metadata.network.trim().length > 0 &&
    typeof metadata.chainId === "number" &&
    Number.isInteger(metadata.chainId)
  );
}

function validateCapsuleInput(
  value: unknown,
  distributionId: string,
): value is ClaimVaultCapsuleInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const capsule = value as Partial<ClaimVaultCapsuleInput>;
  return (
    capsule.distributionId === distributionId &&
    typeof capsule.recipientWallet === "string" &&
    isAddress(capsule.recipientWallet) &&
    typeof capsule.token === "string" &&
    isAddress(capsule.token) &&
    typeof capsule.tokenOpsAirdrop === "string" &&
    isAddress(capsule.tokenOpsAirdrop) &&
    Number.isInteger(capsule.chainId) &&
    isHex(capsule.claimAuthorization) &&
    typeof capsule.encryptedInput === "object" &&
    capsule.encryptedInput !== null &&
    isHex(capsule.encryptedInput.handle, 32) &&
    isHex(capsule.encryptedInput.inputProof)
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
  const storage = getClaimVaultStorageStatus();
  if (!storage.encryptedVaultConfigured) {
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

  const requestBody = body as Partial<ClaimVaultCapsulesRequest>;
  if (!validateDropMetadata(requestBody.publicDropMetadata)) {
    return errorResponse(
      400,
      "CLAIM_VAULT_BAD_REQUEST",
      "Invalid public drop metadata.",
    );
  }

  const { publicDropMetadata } = requestBody;
  const recipientCapsules = requestBody.recipientCapsules;
  if (
    !Array.isArray(recipientCapsules) ||
    recipientCapsules.length === 0 ||
    recipientCapsules.some(
      (capsule) =>
        !validateCapsuleInput(capsule, publicDropMetadata.distributionId),
    )
  ) {
    return errorResponse(
      400,
      "CLAIM_VAULT_BAD_REQUEST",
      "Invalid recipient capsules.",
    );
  }

  const encryptedCapsules = recipientCapsules.map((capsule) => {
    const recipientWalletLowercase = capsule.recipientWallet.toLowerCase();
    const lookupKeyHash = claimVaultLookupKey({
      distributionId: publicDropMetadata.distributionId,
      recipientWalletLowercase,
    });
    const capsuleId = randomUUID();
    return encryptClaimCapsule({
      capsuleId,
      distributionId: publicDropMetadata.distributionId,
      lookupKeyHash,
      plaintext: capsule,
    });
  });

  try {
    await saveDropAndCapsules({
      drop: publicDropMetadata,
      capsules: encryptedCapsules,
    });
  } catch {
    return errorResponse(
      503,
      "CLAIM_VAULT_STORAGE_ERROR",
      "Claim Vault storage is not configured or unavailable.",
    );
  }

  return NextResponse.json({
    storedCount: encryptedCapsules.length,
    distributionId: publicDropMetadata.distributionId,
    status: publicDropMetadata.status,
    capsuleIds: encryptedCapsules.map((capsule) => capsule.capsuleId),
    storage,
  });
}
