"use client";

/**
 * Hidden, dev-only TokenOps/Zama browser diagnostic.
 *
 * Route: /dev/tokenops-diagnostic — deliberately NOT linked from the landing
 * page, header nav (app/layout.tsx), or any production surface. It exists so
 * a developer with a funded BURNER wallet can manually prove, in a real
 * browser, the two riskiest unknowns from
 * docs/research/browser-tokenops-integration.md before the full issuer flow
 * is wired:
 *
 *   1. The omit-`account` injected-wallet write path (operator approval via
 *      `ensureAirdropFactoryOperator` → `setOperator`).
 *   2. The `RelayerWeb` browser encryption round-trip (worker boot, CDN WASM
 *      fetch, relayer ZK-proof) via `getBrowserFheBundle` + `encryptUint64`.
 *
 * SCOPE FENCE — this page must never grow beyond those two checks:
 *   - NO airdrop creation or funding (`createAndFundConfidentialAirdrop` is
 *     never imported or called here).
 *   - NO claim, NO decrypt, NO registry write.
 *   - Nothing runs on page load or on state change — every call sits behind
 *     an explicit button click, gated by a burner-wallet acknowledgement.
 *
 * PRIVACY NOTE: the encryption test value (1_000_000 raw = 1.0 CTTT) is a
 * hardcoded public constant, not a real allocation — displaying it leaks
 * nothing. The result shown is the opaque ciphertext handle and the proof
 * byte length only; the raw proof bytes are never dumped, and nothing is
 * persisted or logged.
 */

import { useState } from "react";
import type { Hex } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";
import { erc7984OperatorAbi } from "@tokenops/sdk/fhe";
import { encryptUint64 } from "@tokenops/sdk/fhe-airdrop";
import { Badge, Card, KeyValueRow, SectionLabel, TxLink } from "../../../components/ui";
import { WalletStatusBar } from "../../../components/wallet/WalletStatusBar";
import { useSepoliaWallet } from "../../../components/wallet/hooks";
import {
  CTTT_SYMBOL,
  CTTT_TOKEN_ADDRESS,
  SEPOLIA_CHAIN_ID,
  TOKENOPS_AIRDROP_FACTORY,
  shortHex,
} from "../../../lib/constants";
import { getBrowserFheBundle } from "../../../lib/tokenops/browser";
import { ensureAirdropFactoryOperator } from "../../../lib/tokenops/issuer";

/* ------------------------------------------------------------------ */
/* Diagnostic state machines (one per button — no cross-triggering)    */
/* ------------------------------------------------------------------ */

type OperatorCheckState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "approved" } // factory already an authorized operator — no tx needed
  | { phase: "needed" } // factory NOT yet an operator — approval tx required
  | { phase: "error"; message: string };

type ApproveState =
  | { phase: "idle" }
  | { phase: "pending" } // wallet prompt shown / tx mining (setOperator waits for receipt)
  | { phase: "confirmed"; hash: Hex }
  | { phase: "error"; message: string };

type EncryptState =
  | { phase: "idle" }
  | { phase: "running" }
  | {
      phase: "success";
      handle: Hex;
      proofByteLength: number;
      boundContract: string;
      boundUser: string;
    }
  | { phase: "error"; message: string };

/** Fixed public test value for the encryption diagnostic: 1.0 CTTT (6 decimals). */
const ENCRYPTION_TEST_VALUE = 1_000_000n;

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0];
}

const buttonClass =
  "rounded-lg border border-violet-500/40 bg-violet-500/10 px-3.5 py-2 text-[13px] font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40";

export default function TokenOpsDiagnosticPage() {
  const wallet = useSepoliaWallet();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [burnerAck, setBurnerAck] = useState(false);
  const [check, setCheck] = useState<OperatorCheckState>({ phase: "idle" });
  const [approve, setApprove] = useState<ApproveState>({ phase: "idle" });
  const [encrypt, setEncrypt] = useState<EncryptState>({ phase: "idle" });

  const walletReady = wallet.isConnected && wallet.isOnSepolia && !!wallet.address;

  /* -------------------------------------------------------------- */
  /* Button 1 — free isOperator read (no tx, no signature)           */
  /* -------------------------------------------------------------- */
  async function handleCheckOperator() {
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
      // isOperator(holder = connected wallet, spender = TokenOps factory)
      // on the CTTT token. Zero cost, zero wallet prompt.
      const isOperator = await publicClient.readContract({
        address: CTTT_TOKEN_ADDRESS as `0x${string}`,
        abi: erc7984OperatorAbi,
        functionName: "isOperator",
        args: [wallet.address, TOKENOPS_AIRDROP_FACTORY as `0x${string}`],
      });
      setCheck(isOperator ? { phase: "approved" } : { phase: "needed" });
    } catch (error) {
      setCheck({ phase: "error", message: firstLine(error) });
    }
  }

  /* -------------------------------------------------------------- */
  /* Button 2 — setOperator via ensureAirdropFactoryOperator (1 tx)  */
  /* -------------------------------------------------------------- */
  async function handleApproveOperator() {
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
    if (!burnerAck) {
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
        token: CTTT_TOKEN_ADDRESS as `0x${string}`,
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
          address: CTTT_TOKEN_ADDRESS as `0x${string}`,
          abi: erc7984OperatorAbi,
          functionName: "isOperator",
          args: [wallet.address!, TOKENOPS_AIRDROP_FACTORY as `0x${string}`],
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

  /* -------------------------------------------------------------- */
  /* Button 3 — browser encryption round-trip (free, no tx)          */
  /* -------------------------------------------------------------- */
  async function handleEncryptionTest() {
    if (encrypt.phase === "running") return;
    if (!burnerAck) {
      setEncrypt({ phase: "error", message: "Refused: confirm the burner-wallet checkbox first." });
      return;
    }
    if (!walletReady || !wallet.address || !publicClient || !walletClient) {
      setEncrypt({ phase: "error", message: "Connect a wallet on Sepolia first." });
      return;
    }
    setEncrypt({ phase: "running" });
    try {
      // Real construction + real relayer round-trip. First run per browser is
      // slow (worker boot + cdn.zama.org WASM fetch + FHE params download).
      const bundle = getBrowserFheBundle({ publicClient, walletClient });
      // Diagnostic-only binding: `encryptUint64` requires a (contractAddress,
      // userAddress) pair the proof is bound to. No airdrop clone exists in
      // this diagnostic, so we bind to the CTTT token as the contract and the
      // connected wallet as the user. The resulting ciphertext is never sent
      // anywhere — this proves the encryption pipeline, nothing else.
      const encrypted = await encryptUint64({
        encryptor: bundle.encryptor,
        contractAddress: CTTT_TOKEN_ADDRESS as `0x${string}`,
        userAddress: wallet.address,
        value: ENCRYPTION_TEST_VALUE,
      });
      setEncrypt({
        phase: "success",
        handle: encrypted.handle,
        // inputProof is 0x-prefixed hex; two hex chars per byte.
        proofByteLength: (encrypted.inputProof.length - 2) / 2,
        boundContract: CTTT_TOKEN_ADDRESS,
        boundUser: wallet.address,
      });
    } catch (error) {
      setEncrypt({ phase: "error", message: firstLine(error) });
    }
  }

  const busy =
    check.phase === "checking" || approve.phase === "pending" || encrypt.phase === "running";

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <SectionLabel>Developer diagnostic</SectionLabel>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
        TokenOps browser diagnostic
      </h1>

      {/* Warning banner */}
      <Card className="mt-6 border-amber-500/40 bg-amber-500/10 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="pending">Developer diagnostic only</Badge>
          <Badge tone="pending">Burner wallet required</Badge>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-amber-200">
          Developer diagnostic only. Use a burner wallet. This page may request a Sepolia
          transaction if operator approval is missing. It does not create or fund an airdrop.
        </p>
      </Card>

      {/* Section 1 — wallet readiness */}
      <div className="mt-10">
        <SectionLabel>1 · Wallet readiness</SectionLabel>
        <div className="mt-3">
          <WalletStatusBar />
        </div>
        <Card className="mt-3 p-4">
          <KeyValueRow label="Connected">
            {wallet.isConnected ? <Badge tone="proven">Connected</Badge> : <Badge tone="pending">Not connected</Badge>}
          </KeyValueRow>
          <KeyValueRow label="Address">
            {wallet.address ? (
              <span className="font-mono text-[13px]" title={wallet.address}>
                {shortHex(wallet.address)}
              </span>
            ) : (
              "—"
            )}
          </KeyValueRow>
          <KeyValueRow label="Current chain">
            {wallet.chainId !== undefined
              ? `${wallet.chainName ?? "Unrecognised chain"} (id ${wallet.chainId})`
              : "—"}
          </KeyValueRow>
          <KeyValueRow label="Required chain">Sepolia (id {SEPOLIA_CHAIN_ID})</KeyValueRow>
          <KeyValueRow label="Ready for diagnostics">
            {walletReady ? (
              <Badge tone="proven">Yes</Badge>
            ) : (
              <Badge tone="pending">No — connect on Sepolia (switch via the panel above)</Badge>
            )}
          </KeyValueRow>
        </Card>
      </div>

      {/* Section 4 lives visually before the action buttons: safety controls */}
      <div className="mt-10">
        <SectionLabel>Safety controls</SectionLabel>
        <Card className="mt-3 p-4">
          <label className="flex cursor-pointer items-start gap-3 text-[14px] text-zinc-200">
            <input
              type="checkbox"
              checked={burnerAck}
              onChange={(e) => setBurnerAck(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-violet-500"
            />
            <span>
              I am using a burner wallet.
              <span className="block text-[12px] text-zinc-500">
                The approve and encryption-test buttons stay disabled until this is checked.
              </span>
            </span>
          </label>
          <p className="mt-4 border-t border-white/[0.05] pt-3 text-[13px] leading-relaxed text-zinc-500">
            This is an isolated diagnostic — the real issuer/recipient flows are not wired yet.
            Nothing here creates or funds an airdrop, signs or consumes a claim, decrypts a
            handle, or writes to the registry. The two tests below are exactly: one ERC-7984
            operator approval (a single Sepolia transaction, only if missing) and one
            client-side encryption round-trip (free, no transaction).
          </p>
        </Card>
      </div>

      {/* Section 2 — operator approval diagnostic */}
      <div className="mt-10">
        <SectionLabel>2 · Operator approval diagnostic</SectionLabel>
        <Card className="mt-3 p-4">
          <p className="text-[13px] leading-relaxed text-zinc-500">
            Checks whether the TokenOps airdrop factory{" "}
            <span className="font-mono text-zinc-400" title={TOKENOPS_AIRDROP_FACTORY}>
              {shortHex(TOKENOPS_AIRDROP_FACTORY)}
            </span>{" "}
            is already an authorized ERC-7984 operator for your wallet on the {CTTT_SYMBOL} token{" "}
            <span className="font-mono text-zinc-400" title={CTTT_TOKEN_ADDRESS}>
              {shortHex(CTTT_TOKEN_ADDRESS)}
            </span>
            . The check is a free read. Approval, if needed, is one real Sepolia transaction via{" "}
            <code className="rounded bg-white/5 px-1 py-0.5 font-mono text-[12px]">
              ensureAirdropFactoryOperator
            </code>
            .
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCheckOperator}
              disabled={!walletReady || busy}
              className={buttonClass}
            >
              {check.phase === "checking" ? "Checking…" : "Check TokenOps operator approval"}
            </button>
            <button
              type="button"
              onClick={handleApproveOperator}
              disabled={!walletReady || !burnerAck || check.phase !== "needed" || busy}
              className={buttonClass}
            >
              {approve.phase === "pending"
                ? "Waiting for wallet / confirmation…"
                : "Approve TokenOps operator (1 Sepolia tx)"}
            </button>
          </div>

          <div className="mt-4 border-t border-white/[0.05] pt-1">
            <KeyValueRow label="Check result">
              {check.phase === "idle" && <span className="text-zinc-500">Not run yet</span>}
              {check.phase === "checking" && <span className="text-zinc-400">Reading isOperator…</span>}
              {check.phase === "approved" && <Badge tone="proven">Already approved</Badge>}
              {check.phase === "needed" && <Badge tone="pending">Approval needed</Badge>}
              {check.phase === "error" && (
                <span className="text-amber-300">Error: {check.message}</span>
              )}
            </KeyValueRow>
            <KeyValueRow label="Approval transaction">
              {approve.phase === "idle" && <span className="text-zinc-500">Not run yet</span>}
              {approve.phase === "pending" && (
                <span className="text-zinc-400">Sent to wallet — confirm the prompt…</span>
              )}
              {approve.phase === "confirmed" && (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Badge tone="proven">Confirmed</Badge>
                  <TxLink hash={approve.hash} />
                </span>
              )}
              {approve.phase === "error" && (
                <span className="text-amber-300">{approve.message}</span>
              )}
            </KeyValueRow>
          </div>
        </Card>
      </div>

      {/* Section 3 — browser encryption diagnostic */}
      <div className="mt-10">
        <SectionLabel>3 · Browser encryption diagnostic</SectionLabel>
        <Card className="mt-3 p-4">
          <p className="text-[13px] leading-relaxed text-zinc-500">
            Constructs the real browser FHE bundle (RelayerWeb Web Worker, WASM engine from
            cdn.zama.org, Zama testnet relayer) and encrypts a fixed public test value of{" "}
            {ENCRYPTION_TEST_VALUE.toString()} raw units (1.0 {CTTT_SYMBOL}) bound to your own
            address. Free — no transaction, no wallet prompt. The first run per browser downloads
            several MB of FHE parameters and can take a while; later runs are cached.
          </p>

          <div className="mt-4">
            <button
              type="button"
              onClick={handleEncryptionTest}
              disabled={!walletReady || !burnerAck || busy}
              className={buttonClass}
            >
              {encrypt.phase === "running" ? "Encrypting…" : "Run browser encryption test"}
            </button>
          </div>

          <div className="mt-4 border-t border-white/[0.05] pt-1">
            <KeyValueRow label="Status">
              {encrypt.phase === "idle" && <span className="text-zinc-500">Not run yet</span>}
              {encrypt.phase === "running" && (
                <span className="text-zinc-400">
                  Encryption started — worker boot / WASM fetch / relayer proof round-trip…
                </span>
              )}
              {encrypt.phase === "success" && <Badge tone="proven">Encryption success</Badge>}
              {encrypt.phase === "error" && (
                <span className="text-amber-300">Encryption failed: {encrypt.message}</span>
              )}
            </KeyValueRow>
            {encrypt.phase === "success" && (
              <>
                <KeyValueRow label="Encrypted handle (opaque ciphertext id)">
                  <span className="break-all font-mono text-[12px]">{encrypt.handle}</span>
                </KeyValueRow>
                <KeyValueRow label="Input proof size">
                  {encrypt.proofByteLength} bytes (raw bytes not displayed)
                </KeyValueRow>
                <KeyValueRow label="Proof bound to (contract, user)">
                  <span className="font-mono text-[12px]">
                    ({shortHex(encrypt.boundContract)}, {shortHex(encrypt.boundUser)})
                  </span>
                </KeyValueRow>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
