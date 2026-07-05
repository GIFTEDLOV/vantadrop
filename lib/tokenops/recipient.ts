/**
 * Recipient-side service functions for the eventual claim/decrypt flow
 * (`/recipient/demo` → future `/drop/[id]` claim view).
 *
 * Each function mirrors one proven step of `scripts/spike-tokenops-sepolia.ts`
 * (steps d–f: preflight → isSignatureValid → getClaimAmount → allow →
 * userDecrypt → claim → post-claim balance verify), translated to the browser
 * signing model per `docs/research/browser-tokenops-integration.md` §6.
 *
 * WIRING STATUS: every function here is called behind explicit manual
 * buttons from two surfaces — the hidden developer diagnostic
 * (app/dev/recipient-claim-diagnostic, where the full five-step sequence was
 * PROVEN LIVE on Sepolia on 2026-07-05) and the public recipient portal
 * (components/RecipientPortal.tsx → /recipient/demo, wired to these same
 * functions but not yet itself exercised live). Nothing here runs at render
 * time — click handlers only.
 *
 * `account` FOOTGUN (same rule as lib/tokenops/issuer.ts, restated because
 * the two paid recipient writes — getClaimAmount and claim — are exactly the
 * calls that broke the Node spike): OMIT `account` on every TokenOps write.
 * The SDK falls back to `walletClient.account`, wagmi's json-rpc Account,
 * which routes signing to the wallet extension. Never pass an address string.
 */

import type { Address, Hex, PublicClient, WalletClient } from "viem";
import type { ZamaSDK } from "@zama-fhe/sdk";
import {
  createConfidentialAirdropClient,
  type ConfidentialAirdropClient,
  type EncryptedInput,
} from "@tokenops/sdk/fhe-airdrop";
import type { PreflightResult } from "@tokenops/sdk";

/**
 * Construct the typed client for a deployed airdrop clone. Mirrors the
 * spike's `createConfidentialAirdropClient` — plain viem clients, no
 * encryptor needed (the recipient never encrypts; they submit the admin's
 * pre-encrypted payload verbatim).
 */
export function createAirdropClient(args: {
  publicClient: PublicClient;
  /** From wagmi `useWalletClient().data`. Optional for read-only eligibility checks. */
  walletClient?: WalletClient;
  /** Deployed ConfidentialAirdropCloneable address. */
  airdropAddress: Address;
}): ConfidentialAirdropClient {
  return createConfidentialAirdropClient({
    publicClient: args.publicClient,
    walletClient: args.walletClient,
    address: args.airdropAddress,
  });
}

export interface EligibilityResult {
  /** Window open, not paused, not already claimed, ETH covers gasFee(). */
  preflight: PreflightResult;
  /**
   * Admin signature validates for this caller/handle pair. `false` (not a
   * throw) = already claimed / window inactive / signer lacks admin role.
   * Malformed signature bytes throw InvalidSignatureError instead.
   */
  signatureValid: boolean;
  /** Exact msg.value the claim must attach, pre-fetched for UI display. */
  gasFeeWei: bigint;
}

/**
 * Free, read-only eligibility check. Mirrors the spike's `preflightClaim` +
 * `isSignatureValid` sequence (plus a `gasFee()` prefetch so the claim button
 * can show the exact cost up front, per the SDK's own recommendation).
 *
 * Documented SDK limitation (do not paper over it in UI copy): preflight does
 * NOT check pool funding — an unfunded pool passes preflight and reverts
 * on-chain at claim time with FheHandleNotAllowedError.
 */
export async function checkRecipientEligibility(args: {
  client: ConfidentialAirdropClient;
  /** The wallet that intends to claim (the on-chain check is per-caller). */
  caller: Address;
  encryptedAmountHandle: Hex;
  signature: Hex;
}): Promise<EligibilityResult> {
  const [preflight, signatureValid, gasFeeWei] = await Promise.all([
    args.client.preflightClaim({
      caller: args.caller,
      encryptedAmountHandle: args.encryptedAmountHandle,
    }),
    args.client.isSignatureValid({
      encryptedAmountHandle: args.encryptedAmountHandle,
      signature: args.signature,
      caller: args.caller,
    }),
    args.client.gasFee(),
  ]);
  return { preflight, signatureValid, gasFeeWei };
}

/**
 * Grant the caller persistent ACL decrypt access on their allocation handle
 * — mirrors the spike's `getClaimAmount` step.
 *
 * IMPORTANT, and easy to get wrong in UI copy: **this is a paid write
 * transaction (real gas, 1 wallet prompt), and it runs BEFORE the actual
 * claim — it does NOT consume the claim.** The contract executes
 * `FHE.allow(handle, msg.sender)` and the SDK extracts the granted handle
 * from the receipt's ACL `Allowed` event. This is TokenOps' native
 * "verify/decrypt my allocation before spending the claim" primitive — the
 * spike proved the full order getClaimAmount → decrypt → claim live on
 * Sepolia (tx 0xc635b9…, then claim 0xd9790e…). Await the receipt (the SDK
 * does) before calling userDecrypt: the handle is only valid after the tx
 * lands.
 */
export async function grantDecryptAccess(args: {
  client: ConfidentialAirdropClient;
  encryptedInput: EncryptedInput;
  signature: Hex;
}): Promise<{ handle: Hex; hash: Hex }> {
  // FOOTGUN NOTE: `account` deliberately omitted → walletClient.account
  // (wagmi json-rpc Account → wallet extension signs). The Node spike had to
  // pass its full local Account object here; the browser must pass nothing.
  return args.client.getClaimAmount({
    encryptedInput: args.encryptedInput,
    signature: args.signature,
  });
}

/**
 * Decrypt an allocation handle client-side via the Zama relayer. Mirrors the
 * spike's `zama.allow([airdrop])` + `zama.userDecrypt([...])` — the plaintext
 * exists only in the recipient's browser memory. NEVER persist or log it.
 *
 * `allow` is a free one-time EIP-712 signature prompt (cached in IndexedDB by
 * the browser bundle, so repeat visits don't re-prompt). Pass the token
 * address in `alsoAllowContracts` to cover the post-claim balance decrypt
 * with the same single signature. `userDecrypt` is a free relayer HTTP call —
 * it only succeeds after {@link grantDecryptAccess}'s tx landed; otherwise
 * the relayer rejects with UserDecryptNotAllowedError.
 */
export async function decryptAllocationHandle(args: {
  /** From lib/tokenops/browser.ts getBrowserFheBundle().zama. */
  zama: ZamaSDK;
  /** Handle returned by grantDecryptAccess. */
  handle: Hex;
  airdropAddress: Address;
  /** e.g. [CTTT] so one signature also covers verifyPostClaimBalance. */
  alsoAllowContracts?: Address[];
}): Promise<bigint> {
  await args.zama.allow([args.airdropAddress, ...(args.alsoAllowContracts ?? [])]);
  const values = await args.zama.userDecrypt([
    { handle: args.handle, contractAddress: args.airdropAddress },
  ]);
  const value = values[args.handle];
  if (typeof value !== "bigint") {
    throw new Error(
      `Decrypted allocation is not a uint (got ${typeof value}) — the handle is not a euint64 allocation handle.`,
    );
  }
  return value;
}

/**
 * Submit the claim — mirrors the spike's `claim` step. Consumes the
 * single-use admin signature; the SDK auto-attaches `gasFee()` as
 * `msg.value` when `value` is omitted (prefetched in
 * {@link checkRecipientEligibility} for display). Paid write, 1 wallet prompt.
 */
export async function claimAllocation(args: {
  client: ConfidentialAirdropClient;
  encryptedInput: EncryptedInput;
  signature: Hex;
  /** Optional msg.value override; defaults to the clone's gasFee() fetched live. */
  value?: bigint;
}): Promise<Hex> {
  // FOOTGUN NOTE: `account` deliberately omitted (see module header) —
  // this exact call site is where the Node spike hit `unknown account`.
  return args.client.claim({
    encryptedInput: args.encryptedInput,
    signature: args.signature,
    value: args.value,
  });
}

/**
 * Post-claim verification — mirrors the spike's final step: decrypt the
 * recipient's confidential token balance via the ZamaSDK Token convenience
 * (wraps allow + userDecrypt internally; free if the earlier `allow` already
 * covered the token address). Proves the confidential transfer moved value,
 * not merely that the claim tx didn't revert.
 */
export async function verifyPostClaimBalance(args: {
  zama: ZamaSDK;
  /** ERC-7984 token the airdrop distributes (e.g. CTTT). */
  tokenAddress: Address;
  /** The recipient wallet to read; defaults to the connected signer. */
  owner?: Address;
}): Promise<bigint> {
  const token = args.zama.createToken(args.tokenAddress);
  return token.balanceOf(args.owner);
}
