/**
 * Typed read/write wrappers around the deployed VantaDropRegistry
 * (Sepolia, 0x2a3dd1…f8a1 — see lib/constants.ts). Plain viem calls, no FHE,
 * no TokenOps SDK involvement — the registry stores public metadata only.
 *
 * PRIVACY RULE (from contracts/VantaDropRegistry.sol): the registry never
 * stores recipient lists, amounts, encrypted handles, or signatures — only
 * token/clone addresses, title/use-case strings, a recipient COUNT, and a
 * status byte. Nothing in this file may widen that.
 *
 * Reads are free and safe from anywhere. WRITES ARE NOT WIRED to any UI in
 * this phase — `registerDistribution` / `updateStatus` exist for the future
 * issuer flow (research doc §5 step 8) but no click path calls them.
 */

import { parseEventLogs, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { REGISTRY_ADDRESS } from "../constants";
import { vantaDropRegistryAbi } from "./abi";

const registryAddress = REGISTRY_ADDRESS as Address;

/** The on-chain Distribution struct, as returned by getDistribution. */
export interface Distribution {
  id: bigint;
  sender: Address;
  token: Address;
  tokenOpsAirdrop: Address;
  title: string;
  useCase: string;
  recipientCount: bigint;
  createdAt: bigint;
  status: number;
  metadataURI: string;
}

/**
 * Status byte conventions for updateStatus. The contract stores an opaque
 * uint8 (registerDistribution always writes 0); these values are this
 * frontend's convention, not an on-chain enum.
 */
export const DISTRIBUTION_STATUS = {
  active: 0,
  completed: 1,
  cancelled: 2,
} as const;

/**
 * Read one distribution by id. Reverts `DistributionNotFound` for unknown
 * ids — surface as "not found" in UI, not as an unexpected error toast.
 */
export async function readDistribution(
  publicClient: PublicClient,
  distributionId: bigint,
): Promise<Distribution> {
  const d = await publicClient.readContract({
    address: registryAddress,
    abi: vantaDropRegistryAbi,
    functionName: "getDistribution",
    args: [distributionId],
  });
  // viem returns the tuple as a typed object matching the struct fields.
  return { ...d, status: Number(d.status) };
}

/** Read all distribution ids ever registered by `sender`. */
export async function readSenderDistributions(
  publicClient: PublicClient,
  sender: Address,
): Promise<readonly bigint[]> {
  return publicClient.readContract({
    address: registryAddress,
    abi: vantaDropRegistryAbi,
    functionName: "getSenderDistributions",
    args: [sender],
  });
}

/**
 * Total number of registered distributions. Useful for a future "browse
 * distributions" view (ids are sequential from 1). Verified live during this
 * phase: currently returns 0 — the proven demo airdrop predates registry
 * frontend wiring and was never registered.
 */
export async function readTotalDistributions(
  publicClient: PublicClient,
): Promise<bigint> {
  return publicClient.readContract({
    address: registryAddress,
    abi: vantaDropRegistryAbi,
    functionName: "totalDistributions",
  });
}

/** Everything registerDistribution stores — public metadata only, by design. */
export interface RegisterDistributionArgs {
  /** ERC-7984 token under distribution. */
  token: Address;
  /** TokenOps airdrop clone address returned by createAndFundAirdrop. */
  tokenOpsAirdrop: Address;
  title: string;
  useCase: string;
  /** COUNT only — never the recipient list itself. */
  recipientCount: bigint;
  /** Optional off-chain metadata pointer; pass "" for none. */
  metadataURI: string;
}

/**
 * Register a distribution's public metadata (NOT WIRED to any UI yet).
 * One wallet tx prompt. Waits for the receipt and parses the new id from the
 * DistributionRegistered event, mirroring how the TokenOps SDK returns
 * receipt-parsed results.
 *
 * Same account discipline as the TokenOps calls: the connected wagmi
 * walletClient's own account object is passed through — never a bare address
 * string (the eth_sendTransaction-vs-eth_sendRawTransaction footgun from the
 * Node spike; in the browser the json-rpc account routes to the extension).
 */
export async function writeRegisterDistribution(args: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  distribution: RegisterDistributionArgs;
}): Promise<{ hash: Hex; id: bigint }> {
  const account = args.walletClient.account;
  if (!account) {
    throw new Error(
      "walletClient has no account — gate on wagmi's useWalletClient().data before writing.",
    );
  }
  const { token, tokenOpsAirdrop, title, useCase, recipientCount, metadataURI } =
    args.distribution;

  const hash = await args.walletClient.writeContract({
    address: registryAddress,
    abi: vantaDropRegistryAbi,
    functionName: "registerDistribution",
    args: [token, tokenOpsAirdrop, title, useCase, recipientCount, metadataURI],
    account, // full wagmi account object — never account.address
    chain: args.walletClient.chain,
  });

  const receipt = await args.publicClient.waitForTransactionReceipt({ hash });
  const [registered] = parseEventLogs({
    abi: vantaDropRegistryAbi,
    eventName: "DistributionRegistered",
    logs: receipt.logs,
  });
  if (!registered) {
    throw new Error(
      `registerDistribution tx ${hash} confirmed but no DistributionRegistered event was found in the receipt.`,
    );
  }
  return { hash, id: registered.args.id };
}

/**
 * Update a distribution's public status byte (NOT WIRED to any UI yet).
 * Only the original sender may call — anyone else reverts NotOriginalSender.
 */
export async function writeUpdateStatus(args: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  distributionId: bigint;
  /** See DISTRIBUTION_STATUS for this frontend's convention. */
  status: number;
}): Promise<Hex> {
  const account = args.walletClient.account;
  if (!account) {
    throw new Error(
      "walletClient has no account — gate on wagmi's useWalletClient().data before writing.",
    );
  }
  const hash = await args.walletClient.writeContract({
    address: registryAddress,
    abi: vantaDropRegistryAbi,
    functionName: "updateStatus",
    args: [args.distributionId, args.status],
    account, // full wagmi account object — never account.address
    chain: args.walletClient.chain,
  });
  await args.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
