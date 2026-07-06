import type { RecipientVaultSession } from "./types";

export const CLAIM_VAULT_SESSION_KEY = "vantadrop:claim-vault:active-capsule";

export function saveVaultClaimSession(session: RecipientVaultSession): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CLAIM_VAULT_SESSION_KEY, JSON.stringify(session));
}

export function readVaultClaimSession(): RecipientVaultSession | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(CLAIM_VAULT_SESSION_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as RecipientVaultSession;
    if (!parsed?.capsule?.recipientWallet || !parsed.publicDropMetadata?.distributionId) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export function clearVaultClaimSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(CLAIM_VAULT_SESSION_KEY);
}
