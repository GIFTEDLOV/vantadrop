import type {
  ClaimVaultChallenge,
  ClaimVaultStorageStatus,
  PublicDropMetadata,
  StoredEncryptedClaimCapsule,
} from "./types";
import { hasClaimVaultEncryptionKey } from "./crypto";
import { claimVaultLookupKey, hasClaimVaultLookupSecret } from "./auth";

const DROP_INDEX_KEY = "vantadrop:claim-vault:drops";

function dropKey(distributionId: string): string {
  return `vantadrop:claim-vault:drop:${distributionId}`;
}

function capsuleKey(capsuleId: string): string {
  return `vantadrop:claim-vault:capsule:${capsuleId}`;
}

function capsuleLookupKey(lookupKeyHash: string): string {
  return `vantadrop:claim-vault:lookup:${lookupKeyHash}`;
}

function challengeKey(nonce: string): string {
  return `vantadrop:claim-vault:challenge:${nonce}`;
}

interface MemoryStore {
  drops: Map<string, PublicDropMetadata>;
  capsules: Map<string, StoredEncryptedClaimCapsule>;
  lookups: Map<string, string>;
  challenges: Map<string, ClaimVaultChallenge>;
}

declare global {
  var __vantadropClaimVaultMemory: MemoryStore | undefined;
}

function memoryStore(): MemoryStore {
  globalThis.__vantadropClaimVaultMemory ??= {
    drops: new Map<string, PublicDropMetadata>(),
    capsules: new Map<string, StoredEncryptedClaimCapsule>(),
    lookups: new Map<string, string>(),
    challenges: new Map<string, ClaimVaultChallenge>(),
  };
  return globalThis.__vantadropClaimVaultMemory;
}

function upstashConfig():
  | { url: string; token: string }
  | undefined {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim();
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim();
  if (!url || !token) return undefined;
  return { url: url.replace(/\/$/, ""), token };
}

function canUseMemoryFallback(): boolean {
  return process.env.NODE_ENV !== "production";
}

export class ClaimVaultStorageError extends Error {
  code = "CLAIM_VAULT_STORAGE_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "ClaimVaultStorageError";
  }
}

export function getClaimVaultStorageStatus(): ClaimVaultStorageStatus {
  const upstash = upstashConfig();
  const encryptionKeyConfigured = hasClaimVaultEncryptionKey();
  const lookupSecretConfigured = hasClaimVaultLookupSecret();
  if (upstash) {
    const encryptedVaultConfigured = encryptionKeyConfigured && lookupSecretConfigured;
    return {
      encryptedVaultConfigured,
      encryptionKeyConfigured,
      lookupSecretConfigured,
      upstashConfigured: true,
      provider: "upstash",
      persistent: true,
      message: encryptedVaultConfigured
        ? "Claim Vault is configured with Upstash Redis."
        : "Claim Vault storage is configured, but required secrets are missing.",
    };
  }
  if (canUseMemoryFallback()) {
    const encryptedVaultConfigured = encryptionKeyConfigured && lookupSecretConfigured;
    return {
      encryptedVaultConfigured,
      encryptionKeyConfigured,
      lookupSecretConfigured,
      upstashConfigured: false,
      provider: "memory",
      persistent: false,
      message: encryptedVaultConfigured
        ? "Using non-persistent local development memory storage."
        : "Claim Vault is not configured. Set CLAIM_VAULT_ENCRYPTION_KEY.",
    };
  }
  return {
    encryptedVaultConfigured: false,
    encryptionKeyConfigured,
    lookupSecretConfigured,
    upstashConfigured: false,
    provider: "none",
    persistent: false,
    message: "Claim Vault storage is not configured.",
  };
}

async function runUpstashPipeline<T = unknown>(
  commands: unknown[][],
): Promise<T[]> {
  const config = upstashConfig();
  if (!config) {
    throw new ClaimVaultStorageError(
      "Upstash Redis REST is not configured for Claim Vault storage.",
    );
  }

  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new ClaimVaultStorageError(
      `Claim Vault storage request failed with HTTP ${response.status}.`,
    );
  }

  const result = (await response.json()) as Array<{
    result?: T;
    error?: string;
  }>;
  const failed = result.find((entry) => entry.error);
  if (failed?.error) {
    throw new ClaimVaultStorageError(`Claim Vault storage error: ${failed.error}`);
  }
  return result.map((entry) => entry.result as T);
}

async function getJsonFromUpstash<T>(key: string): Promise<T | undefined> {
  const [raw] = await runUpstashPipeline<string | null>([["GET", key]]);
  if (!raw) return undefined;
  return JSON.parse(raw) as T;
}

export async function saveDropAndCapsules({
  drop,
  capsules,
}: {
  drop: PublicDropMetadata;
  capsules: StoredEncryptedClaimCapsule[];
}): Promise<void> {
  const status = getClaimVaultStorageStatus();
  if (status.provider === "upstash") {
    await runUpstashPipeline([
      ["SET", dropKey(drop.distributionId), JSON.stringify(drop)],
      ["SADD", DROP_INDEX_KEY, drop.distributionId],
      ...capsules.flatMap((capsule) => [
        ["SET", capsuleKey(capsule.capsuleId), JSON.stringify(capsule)],
        ["SET", capsuleLookupKey(capsule.lookupKeyHash), capsule.capsuleId],
      ]),
    ]);
    return;
  }

  if (status.provider === "memory") {
    const store = memoryStore();
    store.drops.set(drop.distributionId, drop);
    for (const capsule of capsules) {
      store.capsules.set(capsule.capsuleId, capsule);
      store.lookups.set(capsuleLookupKey(capsule.lookupKeyHash), capsule.capsuleId);
    }
    return;
  }

  throw new ClaimVaultStorageError("Claim Vault storage is not configured.");
}

export async function listPublicDrops(): Promise<PublicDropMetadata[]> {
  const status = getClaimVaultStorageStatus();
  if (status.provider === "upstash") {
    const [ids] = await runUpstashPipeline<string[]>([["SMEMBERS", DROP_INDEX_KEY]]);
    const distributionIds = Array.isArray(ids) ? ids : [];
    if (distributionIds.length === 0) return [];
    const drops = await runUpstashPipeline<string | null>(
      distributionIds.map((id) => ["GET", dropKey(id)]),
    );
    return drops
      .filter((raw): raw is string => !!raw)
      .map((raw) => JSON.parse(raw) as PublicDropMetadata)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  if (status.provider === "memory") {
    return [...memoryStore().drops.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  return [];
}

export async function getPublicDrop(
  distributionId: string,
): Promise<PublicDropMetadata | undefined> {
  const status = getClaimVaultStorageStatus();
  if (status.provider === "upstash") {
    return getJsonFromUpstash<PublicDropMetadata>(dropKey(distributionId));
  }
  if (status.provider === "memory") {
    return memoryStore().drops.get(distributionId);
  }
  return undefined;
}

export async function getEncryptedCapsuleForRecipient({
  distributionId,
  recipientWalletLowercase,
}: {
  distributionId: string;
  recipientWalletLowercase: string;
}): Promise<StoredEncryptedClaimCapsule | undefined> {
  const status = getClaimVaultStorageStatus();
  const lookupKeyHash = claimVaultLookupKey({
    distributionId,
    recipientWalletLowercase,
  });
  if (status.provider === "upstash") {
    const [capsuleId] = await runUpstashPipeline<string | null>([
      ["GET", capsuleLookupKey(lookupKeyHash)],
    ]);
    if (!capsuleId) return undefined;
    return getJsonFromUpstash<StoredEncryptedClaimCapsule>(capsuleKey(capsuleId));
  }

  if (status.provider === "memory") {
    const store = memoryStore();
    const capsuleId = store.lookups.get(capsuleLookupKey(lookupKeyHash));
    return capsuleId ? store.capsules.get(capsuleId) : undefined;
  }

  return undefined;
}

export async function saveEligibilityChallenge({
  challenge,
  ttlMs,
}: {
  challenge: ClaimVaultChallenge;
  ttlMs: number;
}): Promise<void> {
  const status = getClaimVaultStorageStatus();
  if (status.provider === "upstash") {
    await runUpstashPipeline([
      ["SET", challengeKey(challenge.nonce), JSON.stringify(challenge), "PX", ttlMs],
    ]);
    return;
  }

  if (status.provider === "memory") {
    memoryStore().challenges.set(challengeKey(challenge.nonce), challenge);
    return;
  }

  throw new ClaimVaultStorageError("Claim Vault storage is not configured.");
}

export async function getEligibilityChallenge(
  nonce: string,
): Promise<ClaimVaultChallenge | undefined> {
  const status = getClaimVaultStorageStatus();
  if (status.provider === "upstash") {
    return getJsonFromUpstash<ClaimVaultChallenge>(challengeKey(nonce));
  }

  if (status.provider === "memory") {
    const challenge = memoryStore().challenges.get(challengeKey(nonce));
    if (!challenge) return undefined;
    if (challenge.expiresAt <= Date.now()) {
      memoryStore().challenges.delete(challengeKey(nonce));
      return undefined;
    }
    return challenge;
  }

  return undefined;
}

export async function deleteEligibilityChallenge(nonce: string): Promise<void> {
  const status = getClaimVaultStorageStatus();
  if (status.provider === "upstash") {
    await runUpstashPipeline([["DEL", challengeKey(nonce)]]);
    return;
  }

  if (status.provider === "memory") {
    memoryStore().challenges.delete(challengeKey(nonce));
  }
}
