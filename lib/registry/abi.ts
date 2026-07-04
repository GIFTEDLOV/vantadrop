/**
 * VantaDropRegistry ABI — deployed at 0x2a3dd1dff5c121b1fc24c7412e519c075bc5f8a1 (Sepolia).
 *
 * Copied verbatim from the local Hardhat build artifact
 * (`artifacts/contracts/VantaDropRegistry.sol/VantaDropRegistry.json`, which is
 * gitignored build output) and cross-checked against the actual contract source
 * in `contracts/VantaDropRegistry.sol`. The contract is deployed and immutable,
 * so this ABI is stable; if the contract source ever changes (it should not —
 * see the PRIVACY RULES comment in the .sol file), regenerate via
 * `npx hardhat compile` and re-copy.
 *
 * This file is inert data — no imports, no calls, no side effects. `as const`
 * gives viem/wagmi full type inference for function names, args, and return
 * types.
 */
export const vantaDropRegistryAbi = [
  { inputs: [], name: "DistributionNotFound", type: "error" },
  { inputs: [], name: "EmptyTitle", type: "error" },
  { inputs: [], name: "EmptyUseCase", type: "error" },
  { inputs: [], name: "InvalidRecipientCount", type: "error" },
  { inputs: [], name: "NotOriginalSender", type: "error" },
  { inputs: [], name: "ZeroAddress", type: "error" },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "id", type: "uint256" },
      { indexed: true, internalType: "address", name: "sender", type: "address" },
      { indexed: true, internalType: "address", name: "token", type: "address" },
      { indexed: false, internalType: "address", name: "tokenOpsAirdrop", type: "address" },
      { indexed: false, internalType: "string", name: "title", type: "string" },
      { indexed: false, internalType: "string", name: "useCase", type: "string" },
      { indexed: false, internalType: "uint256", name: "recipientCount", type: "uint256" },
    ],
    name: "DistributionRegistered",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "id", type: "uint256" },
      { indexed: false, internalType: "uint8", name: "status", type: "uint8" },
    ],
    name: "DistributionStatusUpdated",
    type: "event",
  },
  {
    inputs: [{ internalType: "uint256", name: "distributionId", type: "uint256" }],
    name: "getDistribution",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "id", type: "uint256" },
          { internalType: "address", name: "sender", type: "address" },
          { internalType: "address", name: "token", type: "address" },
          { internalType: "address", name: "tokenOpsAirdrop", type: "address" },
          { internalType: "string", name: "title", type: "string" },
          { internalType: "string", name: "useCase", type: "string" },
          { internalType: "uint256", name: "recipientCount", type: "uint256" },
          { internalType: "uint64", name: "createdAt", type: "uint64" },
          { internalType: "uint8", name: "status", type: "uint8" },
          { internalType: "string", name: "metadataURI", type: "string" },
        ],
        internalType: "struct VantaDropRegistry.Distribution",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "sender", type: "address" }],
    name: "getSenderDistributions",
    outputs: [{ internalType: "uint256[]", name: "", type: "uint256[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "address", name: "tokenOpsAirdrop", type: "address" },
      { internalType: "string", name: "title", type: "string" },
      { internalType: "string", name: "useCase", type: "string" },
      { internalType: "uint256", name: "recipientCount", type: "uint256" },
      { internalType: "string", name: "metadataURI", type: "string" },
    ],
    name: "registerDistribution",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "totalDistributions",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "distributionId", type: "uint256" },
      { internalType: "uint8", name: "status", type: "uint8" },
    ],
    name: "updateStatus",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
