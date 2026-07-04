/**
 * VantaDrop — burner wallet generator for the TokenOps Sepolia runtime spike.
 *
 * Generates two fresh, disposable private keys (sender/admin + recipient) and writes
 * them into .env.local alongside a SEPOLIA_RPC_URL placeholder. NEVER overwrites an
 * existing .env.local without an explicit --force flag, and NEVER prints private keys
 * to the terminal — only the derived public addresses.
 *
 * These are burner wallets for a testnet spike. Do not fund them with anything beyond
 * a small amount of Sepolia ETH, and do not reuse them for anything else.
 *
 * Run with: npx tsx scripts/create-burner-wallets.ts
 * Overwrite an existing .env.local with: npx tsx scripts/create-burner-wallets.ts --force
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ENV_LOCAL_PATH = ".env.local";
const ENV_EXAMPLE_PATH = ".env.example";
const DEFAULT_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

const force = process.argv.includes("--force");

function fail(message: string): never {
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}

if (existsSync(ENV_LOCAL_PATH) && !force) {
  fail(
    `${ENV_LOCAL_PATH} already exists. Refusing to overwrite it.\n` +
      `Re-run with --force if you deliberately want to replace it (this will discard ` +
      `whatever keys/values are currently in there).`,
  );
}

// Preserve any keys already present in .env.example / .env.local that this script
// doesn't own, so we don't clobber unrelated config if the file grows later.
const existingLines: Record<string, string> = {};
for (const path of [ENV_EXAMPLE_PATH, ENV_LOCAL_PATH]) {
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) existingLines[match[1]] = match[2];
  }
}

const senderPrivateKey = generatePrivateKey();
const recipientPrivateKey = generatePrivateKey();
const senderAccount = privateKeyToAccount(senderPrivateKey);
const recipientAccount = privateKeyToAccount(recipientPrivateKey);

const rpcUrl = existingLines.SEPOLIA_RPC_URL?.trim() || DEFAULT_RPC_URL;
const rpcUrlIsPlaceholder = !existingLines.SEPOLIA_RPC_URL?.trim();

const envContent = [
  `SEPOLIA_RPC_URL=${rpcUrl}`,
  `SENDER_PRIVATE_KEY=${senderPrivateKey}`,
  `RECIPIENT_PRIVATE_KEY=${recipientPrivateKey}`,
  `RECIPIENT_ADDRESS=${recipientAccount.address}`,
  "",
].join("\n");

writeFileSync(ENV_LOCAL_PATH, envContent, { mode: 0o600 });

// Only public information below. Never log senderPrivateKey / recipientPrivateKey /
// envContent.
console.log("Burner wallets generated and written to .env.local.\n");
console.log(`Sender/admin address:   ${senderAccount.address}`);
console.log(`Recipient address:      ${recipientAccount.address}`);
console.log(
  rpcUrlIsPlaceholder
    ? `SEPOLIA_RPC_URL: no value was previously set — defaulted to a public endpoint (${rpcUrl}). Replace with a private RPC if you hit rate limits.`
    : `SEPOLIA_RPC_URL: kept existing value (${rpcUrl}).`,
);
console.log("\nPrivate keys were written to .env.local but were never printed to this terminal.");
