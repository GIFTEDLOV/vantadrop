import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import type {
  PlaintextClaimCapsule,
  StoredEncryptedClaimCapsule,
} from "./types";

const ALGORITHM = "aes-256-gcm" as const;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export class ClaimVaultConfigurationError extends Error {
  code = "CLAIM_VAULT_NOT_CONFIGURED" as const;

  constructor(message = "Claim Vault is not configured") {
    super(message);
    this.name = "ClaimVaultConfigurationError";
  }
}

function decodeKey(raw: string): Buffer {
  const trimmed = raw.trim();

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  const base64 = Buffer.from(trimmed, "base64");
  if (base64.length === 32) return base64;

  const utf8 = Buffer.from(trimmed, "utf8");
  if (utf8.length === 32) return utf8;

  throw new ClaimVaultConfigurationError(
    "Claim Vault encryption key must be 32 bytes, base64-encoded 32 bytes, or 64 hex characters.",
  );
}

export function hasClaimVaultEncryptionKey(): boolean {
  return !!process.env.CLAIM_VAULT_ENCRYPTION_KEY?.trim();
}

export function getClaimVaultEncryptionKey(): Buffer {
  const raw = process.env.CLAIM_VAULT_ENCRYPTION_KEY;
  if (!raw?.trim()) {
    throw new ClaimVaultConfigurationError(
      "Claim Vault is not configured. Set CLAIM_VAULT_ENCRYPTION_KEY.",
    );
  }
  return decodeKey(raw);
}

function aadForCapsule(
  distributionId: string,
  lookupKeyHash: string,
  capsuleId: string,
): Buffer {
  return Buffer.from(
    `${distributionId}:${lookupKeyHash}:${capsuleId}`,
    "utf8",
  );
}

export function encryptClaimCapsule({
  capsuleId,
  distributionId,
  lookupKeyHash,
  plaintext,
}: {
  capsuleId: string;
  distributionId: string;
  lookupKeyHash: string;
  plaintext: PlaintextClaimCapsule;
}): StoredEncryptedClaimCapsule {
  const key = getClaimVaultEncryptionKey();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce, {
    authTagLength: AUTH_TAG_BYTES,
  });
  cipher.setAAD(aadForCapsule(distributionId, lookupKeyHash, capsuleId));

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(plaintext), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    capsuleId,
    distributionId,
    lookupKeyHash,
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: authTag.toString("base64"),
    algorithm: ALGORITHM,
    createdAt: Date.now(),
  };
}

export function decryptClaimCapsule(
  capsule: StoredEncryptedClaimCapsule,
): PlaintextClaimCapsule {
  if (capsule.algorithm !== ALGORITHM) {
    throw new Error("Unsupported Claim Vault capsule algorithm.");
  }

  const key = getClaimVaultEncryptionKey();
  const nonce = Buffer.from(capsule.nonce, "base64");
  const authTag = Buffer.from(capsule.authTag, "base64");
  if (authTag.length !== AUTH_TAG_BYTES) {
    throw new Error("Invalid Claim Vault capsule auth tag.");
  }

  const decipher = createDecipheriv(ALGORITHM, key, nonce, {
    authTagLength: AUTH_TAG_BYTES,
  });
  decipher.setAAD(
    aadForCapsule(capsule.distributionId, capsule.lookupKeyHash, capsule.capsuleId),
  );
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(capsule.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(plaintext) as PlaintextClaimCapsule;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
