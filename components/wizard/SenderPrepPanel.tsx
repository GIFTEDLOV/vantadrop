"use client";

/**
 * Sender preparation panel — readiness checks for the live /create flow.
 *
 * Mounted at the top of the wizard (CreateWizard.tsx) so a sender with a
 * burner wallet can verify, BEFORE filling out six steps, that the live
 * execution step will not stall on missing prerequisites:
 *
 *   - wallet connected + Sepolia selected
 *   - Sepolia ETH balance (gas) — free auto-read via wagmi useBalance
 *   - CTTT confidential-balance readiness — free encrypted-handle read,
 *     behind an explicit button; NEVER decrypted here (see scope fence)
 *   - test CTTT minting via the TokenOps testnet faucet (1 real Sepolia tx,
 *     behind its own button + burner acknowledgement)
 *   - TokenOps factory operator approval (free check + real approve tx,
 *     via the shared useOperatorApproval hook)
 *
 * SCOPE FENCE — this panel checks readiness only. It must never:
 *   - run any part of the issuer create flow (that is ExecuteStep's job,
 *     and only ExecuteStep's);
 *   - decrypt an encrypted balance handle. `confidentialBalanceOf` returns
 *     an opaque euint64 ciphertext handle; turning it into a plaintext
 *     number requires the Zama `allow()` + `userDecrypt()` round-trip —
 *     the exact primitive that powers recipient allocation decryption,
 *     which is the explicitly-unwired next phase. The honest message shown
 *     instead is deliberate, not a TODO.
 *
 * Faucet mint honesty note: the mint AMOUNT is public plaintext calldata
 * (verified against the installed dist/testnet-faucet/types.d.ts TSDoc) —
 * only the resulting aggregated balance is confidential. The fixed 10 CTTT
 * mint here is a public constant; displaying it leaks nothing.
 *
 * No live action runs on mount. The only automatic call is wagmi's
 * useBalance ETH read — a free JSON-RPC read with no wallet prompt, same
 * class as the passive chain detection the WalletStatusBar already does.
 * Every transaction sits behind its own explicit button, gated by this
 * panel's own burner-wallet checkbox.
 */

import { useState } from "react";
import { formatEther, type Hex } from "viem";
import { useBalance, usePublicClient, useWalletClient } from "wagmi";
import { createTestnetFaucetClient } from "@tokenops/sdk/testnet-faucet";
import {
  CTTT_DECIMALS,
  CTTT_SYMBOL,
  CTTT_TOKEN_ADDRESS,
  SEPOLIA_CHAIN_ID,
  TOKENOPS_AIRDROP_FACTORY,
  shortHex,
} from "../../lib/constants";
import { useOperatorApproval } from "../../lib/tokenops/useOperatorApproval";
import { AddressLink, Badge, Card, KeyValueRow, SectionLabel, TxLink } from "../ui";
import { useSepoliaWallet } from "../wallet/hooks";

/**
 * Fixed faucet mint amount: 10 CTTT at 6 decimals — the same small,
 * disposable convention the proven Node spike used (scripts/
 * spike-tokenops-sepolia.ts mints 10_000_000n).
 */
const MINT_AMOUNT_RAW = 10_000_000n;
const MINT_AMOUNT_HUMAN = "10";

/** bytes32 zero — what a never-credited account's balance handle reads back as. */
const ZERO_HANDLE = `0x${"0".repeat(64)}`;

type CtttHandleState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "credited"; handle: Hex } // non-zero handle: account has confidential state
  | { phase: "zero" } // zero handle: never credited — mint needed
  | { phase: "error"; message: string };

type MintState =
  | { phase: "idle" }
  | { phase: "pending" } // wallet prompt shown / tx mining (SDK waits for the receipt)
  | { phase: "confirmed"; hash: Hex }
  | { phase: "error"; message: string };

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0];
}

const buttonClass =
  "rounded-lg border border-violet-500/40 bg-violet-500/10 px-3.5 py-2 text-[13px] font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40";

export function SenderPrepPanel() {
  const wallet = useSepoliaWallet();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [open, setOpen] = useState(true);
  const [burnerAck, setBurnerAck] = useState(false);
  const [ctttHandle, setCtttHandle] = useState<CtttHandleState>({ phase: "idle" });
  const [mint, setMint] = useState<MintState>({ phase: "idle" });
  const operator = useOperatorApproval();

  const walletReady = wallet.isConnected && wallet.isOnSepolia && !!wallet.address;

  // Free ETH read (no tx, no prompt) — enabled only once connected on Sepolia.
  const ethBalance = useBalance({
    address: wallet.address,
    chainId: SEPOLIA_CHAIN_ID,
    query: { enabled: walletReady },
  });

  const busy =
    ctttHandle.phase === "checking" || mint.phase === "pending" || operator.busy;

  /* -------------------------------------------------------------- */
  /* CTTT readiness — free encrypted-handle read, NO decrypt          */
  /* -------------------------------------------------------------- */
  async function handleCheckCtttHandle() {
    if (ctttHandle.phase === "checking") return;
    if (!walletReady || !wallet.address || !publicClient) {
      setCtttHandle({ phase: "error", message: "Connect a wallet on Sepolia first." });
      return;
    }
    setCtttHandle({ phase: "checking" });
    try {
      // Read-only faucet client: walletClient is an optional config field
      // ("Optional for read-only usage" — installed faucet.d.ts), so this
      // needs no signer and can never prompt.
      const faucet = createTestnetFaucetClient({
        publicClient,
        chainId: SEPOLIA_CHAIN_ID,
      });
      const handle = await faucet.confidentialBalanceOf(wallet.address);
      // "A never-credited account reads back the zero handle" — installed
      // faucet.d.ts TSDoc for confidentialBalanceOf. This distinction is the
      // only thing readable without a decrypt round-trip, and it is real.
      if (handle.toLowerCase() === ZERO_HANDLE) {
        setCtttHandle({ phase: "zero" });
      } else {
        setCtttHandle({ phase: "credited", handle });
      }
    } catch (error) {
      setCtttHandle({ phase: "error", message: firstLine(error) });
    }
  }

  /* -------------------------------------------------------------- */
  /* Mint test CTTT — 1 real Sepolia tx via the testnet faucet        */
  /* -------------------------------------------------------------- */
  async function handleMint() {
    if (mint.phase === "pending") return;
    if (!burnerAck) {
      setMint({ phase: "error", message: "Refused: confirm the burner-wallet checkbox first." });
      return;
    }
    if (!walletReady || !publicClient || !walletClient) {
      setMint({ phase: "error", message: "Connect a wallet on Sepolia first." });
      return;
    }
    setMint({ phase: "pending" });
    try {
      const faucet = createTestnetFaucetClient({
        publicClient,
        walletClient,
        chainId: SEPOLIA_CHAIN_ID,
      });
      // FOOTGUN NOTE: `account` and `to` deliberately omitted — the SDK falls
      // back to walletClient.account (wagmi's json-rpc account → the wallet
      // extension signs). Never pass a bare address string. The mint amount
      // is PUBLIC plaintext calldata; no encryptor/relayer is involved.
      const result = await faucet.mintConfidential({ amount: MINT_AMOUNT_RAW });
      // Success renders ONLY here — after the SDK promise resolved with a
      // real receipt-decoded result. Nothing is faked.
      setMint({ phase: "confirmed", hash: result.hash });
      // The handle-readiness result (if any) is now stale — a fresh mint
      // credits the account. Prompt a re-check rather than assuming.
      setCtttHandle({ phase: "idle" });
    } catch (error) {
      setMint({ phase: "error", message: firstLine(error) });
    }
  }

  return (
    <Card className="border-violet-500/20 bg-violet-500/[0.03]">
      {/* Header row — always visible, toggles the body */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-white">Sender preparation</span>
          {wallet.mounted && (
            walletReady ? (
              <Badge tone="proven">Wallet ready (Sepolia)</Badge>
            ) : (
              <Badge tone="pending">Wallet not ready</Badge>
            )
          )}
          <Badge tone="pending">Burner wallet only</Badge>
        </span>
        <span className="shrink-0 font-mono text-[12px] text-zinc-500">
          {open ? "▲ collapse" : "▼ expand"}
        </span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-white/[0.06] p-5">
          {/* -------- Prominent burner warning -------- */}
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="pending">Use a burner wallet only</Badge>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-amber-200">
              This panel can send real Sepolia transactions (test-token mint, operator
              approval). Connect a disposable burner wallet — never a wallet holding
              real funds. Checks marked &quot;free&quot; are reads only and never prompt
              your wallet. Nothing on this panel runs the create flow itself — that
              stays on the Execute step.
            </p>
          </div>

          {/* -------- Wallet + network -------- */}
          <div>
            <SectionLabel>Wallet &amp; network</SectionLabel>
            <div className="mt-2">
              <KeyValueRow label="Connected">
                {wallet.isConnected ? (
                  <Badge tone="proven">Connected</Badge>
                ) : (
                  <Badge tone="pending">Not connected — use the wallet panel below</Badge>
                )}
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
              <KeyValueRow label="Current network">
                {wallet.chainId !== undefined
                  ? `${wallet.chainName ?? "Unrecognised chain"} (id ${wallet.chainId})`
                  : "—"}
              </KeyValueRow>
              <KeyValueRow label="Required network">
                Sepolia (id {SEPOLIA_CHAIN_ID})
              </KeyValueRow>
              <KeyValueRow label="Sepolia ETH balance (gas)">
                {!walletReady ? (
                  <span className="text-zinc-500">Connect on Sepolia to read</span>
                ) : ethBalance.isPending ? (
                  <span className="text-zinc-400">Loading…</span>
                ) : ethBalance.isError ? (
                  <span className="text-amber-300">
                    Read failed: {firstLine(ethBalance.error)}
                  </span>
                ) : ethBalance.data ? (
                  <span className="font-mono text-[13px]">
                    {formatEther(ethBalance.data.value)} ETH
                  </span>
                ) : (
                  "—"
                )}
              </KeyValueRow>
              <KeyValueRow label={`${CTTT_SYMBOL} token (ERC-7984)`}>
                <AddressLink address={CTTT_TOKEN_ADDRESS} />
              </KeyValueRow>
              <KeyValueRow label="TokenOps airdrop factory">
                <AddressLink address={TOKENOPS_AIRDROP_FACTORY} />
              </KeyValueRow>
            </div>
          </div>

          {/* -------- Burner acknowledgement (gates the two tx buttons) -------- */}
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
                The mint and approve buttons stay disabled until this is checked. This
                acknowledgement is separate from the Execute step&apos;s own checkbox.
              </span>
            </span>
          </label>

          {/* -------- CTTT readiness + mint -------- */}
          <div>
            <SectionLabel>{CTTT_SYMBOL} test tokens</SectionLabel>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
              {CTTT_SYMBOL} balance is confidential. Balance verification may require the
              Zama decrypt flow. Mint test tokens if needed. The free check below reads
              only the opaque encrypted balance handle — it can tell &quot;never
              credited&quot; from &quot;has confidential state&quot;, but never a
              plaintext amount (decrypting is deliberately out of scope for this panel).
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCheckCtttHandle}
                disabled={!walletReady || busy}
                className={buttonClass}
              >
                {ctttHandle.phase === "checking"
                  ? "Reading handle…"
                  : `Check ${CTTT_SYMBOL} readiness (free read)`}
              </button>
              <button
                type="button"
                onClick={handleMint}
                disabled={!walletReady || !burnerAck || busy}
                className={buttonClass}
              >
                {mint.phase === "pending"
                  ? "Waiting for wallet / confirmation…"
                  : `Mint test ${CTTT_SYMBOL} (${MINT_AMOUNT_HUMAN} ${CTTT_SYMBOL}, 1 Sepolia tx)`}
              </button>
            </div>
            <div className="mt-3 border-t border-white/[0.05] pt-1">
              <KeyValueRow label="Encrypted balance handle">
                {ctttHandle.phase === "idle" && (
                  <span className="text-zinc-500">Not checked yet</span>
                )}
                {ctttHandle.phase === "checking" && (
                  <span className="text-zinc-400">Reading confidentialBalanceOf…</span>
                )}
                {ctttHandle.phase === "credited" && (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <Badge tone="confidential">Handle exists — account has been credited</Badge>
                    <span className="font-mono text-[12px] text-zinc-500" title={ctttHandle.handle}>
                      {shortHex(ctttHandle.handle, 10)}
                    </span>
                  </span>
                )}
                {ctttHandle.phase === "zero" && (
                  <Badge tone="pending">Zero handle — never credited, mint test tokens</Badge>
                )}
                {ctttHandle.phase === "error" && (
                  <span className="text-amber-300">Error: {ctttHandle.message}</span>
                )}
              </KeyValueRow>
              <KeyValueRow label="Mint transaction">
                {mint.phase === "idle" && <span className="text-zinc-500">Not run yet</span>}
                {mint.phase === "pending" && (
                  <span className="text-zinc-400">Sent to wallet — confirm the prompt…</span>
                )}
                {mint.phase === "confirmed" && (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <Badge tone="proven">Minted {MINT_AMOUNT_HUMAN} {CTTT_SYMBOL}</Badge>
                    <TxLink hash={mint.hash} />
                  </span>
                )}
                {mint.phase === "error" && (
                  <span className="text-amber-300">{mint.message}</span>
                )}
              </KeyValueRow>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
              Honesty note: the faucet mint <em>amount</em> ({MINT_AMOUNT_HUMAN}{" "}
              {CTTT_SYMBOL}, {CTTT_DECIMALS}-decimal raw {MINT_AMOUNT_RAW.toString()}) is
              public plaintext calldata by design — only your aggregated confidential
              balance stays private. After a successful mint, re-run the free readiness
              check.
            </p>
          </div>

          {/* -------- Operator approval -------- */}
          <div>
            <SectionLabel>Operator approval</SectionLabel>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
              The TokenOps factory{" "}
              <span className="font-mono text-zinc-400" title={TOKENOPS_AIRDROP_FACTORY}>
                {shortHex(TOKENOPS_AIRDROP_FACTORY)}
              </span>{" "}
              must be an authorized ERC-7984 operator on {CTTT_SYMBOL} before the Execute
              step can fund a distribution. The check is a free read; approval, if
              needed, is one real Sepolia transaction. Doing it here saves one wallet
              prompt during execution.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => operator.runCheck()}
                disabled={!walletReady || busy}
                className={buttonClass}
              >
                {operator.check.phase === "checking"
                  ? "Checking…"
                  : "Check operator approval (free read)"}
              </button>
              <button
                type="button"
                onClick={() => operator.runApprove({ burnerAck })}
                disabled={!walletReady || !burnerAck || operator.check.phase !== "needed" || busy}
                className={buttonClass}
              >
                {operator.approve.phase === "pending"
                  ? "Waiting for wallet / confirmation…"
                  : "Approve TokenOps operator (1 Sepolia tx)"}
              </button>
            </div>
            <div className="mt-3 border-t border-white/[0.05] pt-1">
              <KeyValueRow label="Check result">
                {operator.check.phase === "idle" && (
                  <span className="text-zinc-500">Not run yet</span>
                )}
                {operator.check.phase === "checking" && (
                  <span className="text-zinc-400">Reading isOperator…</span>
                )}
                {operator.check.phase === "approved" && (
                  <Badge tone="proven">Already approved</Badge>
                )}
                {operator.check.phase === "needed" && (
                  <Badge tone="pending">Approval needed</Badge>
                )}
                {operator.check.phase === "error" && (
                  <span className="text-amber-300">Error: {operator.check.message}</span>
                )}
              </KeyValueRow>
              <KeyValueRow label="Approval transaction">
                {operator.approve.phase === "idle" && (
                  <span className="text-zinc-500">Not run yet</span>
                )}
                {operator.approve.phase === "pending" && (
                  <span className="text-zinc-400">Sent to wallet — confirm the prompt…</span>
                )}
                {operator.approve.phase === "confirmed" && (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <Badge tone="proven">Confirmed</Badge>
                    <TxLink hash={operator.approve.hash} />
                  </span>
                )}
                {operator.approve.phase === "error" && (
                  <span className="text-amber-300">{operator.approve.message}</span>
                )}
              </KeyValueRow>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
