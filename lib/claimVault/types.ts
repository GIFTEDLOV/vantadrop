import type { Address, Hex } from "viem";

export type DropStatus = "scheduled" | "active" | "ended";
export type DropPrivacyMode = "private_link" | "discoverable";

export interface PublicDropMetadata {
  distributionId: string;
  registryDistributionId?: number;
  title: string;
  useCase: string;
  status: DropStatus;
  privacyMode: DropPrivacyMode;
  token: Address;
  tokenOpsAirdrop: Address;
  registry: Address;
  recipientCount: number;
  createdAt: number;
  startsAt: number;
  endsAt: number;
  network: string;
  chainId: number;
}

export interface PlaintextClaimCapsule {
  recipientWallet: Address;
  claimAuthorization: Hex;
  encryptedInput: {
    handle: Hex;
    inputProof: Hex;
  };
  token: Address;
  tokenOpsAirdrop: Address;
  chainId: number;
  distributionId: string;
  amountLabel?: string;
  note?: string;
}

export interface StoredEncryptedClaimCapsule {
  capsuleId: string;
  distributionId: string;
  lookupKeyHash: string;
  ciphertext: string;
  nonce: string;
  authTag: string;
  algorithm: "aes-256-gcm";
  createdAt: number;
}

export type ClaimVaultCapsuleInput = PlaintextClaimCapsule;

export interface ClaimVaultCapsulesRequest {
  publicDropMetadata: PublicDropMetadata;
  recipientCapsules: ClaimVaultCapsuleInput[];
}

export interface ClaimVaultCapsulesResponse {
  storedCount: number;
  distributionId: string;
  status: DropStatus;
  capsuleIds: string[];
  storage: ClaimVaultStorageStatus;
}

export interface ClaimVaultLookupRequest {
  distributionId: string;
  walletAddress: Address;
  message: string;
  signature: Hex;
  nonce: string;
}

export interface ClaimVaultChallengeRequest {
  distributionId: string;
  walletAddress: Address;
}

export interface ClaimVaultChallenge {
  nonce: string;
  distributionId: string;
  walletAddressLowercase: string;
  message: string;
  issuedAt: number;
  expiresAt: number;
}

export interface ClaimVaultChallengeResponse {
  message: string;
  nonce: string;
  expiresAt: number;
}

export interface ClaimVaultLookupEligibleResponse {
  eligible: true;
  publicDropMetadata: PublicDropMetadata;
  capsule: PlaintextClaimCapsule;
}

export interface ClaimVaultLookupNotEligibleResponse {
  eligible: false;
  reason: "not_eligible";
  message: string;
}

export type ClaimVaultLookupResponse =
  | ClaimVaultLookupEligibleResponse
  | ClaimVaultLookupNotEligibleResponse;

export interface RecipientVaultSession {
  publicDropMetadata: PublicDropMetadata;
  capsule: PlaintextClaimCapsule;
  loadedAt: number;
}

export interface ClaimVaultStorageStatus {
  encryptedVaultConfigured: boolean;
  encryptionKeyConfigured: boolean;
  lookupSecretConfigured: boolean;
  upstashConfigured: boolean;
  provider: "upstash" | "memory" | "none";
  persistent: boolean;
  message?: string;
}

export interface ClaimVaultErrorResponse {
  error: string;
  code:
    | "CLAIM_VAULT_NOT_CONFIGURED"
    | "CLAIM_VAULT_BAD_REQUEST"
    | "CLAIM_VAULT_UNAUTHORIZED"
    | "CLAIM_VAULT_CHALLENGE_EXPIRED"
    | "CLAIM_VAULT_STORAGE_ERROR";
}
