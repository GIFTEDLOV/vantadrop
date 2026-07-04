/**
 * Single source of truth for every public on-chain constant the frontend uses.
 *
 * Everything here is PUBLIC data (addresses, tx hashes, chain id) — safe to ship
 * client-side. Values can be overridden via NEXT_PUBLIC_* env vars but fall back
 * to the real, verified values from the proven Sepolia spike run, so the app
 * works out of the box with zero env setup.
 *
 * NEVER add private keys or any non-NEXT_PUBLIC_ env var to this file.
 */

export const SEPOLIA_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_SEPOLIA_CHAIN_ID ?? "11155111",
);

/** VantaDropRegistry — thin, public-metadata-only registry (deployed, immutable). */
export const REGISTRY_ADDRESS =
  process.env.NEXT_PUBLIC_VANTADROP_REGISTRY_ADDRESS ??
  "0x2a3dd1dff5c121b1fc24c7412e519c075bc5f8a1";

/** TokenOps ConfidentialAirdropFactory on Sepolia (audited, pre-deployed by TokenOps). */
export const TOKENOPS_AIRDROP_FACTORY =
  process.env.NEXT_PUBLIC_TOKENOPS_AIRDROP_FACTORY ??
  "0xbE6A3B78B36684fFee48De77d47Bc3393F5Acd4c";

/** CTTT — TokenOps confidential test token (ERC-7984) on Sepolia. */
export const CTTT_TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_CTTT_TOKEN_ADDRESS ??
  "0x258F9D60dc023870e4E3109c894D834D5377361a";

export const CTTT_DECIMALS = 6;
export const CTTT_SYMBOL = "CTTT";

/** SDK versions actually installed and proven in scripts/spike-tokenops-sepolia.ts. */
export const TOKENOPS_SDK_VERSION = "@tokenops/sdk@1.1.1";
export const ZAMA_SDK_VERSION = "@zama-fhe/sdk@3.0.0";

/** The demo distribution proven live on Sepolia via scripts/spike-tokenops-sepolia.ts. */
export const DEMO = {
  /** ConfidentialAirdropCloneable clone created by the proven spike run. */
  airdropClone: "0x8cFE4cab5A3ca843B94B1A4765D6DA780547ee14",
  /** Burner sender/admin wallet used in the proven spike run. */
  sender: "0x3773537741fADe12d2081e7602d56Bc003b69C60",
  /** Burner recipient wallet used in the proven spike run. */
  recipient: "0x459dCE6958Ac3DC171FE4B51a8a12EafF57C165A",
  /** Allocation the recipient decrypted, in raw units (CTTT has 6 decimals). */
  decryptedAllocationRaw: "1000000",
  /** Same allocation, human units. */
  decryptedAllocationFormatted: "1.0 CTTT",
  /** The proven demo has exactly one recipient — stated honestly, never inflated. */
  recipientCount: 1,
} as const;

/** Real Sepolia transaction hashes from the proven spike run. */
export const TX = {
  mintConfidential:
    "0x2e4b4d06a232770a5db5de15094ae76ff9b0df4f3f48542ee915dc403153ad69",
  createAndFundConfidentialAirdrop:
    "0x7ec47177768fad44fc975a7d79b1c58b2fb18c45828acf573d42b08d8d744578",
  getClaimAmount:
    "0xc635b966543fe1226f27bced74a3016046b773e554a98a407cdbd73fac6c48c0",
  claim: "0xd9790e674fea8394b3ad8378aadb6aceff069ebcc6916cc72831550529d70f24",
  registryDeploy:
    "0xf60cb789dc0119a9ea69fe267871788d68b0d47014c7b342356ed6f236a49c0c",
} as const;

const ETHERSCAN_BASE = "https://sepolia.etherscan.io";

export function etherscanAddress(address: string): string {
  return `${ETHERSCAN_BASE}/address/${address}`;
}

export function etherscanTx(hash: string): string {
  return `${ETHERSCAN_BASE}/tx/${hash}`;
}

export function shortHex(value: string, chars = 6): string {
  if (value.length <= 2 + chars * 2) return value;
  return `${value.slice(0, 2 + chars)}…${value.slice(-4)}`;
}
