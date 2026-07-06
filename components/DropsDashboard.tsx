"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import { saveVaultClaimSession } from "../lib/claimVault/session";
import type {
  ClaimVaultChallengeResponse,
  ClaimVaultLookupResponse,
  ClaimVaultStorageStatus,
  PublicDropMetadata,
} from "../lib/claimVault/types";
import { AddressLink, Badge, Card, KeyValueRow, SectionLabel } from "./ui";
import { useSepoliaWallet } from "./wallet/hooks";
import { WalletStatusBar } from "./wallet/WalletStatusBar";
import { useWalletClient } from "wagmi";

type LookupState =
  | { phase: "idle" }
  | { phase: "challenging" }
  | { phase: "signing" }
  | { phase: "eligible" }
  | { phase: "not-eligible" }
  | { phase: "not-configured"; message: string }
  | { phase: "error"; message: string };

interface DropsApiResponse {
  drops: PublicDropMetadata[];
  storage: ClaimVaultStorageStatus;
  message?: string;
}

type ApiErrorResponse = { error?: string; code?: string };

function responseErrorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as ApiErrorResponse).error === "string"
  ) {
    return (body as ApiErrorResponse).error ?? fallback;
  }
  return fallback;
}

function formatWindow(drop: PublicDropMetadata): string {
  const starts = new Date(drop.startsAt).toLocaleDateString();
  const ends = new Date(drop.endsAt).toLocaleDateString();
  return `${starts} to ${ends}`;
}

function statusTone(status: PublicDropMetadata["status"]) {
  if (status === "active") return "proven";
  if (status === "scheduled") return "demo";
  return "neutral";
}

function privacyLabel(mode: PublicDropMetadata["privacyMode"]): string {
  return mode === "discoverable" ? "Wallet discovery" : "Private link";
}

export function DropsDashboard() {
  const wallet = useSepoliaWallet();
  const { data: walletClient } = useWalletClient();
  const [drops, setDrops] = useState<PublicDropMetadata[]>([]);
  const [storage, setStorage] = useState<ClaimVaultStorageStatus | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [lookupState, setLookupState] = useState<Record<string, LookupState>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadDrops() {
      setLoading(true);
      setLoadError(undefined);
      try {
        const response = await fetch("/api/drops", { cache: "no-store" });
        const body = (await response.json()) as DropsApiResponse;
        if (!cancelled) {
          setDrops(Array.isArray(body.drops) ? body.drops : []);
          setStorage(body.storage);
          if (!response.ok) {
            setLoadError(body.message ?? "Unable to load drops.");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadDrops();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(
    () => ({
      ongoing: drops.filter((drop) => drop.status === "active"),
      future: drops.filter((drop) => drop.status === "scheduled"),
      past: drops.filter((drop) => drop.status === "ended"),
    }),
    [drops],
  );

  const walletReady = wallet.isConnected && wallet.isOnSepolia && !!wallet.address;
  const vaultConfigured = !!storage?.encryptedVaultConfigured;

  async function checkEligibility(drop: PublicDropMetadata) {
    if (!vaultConfigured) {
      setLookupState((state) => ({
        ...state,
        [drop.distributionId]: {
          phase: "not-configured",
          message: "Claim Vault is not configured in this environment.",
        },
      }));
      return;
    }
    if (!walletReady || !wallet.address || !walletClient) {
      setLookupState((state) => ({
        ...state,
        [drop.distributionId]: {
          phase: "error",
          message: "Connect your wallet on Sepolia to check eligibility.",
        },
      }));
      return;
    }

    setLookupState((state) => ({
      ...state,
      [drop.distributionId]: { phase: "challenging" },
    }));

    try {
      const challengeResponse = await fetch("/api/claim-vault/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distributionId: drop.distributionId,
          walletAddress: wallet.address,
        }),
      });
      const challengeBody = (await challengeResponse.json()) as
        | ClaimVaultChallengeResponse
        | ApiErrorResponse;

      if (!challengeResponse.ok) {
        setLookupState((state) => ({
          ...state,
          [drop.distributionId]: challengeResponse.status === 503
            ? {
                phase: "not-configured",
                message: responseErrorMessage(
                  challengeBody,
                  "Claim Vault is not configured in this environment.",
                ),
              }
            : {
                phase: "error",
                message: responseErrorMessage(
                  challengeBody,
                  "Eligibility challenge failed.",
                ),
              },
        }));
        return;
      }

      const challenge = challengeBody as ClaimVaultChallengeResponse;
      setLookupState((state) => ({
        ...state,
        [drop.distributionId]: { phase: "signing" },
      }));
      const signature = await walletClient.signMessage({
        account: wallet.address,
        message: challenge.message,
      });
      const response = await fetch("/api/claim-vault/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distributionId: drop.distributionId,
          walletAddress: wallet.address,
          message: challenge.message,
          signature: signature as Hex,
          nonce: challenge.nonce,
        }),
      });
      const body = (await response.json()) as
        | ClaimVaultLookupResponse
        | ApiErrorResponse;

      if (!response.ok) {
        setLookupState((state) => ({
          ...state,
          [drop.distributionId]: response.status === 503
            ? {
                phase: "not-configured",
                message: responseErrorMessage(
                  body,
                  "Claim Vault is not configured in this environment.",
                ),
              }
            : {
                phase: "error",
                message: responseErrorMessage(
                  body,
                  "Eligibility lookup failed.",
                ),
              },
        }));
        return;
      }

      const lookup = body as ClaimVaultLookupResponse;
      if (lookup.eligible) {
        saveVaultClaimSession({
          publicDropMetadata: lookup.publicDropMetadata,
          capsule: lookup.capsule,
          loadedAt: Date.now(),
        });
        setLookupState((state) => ({
          ...state,
          [drop.distributionId]: { phase: "eligible" },
        }));
      } else {
        setLookupState((state) => ({
          ...state,
          [drop.distributionId]: { phase: "not-eligible" },
        }));
      }
    } catch (error) {
      setLookupState((state) => ({
        ...state,
        [drop.distributionId]: {
          phase: "error",
          message: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }

  function renderDropCard(drop: PublicDropMetadata) {
    const lookup = lookupState[drop.distributionId] ?? { phase: "idle" };
    const startsSoon = drop.status === "scheduled";
    const ended = drop.status === "ended";
    const disabled =
      !vaultConfigured ||
      startsSoon ||
      ended ||
      lookup.phase === "challenging" ||
      lookup.phase === "signing";

    return (
      <Card key={drop.distributionId} className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[16px] font-semibold text-white">{drop.title}</h3>
              <Badge tone={statusTone(drop.status)}>{drop.status}</Badge>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
              {drop.useCase}
            </p>
          </div>
          <Badge tone="confidential">{privacyLabel(drop.privacyMode)}</Badge>
        </div>

        <div className="mt-4">
          <KeyValueRow label="Token">
            <AddressLink address={drop.token} />
          </KeyValueRow>
          <KeyValueRow label="Network">
            {drop.network} (chain id {drop.chainId})
          </KeyValueRow>
          <KeyValueRow label="Recipients">{drop.recipientCount}</KeyValueRow>
          <KeyValueRow label="Claim window">{formatWindow(drop)}</KeyValueRow>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => checkEligibility(drop)}
            disabled={disabled}
            className="btn-primary px-4 py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {lookup.phase === "challenging"
              ? "Preparing check..."
              : lookup.phase === "signing"
                ? "Awaiting signature..."
                : "Check eligibility"}
          </button>
          {lookup.phase === "eligible" && (
            <Link
              href={`/recipient/demo?source=vault&distributionId=${encodeURIComponent(drop.distributionId)}`}
              className="btn-secondary px-4 py-2 text-[13px]"
            >
              Claim this drop
            </Link>
          )}
        </div>

        {startsSoon && (
          <p className="mt-3 text-[13px] text-sky-300">Starts soon.</p>
        )}
        {ended && <p className="mt-3 text-[13px] text-zinc-500">Ended.</p>}
        {!vaultConfigured && (
          <p className="mt-3 text-[13px] leading-relaxed text-amber-300">
            Claim Vault is not configured in this environment.
          </p>
        )}
        {lookup.phase === "eligible" && (
          <p className="mt-3 text-[13px] leading-relaxed text-emerald-300">
            Claim package found. Claim this drop to continue.
          </p>
        )}
        {lookup.phase === "not-eligible" && (
          <p className="mt-3 text-[13px] leading-relaxed text-zinc-500">
            No claim found for this wallet.
          </p>
        )}
        {lookup.phase === "not-configured" && (
          <p className="mt-3 text-[13px] leading-relaxed text-amber-300">
            {lookup.message}
          </p>
        )}
        {lookup.phase === "error" && (
          <p className="mt-3 text-[13px] leading-relaxed text-rose-300">
            {lookup.message}
          </p>
        )}
      </Card>
    );
  }

  function renderSection(title: string, items: PublicDropMetadata[]) {
    return (
      <section className="mt-10">
        <SectionLabel>{title}</SectionLabel>
        {items.length > 0 ? (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">{items.map(renderDropCard)}</div>
        ) : (
          <Card className="mt-3 p-5">
            <p className="text-[13px] text-zinc-500">No drops in this section.</p>
          </Card>
        )}
      </section>
    );
  }

  return (
    <div className="page-section-tight">
      <SectionLabel>Drops dashboard</SectionLabel>
      <h1 className="mt-3 max-w-5xl text-[clamp(38px,5vw,72px)] font-semibold leading-[0.96] tracking-[-0.075em] text-white">
        Discover eligible confidential airdrops
      </h1>
      <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-zinc-400">
        Connect your wallet to privately check eligible claim packages. Claim
        material is stored in VantaDrop&apos;s encrypted Claim Vault and released
        only to the matching wallet.
      </p>

      <div className="mt-6">
        <WalletStatusBar />
      </div>

      {!walletReady && (
        <Card className="mt-4 border-violet-500/20 bg-violet-500/[0.04] p-5">
          <p className="text-[14px] leading-relaxed text-violet-100">
            Connect your wallet to privately check eligible claim packages.
          </p>
        </Card>
      )}

      {storage && (
        <Card className="mt-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={vaultConfigured ? "proven" : "pending"}>
              {vaultConfigured ? "Claim Vault available" : "Claim Vault not configured"}
            </Badge>
            {storage.provider === "memory" && (
              <Badge tone="pending">Local development memory</Badge>
            )}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
            The public registry stores metadata only. Your allocation remains
            confidential through TokenOps/Zama until your wallet decrypts it.
          </p>
        </Card>
      )}

      {loading && (
        <Card className="mt-8 p-5">
          <p className="text-[13px] text-zinc-500">Loading public drop metadata...</p>
        </Card>
      )}

      {loadError && (
        <Card className="mt-8 border-rose-500/30 bg-rose-500/[0.05] p-5">
          <p className="text-[13px] text-rose-300">{loadError}</p>
        </Card>
      )}

      {!loading && !loadError && (
        <>
          {renderSection("Ongoing Airdrops", grouped.ongoing)}
          {renderSection("Future Airdrops", grouped.future)}
          {renderSection("Past Airdrops", grouped.past)}
        </>
      )}
    </div>
  );
}
