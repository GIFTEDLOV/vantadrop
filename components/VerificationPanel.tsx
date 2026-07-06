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
 * Live verification panel: every address and tx hash here is public Sepolia
 * data from the proven VantaDrop flow.
 */
export function VerificationPanel({ compact = false }: { compact?: boolean }) {
  return (
    <div className="grid gap-4">
      <Card className="p-6">
        <h3 className="mb-1 text-sm font-semibold text-white">Stack</h3>
        <p className="mb-3 text-[13px] text-zinc-500">
          Pre-deployed TokenOps infrastructure plus the pinned Zama browser SDK.
        </p>
        <KeyValueRow label="Network">Sepolia (chain id 11155111)</KeyValueRow>
        <KeyValueRow label="TokenOps SDK">
          <span className="font-mono text-[13px]">{TOKENOPS_SDK_VERSION}</span>
        </KeyValueRow>
        <KeyValueRow label="Zama FHE SDK">
          <span className="font-mono text-[13px]">{ZAMA_SDK_VERSION}</span>
        </KeyValueRow>
        <KeyValueRow label="Token standard">ERC-7984 confidential token</KeyValueRow>
        <KeyValueRow label="Distribution type">Confidential Airdrop</KeyValueRow>
      </Card>

      <Card className="p-6">
        <h3 className="mb-1 text-sm font-semibold text-white">Contracts</h3>
        <p className="mb-3 text-[13px] text-zinc-500">
          Verify each public address independently on Etherscan.
        </p>
        <KeyValueRow label="VantaDropRegistry">
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
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold text-white">Proven on Sepolia</h3>
          <Badge tone="proven">Proven live</Badge>
        </div>
        <p className="mb-3 text-[13px] text-zinc-500">
          These links are real Sepolia records: mint, create and fund, recipient
          decrypt access, claim, and registry deployment.
        </p>
        <KeyValueRow label="1. Mint confidential CTTT">
          <TxLink hash={TX.mintConfidential} />
        </KeyValueRow>
        <KeyValueRow label="2. Create + fund confidential airdrop">
          <TxLink hash={TX.createAndFundConfidentialAirdrop} />
        </KeyValueRow>
        <KeyValueRow label="3. getClaimAmount decrypt access">
          <TxLink hash={TX.getClaimAmount} />
        </KeyValueRow>
        <KeyValueRow label="4. Claim confidential transfer">
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
        <KeyValueRow label="Browser issuer flow (/create)">
          <Badge tone="proven">Proven live</Badge>
        </KeyValueRow>
        <KeyValueRow label="Browser recipient decrypt/claim">
          <Badge tone="proven">Proven live</Badge>
        </KeyValueRow>
        <KeyValueRow label="Public recipient portal (/recipient/demo)">
          <Badge tone="proven">Proven live</Badge>
        </KeyValueRow>
        <KeyValueRow label="Paychain-style Claim Vault discovery">
          <Badge tone="demo">Productized path</Badge>
        </KeyValueRow>
        <KeyValueRow label="VantaDropRegistry frontend writes">
          <Badge tone="proven">Proven live</Badge>
        </KeyValueRow>
      </Card>
    </div>
  );
}
