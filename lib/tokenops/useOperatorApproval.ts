"use client";

/**
 * Shared ERC-7984 operator-approval state machine for TokenOps surfaces.
 *
 * Extracted from the proven-live pattern on /dev/tokenops-diagnostic
 * (app/dev/tokenops-diagnostic/page.tsx) so new surfaces — currently the
 * SenderPrepPanel on /create — don't re-implement the check/approve logic.
 * The diagnostic page itself deliberately keeps its own inline copy: it was
 * proven live against Sepolia in a prior phase and that phase's constraint
 * froze it ("must remain exactly as it is" — see
 * docs/research/browser-tokenops-integration.md, live diagnostic result).
 * Refactoring proven diagnostic code for zero user benefit is worse than the
 * one structural duplication, which this header documents explicitly.
 *
 * Semantics (identical to the diagnostic):
 *   - `runCheck` — free `isOperator` read (no tx, no wallet prompt). Resets
 *     any stale approve result, since a new check invalidates its relevance.
 *   - `runApprove` — HARD-guarded: refuses unless the last check explicitly
 *     returned "needed" AND the caller confirms the burner-wallet checkbox.
 *     Sends at most one real Sepolia tx via `ensureAirdropFactoryOperator`
 *     (which itself re-checks and no-ops if approval raced in). After a
 *     confirmed tx, the free read re-runs so the displayed state reflects
 *     on-chain truth instead of assuming.
 *
 * Nothing here runs automatically — both actions are exposed as functions
 * for explicit button clicks only.
 */

import { useState } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";
import { erc7984OperatorAbi } from "@tokenops/sdk/fhe";
import { useSepoliaWallet } from "../../components/wallet/hooks";
import { CTTT_TOKEN_ADDRESS, TOKENOPS_AIRDROP_FACTORY } from "../constants";
import { ensureAirdropFactoryOperator } from "./issuer";

export type OperatorCheckState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "approved" } // factory already an authorized operator — no tx needed
  | { phase: "needed" } // factory NOT yet an operator — approval tx required
  | { phase: "error"; message: string };

export type OperatorApproveState =
  | { phase: "idle" }
  | { phase: "pending" } // wallet prompt shown / tx mining (setOperator waits for receipt)
  | { phase: "confirmed"; hash: Hex }
  | { phase: "error"; message: string };

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0];
}

export interface OperatorApproval {
  check: OperatorCheckState;
  approve: OperatorApproveState;
  /** Free isOperator read — no tx, no wallet prompt. */
  runCheck: () => Promise<void>;
  /** Real setOperator tx (1 wallet prompt), hard-guarded on check === "needed" + burnerAck. */
  runApprove: (args: { burnerAck: boolean }) => Promise<void>;
  /** True while either action is in flight. */
  busy: boolean;
  /** Connected on Sepolia with an address — prerequisite for both actions. */
  walletReady: boolean;
}

export function useOperatorApproval(options?: {
  /** ERC-7984 token to check on. Defaults to CTTT. */
  token?: Address;
  /** Operator/spender to check for. Defaults to the TokenOps airdrop factory. */
  factory?: Address;
}): OperatorApproval {
  const token = options?.token ?? (CTTT_TOKEN_ADDRESS as Address);
  const factory = options?.factory ?? (TOKENOPS_AIRDROP_FACTORY as Address);

  const wallet = useSepoliaWallet();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [check, setCheck] = useState<OperatorCheckState>({ phase: "idle" });
  const [approve, setApprove] = useState<OperatorApproveState>({ phase: "idle" });

  const walletReady = wallet.isConnected && wallet.isOnSepolia && !!wallet.address;
  const busy = check.phase === "checking" || approve.phase === "pending";

  async function runCheck() {
    if (check.phase === "checking") return;
    if (!walletReady || !wallet.address || !publicClient) {
      setCheck({ phase: "error", message: "Connect a wallet on Sepolia first." });
      return;
    }
    setCheck({ phase: "checking" });
    // A new check invalidates any previous approve result's relevance.
    setApprove({ phase: "idle" });
    try {
      // Same free read ensureAirdropFactoryOperator performs internally:
      // isOperator(holder = connected wallet, spender = factory). Zero cost,
      // zero wallet prompt.
      const isOperator = await publicClient.readContract({
        address: token,
        abi: erc7984OperatorAbi,
        functionName: "isOperator",
        args: [wallet.address, factory],
      });
      setCheck(isOperator ? { phase: "approved" } : { phase: "needed" });
    } catch (error) {
      setCheck({ phase: "error", message: firstLine(error) });
    }
  }

  async function runApprove(args: { burnerAck: boolean }) {
    if (approve.phase === "pending") return;
    // HARD GUARD (not just disabled styling): refuse unless the last check
    // explicitly returned "approval needed". Never send a redundant tx.
    if (check.phase !== "needed") {
      setApprove({
        phase: "error",
        message:
          check.phase === "approved"
            ? "Refused: the factory is already an authorized operator — no transaction needed."
            : "Refused: run the operator check first and get an 'Approval needed' result.",
      });
      return;
    }
    if (!args.burnerAck) {
      setApprove({ phase: "error", message: "Refused: confirm the burner-wallet checkbox first." });
      return;
    }
    if (!walletReady || !publicClient || !walletClient) {
      setApprove({ phase: "error", message: "Connect a wallet on Sepolia first." });
      return;
    }
    setApprove({ phase: "pending" });
    try {
      // Real SDK call — `account` deliberately omitted inside (the browser
      // write-path rule from the research doc). setOperator waits for the
      // receipt by default, so a returned hash means the tx is mined.
      const result = await ensureAirdropFactoryOperator({
        publicClient,
        walletClient,
        token,
        factoryAddress: factory,
      });
      if (result.alreadyOperator) {
        // The SDK's own pre-check found an existing approval (state changed
        // since our read, or the read raced) — honest no-op, no tx sent.
        setCheck({ phase: "approved" });
        setApprove({
          phase: "error",
          message: "No-op: already an operator at send time — no transaction was sent.",
        });
        return;
      }
      setApprove({ phase: "confirmed", hash: result.hash! });
      // Re-run the free read so the displayed check state reflects on-chain
      // truth after the tx, instead of assuming.
      try {
        const isOperator = await publicClient.readContract({
          address: token,
          abi: erc7984OperatorAbi,
          functionName: "isOperator",
          args: [wallet.address!, factory],
        });
        setCheck(isOperator ? { phase: "approved" } : { phase: "needed" });
      } catch {
        // Post-tx re-read failed (RPC hiccup) — keep the confirmed hash, leave
        // the check state as-is; the user can re-run the check manually.
      }
    } catch (error) {
      setApprove({ phase: "error", message: firstLine(error) });
    }
  }

  return { check, approve, runCheck, runApprove, busy, walletReady };
}
