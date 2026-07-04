/**
 * Issuer-side service functions for the eventual `/create` execute flow.
 *
 * Each function mirrors one proven step of `scripts/spike-tokenops-sepolia.ts`
 * (the canonical, live-Sepolia-verified call sequence), translated to the
 * browser signing model per `docs/research/browser-tokenops-integration.md` §5:
 * same SDK functions, same argument shapes, wagmi-sourced viem clients instead
 * of private-key clients.
 *
 * NOT WIRED: nothing in this file is called from any page render path or
 * click handler in the current phase. These are real, typed, compile-checked
 * implementations awaiting the wiring phase — not stubs, but also not live.
 *
 * ========================== THE `account` FOOTGUN ==========================
 * Every TokenOps write accepts `account?: Account | Address` ("Defaults to
 * `walletClient.account`"). The Node spike broke on exactly this: passing a
 * bare address *string* makes viem dispatch `eth_sendTransaction`, which
 * keyless public RPCs reject with `unknown account` (the spike's
 * TOKENOPS_UNKNOWN_WRITE_FAILURE). In the browser the rule is simpler:
 *
 *   OMIT `account` ENTIRELY on every TokenOps write call.
 *
 * wagmi's connected `walletClient.account` is a json-rpc Account
 * (`{ address, type: "json-rpc" }`) over a `custom(window.ethereum)`
 * transport — with that account type viem intentionally routes
 * `eth_sendTransaction` to the wallet extension, which holds the key and
 * signs. That is the correct (and only possible) browser path, and the SDK's
 * documented default (`walletClient.account`) reaches it without our help.
 * Passing anything explicitly — especially an address string — only reopens
 * the string-vs-object footgun. Every call below carries a reminder.
 * ===========================================================================
 */

import { keccak256, stringToHex, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { setOperator, erc7984OperatorAbi } from "@tokenops/sdk/fhe";
import {
  createConfidentialAirdropFactoryClient,
  encryptUint64,
  signClaimAuthorization,
  type Encryptor,
  type EncryptedInput,
} from "@tokenops/sdk/fhe-airdrop";
import { SEPOLIA_CHAIN_ID, TOKENOPS_AIRDROP_FACTORY } from "../constants";

/** The connected wallet's account address, or a loud error if wagmi hasn't populated it yet. */
function requireConnectedAddress(walletClient: WalletClient): Address {
  const address = walletClient.account?.address;
  if (!address) {
    throw new Error(
      "walletClient has no account — wagmi briefly returns a client without an " +
        "account during reconnect. Gate calls on useWalletClient().data being " +
        "defined and connected before invoking issuer functions.",
    );
  }
  return address;
}

export interface EnsureOperatorResult {
  /** True when the factory was already an authorized operator — no tx sent. */
  alreadyOperator: boolean;
  /** setOperator tx hash, present only when a transaction was actually sent. */
  hash?: Hex;
}

/**
 * Ensure the TokenOps airdrop factory is an authorized ERC-7984 operator on
 * `token` for the connected issuer — the prerequisite for any fund path.
 *
 * Mirrors the spike exactly: free `isOperator` read first (cheap, safe to run
 * every time), then `setOperator` only if needed (1 wallet tx prompt).
 */
export async function ensureAirdropFactoryOperator(args: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  /** ERC-7984 token under distribution. */
  token: Address;
  /** Defaults to the pre-deployed Sepolia factory from lib/constants.ts. */
  factoryAddress?: Address;
}): Promise<EnsureOperatorResult> {
  const factory = args.factoryAddress ?? (TOKENOPS_AIRDROP_FACTORY as Address);
  const issuer = requireConnectedAddress(args.walletClient);

  const alreadyOperator = await args.publicClient.readContract({
    address: args.token,
    abi: erc7984OperatorAbi,
    functionName: "isOperator",
    args: [issuer, factory],
  });
  if (alreadyOperator) return { alreadyOperator: true };

  // FOOTGUN NOTE: `account` deliberately omitted → SDK falls back to
  // walletClient.account (wagmi's json-rpc Account → wallet extension signs).
  // Do NOT pass `account: issuer` — that's the address-string shape that
  // broke the Node spike with `unknown account`.
  const hash = await setOperator({
    publicClient: args.publicClient,
    walletClient: args.walletClient,
    token: args.token,
    spender: factory,
  });
  return { alreadyOperator: false, hash };
}

/** One recipient's allocation, plaintext, browser-memory only — never persisted or logged. */
export interface RecipientAllocation {
  recipient: Address;
  /** Raw token units (CTTT: 6 decimals). */
  amountRaw: bigint;
}

/** One recipient's encrypted allocation — safe to persist/transport (handle + proof only). */
export interface EncryptedAllocation {
  recipient: Address;
  encryptedInput: EncryptedInput;
}

/**
 * Encrypt each recipient's allocation, bound to that recipient's own address.
 *
 * Mirrors the spike's per-recipient `encryptUint64` loop. The proof is bound
 * to `(contractAddress, userAddress)` at encrypt time and the on-chain
 * `FHE.fromExternal` rejects any other binding — so `userAddress` MUST be the
 * recipient, not the issuer, and `encryptUint64Batch` cannot merge recipients
 * (one `userAddress` per proof). N recipients = N sequential relayer
 * round-trips (seconds each); `onProgress` exists so the wiring phase can
 * show real progress instead of freezing.
 *
 * Free (relayer HTTP + local WASM) — no wallet prompt, no gas.
 */
export async function encryptRecipientAllocations(args: {
  encryptor: Encryptor;
  /** The airdrop clone the allocations are being encrypted for. */
  airdropAddress: Address;
  allocations: RecipientAllocation[];
  onProgress?: (done: number, total: number) => void;
}): Promise<EncryptedAllocation[]> {
  const results: EncryptedAllocation[] = [];
  for (const [i, allocation] of args.allocations.entries()) {
    const encryptedInput = await encryptUint64({
      encryptor: args.encryptor,
      contractAddress: args.airdropAddress,
      userAddress: allocation.recipient, // MUST be the recipient (ACL binding rule)
      value: allocation.amountRaw,
    });
    results.push({ recipient: allocation.recipient, encryptedInput });
    args.onProgress?.(i + 1, args.allocations.length);
  }
  return results;
}

export interface CreateAndFundResult {
  /** Tx hash that deployed and funded the clone. */
  hash: Hex;
  /** Deployed airdrop clone address, parsed by the SDK from ConfidentialAirdropCreated. */
  airdrop: Address;
  /** The CREATE2 user salt used — persist it if the flow needs to resume. */
  userSalt: Hex;
}

/**
 * Deploy AND fund a confidential airdrop clone in one transaction (1 wallet
 * prompt). Mirrors the spike's `createAndFundConfidentialAirdrop` call.
 *
 * Prerequisite: {@link ensureAirdropFactoryOperator} must have succeeded for
 * this token/issuer pair first.
 */
export async function createAndFundAirdrop(args: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  encryptor: Encryptor;
  /** ERC-7984 token under distribution. */
  token: Address;
  /** Total pool to fund, raw token units (sum of all allocations). */
  totalAmountRaw: bigint;
  /** Claim window open (unix seconds). */
  startTimestamp: number;
  /** Claim window close (unix seconds). */
  endTimestamp: number;
  canExtendClaimWindow?: boolean;
  /** Resume support: reuse a prior salt instead of generating a fresh one. */
  userSalt?: Hex;
}): Promise<CreateAndFundResult> {
  const issuer = requireConnectedAddress(args.walletClient);
  const userSalt =
    args.userSalt ?? keccak256(stringToHex(`vantadrop:${crypto.randomUUID()}`));

  const factoryClient = createConfidentialAirdropFactoryClient({
    publicClient: args.publicClient,
    walletClient: args.walletClient,
    chainId: SEPOLIA_CHAIN_ID,
    encryptor: args.encryptor,
  });

  // FOOTGUN NOTE: `account` deliberately omitted → falls back to
  // walletClient.account. The Node spike had to pass the full local Account
  // object here (it had a raw private key); the browser has no local Account
  // and must not fake one — omission routes signing to the wallet extension.
  const created = await factoryClient.createAndFundConfidentialAirdrop({
    params: {
      token: args.token,
      startTimestamp: args.startTimestamp,
      endTimestamp: args.endTimestamp,
      canExtendClaimWindow: args.canExtendClaimWindow ?? false,
      admin: issuer,
    },
    userSalt,
    amount: args.totalAmountRaw,
    encryptor: args.encryptor,
  });

  return { hash: created.hash, airdrop: created.airdrop, userSalt };
}

/** The complete per-recipient claim payload the issuer delivers out-of-band. */
export interface ClaimPayload extends EncryptedAllocation {
  /** EIP-712 admin signature over Claim(recipient, encryptedAmountHandle). Single-use. */
  signature: Hex;
}

/**
 * Sign the EIP-712 claim authorization for each encrypted allocation.
 * Mirrors the spike's `signClaimAuthorization` step.
 *
 * Off-chain and free, but each signature is a separate wallet prompt — for N
 * recipients the issuer signs N times (real UX cost; the wiring phase should
 * say so up front, e.g. "you will sign N times").
 *
 * PRIVACY RULE: the resulting `{ encryptedInput, signature }` pairs are
 * delivered to recipients out-of-band. They must NEVER be written to
 * VantaDropRegistry or any log — see contracts/VantaDropRegistry.sol.
 */
export async function signRecipientClaims(args: {
  walletClient: WalletClient;
  airdropAddress: Address;
  allocations: EncryptedAllocation[];
  onProgress?: (done: number, total: number) => void;
}): Promise<ClaimPayload[]> {
  const payloads: ClaimPayload[] = [];
  for (const [i, allocation] of args.allocations.entries()) {
    // signClaimAuthorization signs with walletClient's own account (no
    // `account` arg exists on it) — the connected wallet must hold
    // DEFAULT_ADMIN_ROLE on the clone, which createAndFundAirdrop guarantees
    // by setting admin = the connected issuer.
    const signature = await signClaimAuthorization({
      walletClient: args.walletClient,
      airdropAddress: args.airdropAddress,
      recipient: allocation.recipient,
      encryptedAmountHandle: allocation.encryptedInput.handle,
    });
    payloads.push({ ...allocation, signature });
    args.onProgress?.(i + 1, args.allocations.length);
  }
  return payloads;
}
