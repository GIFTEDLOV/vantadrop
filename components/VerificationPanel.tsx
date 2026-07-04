import {
  CTTT_TOKEN_ADDRESS,
  DEMO,
  REGISTRY_ADDRESS,
  TOKENOPS_AIRDROP_FACTORY,
  TOKENOPS_SDK_VERSION,
  TX,
  ZAMA_SDK_VERSION,
} from "../lib/constants";
import { AddressLink, Badge, Card, KeyValueRow, TxLink } from "./ui";

/**
 * Live Verification panel: every address and tx hash here is real, public
 * Sepolia data from the proven spike run (scripts/spike-tokenops-sepolia.ts).
 * Standalone at /verification and embedded on /drop/demo.
 */
export function VerificationPanel({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h3 className="mb-1 text-sm font-semibold text-white">Stack</h3>
        <p className="mb-3 text-[13px] text-zinc-500">
          What this distribution runs on — all pre-deployed, audited TokenOps infrastructure.
        </p>
        <KeyValueRow label="Network">Sepolia (chain id 11155111)</KeyValueRow>
        <KeyValueRow label="SDK">
          <span className="font-mono text-[13px]">
            {TOKENOPS_SDK_VERSION} · {ZAMA_SDK_VERSION}
          </span>
        </KeyValueRow>
        <KeyValueRow label="Token standard">ERC-7984 confidential token</KeyValueRow>
        <KeyValueRow label="Distribution type">Confidential Airdrop</KeyValueRow>
      </Card>

      <Card className="p-6">
        <h3 className="mb-1 text-sm font-semibold text-white">Contracts</h3>
        <p className="mb-3 text-[13px] text-zinc-500">
          Verify each address independently on Etherscan.
        </p>
        <KeyValueRow label="VantaDrop registry">
          <AddressLink address={REGISTRY_ADDRESS} />
        </KeyValueRow>
        <KeyValueRow label="TokenOps airdrop factory">
          <AddressLink address={TOKENOPS_AIRDROP_FACTORY} />
        </KeyValueRow>
        <KeyValueRow label="CTTT token (ERC-7984)">
          <AddressLink address={CTTT_TOKEN_ADDRESS} />
        </KeyValueRow>
        <KeyValueRow label="Demo airdrop clone">
          <AddressLink address={DEMO.airdropClone} />
        </KeyValueRow>
      </Card>

      <Card className="p-6">
        <div className="mb-1 flex items-center gap-3">
          <h3 className="text-sm font-semibold text-white">Proven on Sepolia</h3>
          <Badge tone="proven">Proven live</Badge>
        </div>
        <p className="mb-3 text-[13px] text-zinc-500">
          These four transactions were executed live against Sepolia by the end-to-end spike
          (scripts/spike-tokenops-sepolia.ts) — mint, create+fund, recipient self-decryption,
          and claim. Each hash is clickable and independently verifiable.
        </p>
        <KeyValueRow label="1 · Mint confidential CTTT (faucet)">
          <TxLink hash={TX.mintConfidential} />
        </KeyValueRow>
        <KeyValueRow label="2 · Create + fund confidential airdrop">
          <TxLink hash={TX.createAndFundConfidentialAirdrop} />
        </KeyValueRow>
        <KeyValueRow label="3 · getClaimAmount (recipient decrypt access)">
          <TxLink hash={TX.getClaimAmount} />
        </KeyValueRow>
        <KeyValueRow label="4 · Claim (confidential transfer)">
          <TxLink hash={TX.claim} />
        </KeyValueRow>
        {!compact && (
          <KeyValueRow label="Registry deployment">
            <TxLink hash={TX.registryDeploy} />
          </KeyValueRow>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="mb-3 text-sm font-semibold text-white">Capability status</h3>
        <KeyValueRow label="Recipient self-decryption of allocation">
          <Badge tone="proven">Proven live</Badge>
        </KeyValueRow>
        <KeyValueRow label="Claim (confidential value transfer)">
          <Badge tone="proven">Proven live</Badge>
        </KeyValueRow>
        <KeyValueRow label="Browser wallet connect + Sepolia detection">
          <Badge tone="neutral">Live in this UI</Badge>
        </KeyValueRow>
        <KeyValueRow label="Browser TokenOps execution from this UI">
          <Badge tone="pending">Wiring pending — next phase</Badge>
        </KeyValueRow>
      </Card>
    </div>
  );
}
