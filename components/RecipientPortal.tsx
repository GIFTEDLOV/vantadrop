"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CTTT_SYMBOL,
  DEMO,
  TX,
  ZAMA_SDK_VERSION,
} from "../lib/constants";
import { AddressLink, Badge, Card, TxLink } from "./ui";
import { useSepoliaWallet } from "./wallet/hooks";
import { NetworkGuard } from "./wallet/NetworkGuard";
import { WalletButton } from "./wallet/WalletButton";
import { WalletStatusBar } from "./wallet/WalletStatusBar";

/**
 * Demo recipient portal.
 *
 * HONESTY CONTRACT: wallet connection and Sepolia network detection are live
 * in this UI — but no transaction is sent from this page. The issuer-side
 * create flow is wired in /create; recipient browser decrypt/claim has now
 * been PROVEN LIVE (2026-07-05), but only via the hidden, dev-only diagnostic
 * at /dev/recipient-claim-diagnostic — a human ran eligibility check →
 * getClaimAmount → decrypt → claim → post-claim verify against a real
 * recipient burner wallet on live Sepolia, decrypting a real 5 CTTT
 * allocation and confirming the post-claim balance. See
 * docs/research/browser-tokenops-integration.md ("Live browser recipient
 * decrypt/claim result") for the real tx hashes.
 *
 * This page itself deliberately still has no live claim button — wiring the
 * diagnostic's proven sequence into THIS public, non-developer-facing page
 * (productization: collapsing steps, hiding raw handles/proofs, a real
 * claim-package delivery UX) is the next phase, not yet started. In the
 * eventual product, the sender shares each recipient's claim package
 * privately (out-of-band, e.g. the copy-paste flow /create already produces)
 * and the recipient imports it here — VantaDropRegistry never stores claim
 * packages, signatures, or amounts; it only ever holds public metadata (see
 * contracts/VantaDropRegistry.sol).
 *
 * Every stage below shows two things, clearly separated:
 *   1. what the live flow will do once this page itself is wired, and
 *   2. what the proven Sepolia spike (scripts/spike-tokenops-sepolia.ts)
 *      actually did, with the real transaction hash / decrypted result.
 * Advancing through stages is a walkthrough of proven facts — it never
 * fabricates a new transaction or a fake "success" for an action this page
 * did not perform.
 */

interface Stage {
  title: string;
  liveAction: string;
  provenFact: React.ReactNode;
}

export function RecipientPortal() {
  // How many stages of the walkthrough have been revealed (stage 0 always visible).
  const [revealed, setRevealed] = useState(0);
  const wallet = useSepoliaWallet();

  const stages: Stage[] = [
    {
      title: "Connect wallet",
      liveAction:
        "Live flow: connect the recipient wallet on Sepolia — this part is now real in this UI (wagmi injected connector).",
      provenFact: (
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-zinc-400">
            Wallet connection is <span className="text-emerald-300">live in this UI</span> —
            connect and network-check below. Connecting does{" "}
            <span className="text-zinc-200">not</span> make you the demo recipient, and no
            transaction is sent: in the proven spike, the recipient was a burner wallet driven
            by a Node script:
          </p>
          <p className="text-sm">
            <span className="mr-2 text-zinc-500">Spike recipient:</span>
            <AddressLink address={DEMO.recipient} />
          </p>
          <div className="space-y-3">
            <WalletButton />
            <NetworkGuard />
            {wallet.isConnected && (
              <p className="text-[13px] text-zinc-500">
                Connected — detection only. Recipient decrypt/claim has been proven live in
                the browser diagnostic (/dev/recipient-claim-diagnostic) — eligibility
                checks, decryption, and claiming still cannot be performed from this public
                page until that proven sequence is wired here (portal productization, the
                next phase).
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      title: "Check eligibility",
      liveAction:
        "Live flow: run TokenOps preflightClaim + isSignatureValid against the airdrop clone to confirm this wallet holds a valid, unclaimed authorization.",
      provenFact: (
        <div className="space-y-2 text-[13px] leading-relaxed text-zinc-400">
          <p>
            Proven in the spike: <code className="rounded bg-white/5 px-1 py-0.5 font-mono text-[12px]">preflightClaim</code>{" "}
            returned <span className="font-mono text-emerald-300">ready: true</span> and{" "}
            <code className="rounded bg-white/5 px-1 py-0.5 font-mono text-[12px]">isSignatureValid</code>{" "}
            returned <span className="font-mono text-emerald-300">true</span> for this
            recipient/handle pair (read-only calls — no transaction needed).
          </p>
          <p>
            Airdrop clone: <AddressLink address={DEMO.airdropClone} />
          </p>
        </div>
      ),
    },
    {
      title: "Grant decrypt access",
      liveAction:
        "Live flow: submit getClaimAmount — an on-chain transaction that grants the recipient's own address ACL access to their encrypted allocation handle.",
      provenFact: (
        <div className="space-y-2 text-[13px] leading-relaxed text-zinc-400">
          <p>
            Proven live — the spike&apos;s recipient submitted this exact transaction on Sepolia:
          </p>
          <p>
            <span className="mr-2 text-zinc-500">getClaimAmount tx:</span>
            <TxLink hash={TX.getClaimAmount} />
          </p>
        </div>
      ),
    },
    {
      title: "Decrypt my allocation",
      liveAction:
        "Live flow: sign a one-time EIP-712 permit, then decrypt the granted handle client-side with the Zama SDK. The plaintext exists only on the recipient's machine.",
      provenFact: (
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-zinc-400">
            Proven — the spike recipient authorized decryption ({ZAMA_SDK_VERSION}) and
            decrypted their allocation:
          </p>
          <div className="rounded-lg border border-violet-500/30 bg-violet-500/[0.07] px-5 py-4">
            <p className="text-xs uppercase tracking-wider text-violet-300">
              Decrypted allocation (spike result)
            </p>
            <p className="mt-1 text-2xl font-semibold text-white">
              {DEMO.decryptedAllocationFormatted}
              <span className="ml-3 align-middle font-mono text-[13px] font-normal text-zinc-500">
                {DEMO.decryptedAllocationRaw} raw units · 6 decimals
              </span>
            </p>
          </div>
          <p className="text-[13px] text-zinc-500">
            Only the recipient could produce this number. It never appeared on-chain in
            plaintext.
          </p>
        </div>
      ),
    },
    {
      title: "Claim allocation",
      liveAction:
        "Live flow: submit claim() with the encrypted input and the admin's claim authorization — the confidential transfer settles on-chain, amount still encrypted.",
      provenFact: (
        <div className="space-y-2 text-[13px] leading-relaxed text-zinc-400">
          <p>Proven live — the spike&apos;s claim succeeded on Sepolia:</p>
          <p>
            <span className="mr-2 text-zinc-500">claim tx:</span>
            <TxLink hash={TX.claim} />
          </p>
        </div>
      ),
    },
    {
      title: "View proof",
      liveAction:
        "Live flow: re-decrypt the wallet's confidential token balance to confirm value actually moved — not just that the transaction didn't revert.",
      provenFact: (
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-zinc-400">
            Proven — after claiming, the spike recipient decrypted their {CTTT_SYMBOL} balance:
          </p>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-5 py-4">
            <p className="text-xs uppercase tracking-wider text-emerald-300">
              Post-claim balance decrypted to
            </p>
            <p className="mt-1 text-2xl font-semibold text-white">
              {DEMO.decryptedAllocationRaw}
              <span className="ml-3 align-middle font-mono text-[13px] font-normal text-zinc-500">
                raw units = {DEMO.decryptedAllocationFormatted}
              </span>
            </p>
            <p className="mt-2 text-[13px] text-zinc-400">
              The confidential transfer moved real value end-to-end.
            </p>
          </div>
          <p className="text-[13px]">
            <Link
              href="/verification"
              className="text-violet-300 underline decoration-violet-500/40 underline-offset-4 hover:text-violet-200"
            >
              Full verification panel →
            </Link>
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="demo">Demo UI — based on proven Sepolia spike</Badge>
        <Badge tone="neutral">Wallet connect live</Badge>
        <Badge tone="proven">Decrypt/claim proven live (diagnostic)</Badge>
        <Badge tone="pending">Portal productization — next phase</Badge>
      </div>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
        Recipient portal
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
        This is the recipient&apos;s side of the{" "}
        <Link
          href="/drop/demo"
          className="text-violet-300 underline decoration-violet-500/40 underline-offset-4 hover:text-violet-200"
        >
          Genesis Confidential Airdrop
        </Link>
        . Each stage shows what the live flow will do — and the real result the proven Sepolia
        spike already produced for that stage. Nothing here fakes an action this page didn&apos;t
        perform.
      </p>

      <div className="mt-6">
        <WalletStatusBar />
      </div>

      <ol className="mt-8 space-y-4">
        {stages.map((stage, i) => {
          const isRevealed = i <= revealed;
          const isCurrent = i === revealed;
          return (
            <li key={stage.title}>
              <Card
                className={`p-6 transition ${
                  isRevealed ? "" : "opacity-45"
                } ${isCurrent ? "border-violet-500/30" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-medium ${
                      i < revealed
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : isCurrent
                          ? "border-violet-500/50 bg-violet-500/15 text-violet-200"
                          : "border-white/10 bg-white/5 text-zinc-500"
                    }`}
                  >
                    {i < revealed ? "✓" : i + 1}
                  </span>
                  <h2 className="text-base font-semibold text-white">{stage.title}</h2>
                  {isRevealed && i !== 0 && <Badge tone="proven">Proven in spike</Badge>}
                  {i === 0 && <Badge tone="neutral">Wallet connect live</Badge>}
                </div>

                {isRevealed && (
                  <div className="mt-4 space-y-4">
                    <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[13px] leading-relaxed text-zinc-500">
                      {stage.liveAction}
                    </p>
                    <div>{stage.provenFact}</div>
                    {isCurrent && i < stages.length - 1 && (
                      <button
                        type="button"
                        onClick={() => setRevealed((r) => r + 1)}
                        className="rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
                      >
                        Continue walkthrough →
                      </button>
                    )}
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ol>

      <p className="mt-8 text-[13px] leading-relaxed text-zinc-600">
        Walkthrough note: advancing stages reveals the proven results of the already-executed
        Sepolia spike (scripts/spike-tokenops-sepolia.ts). It does not send transactions from
        this browser.
      </p>
    </div>
  );
}
