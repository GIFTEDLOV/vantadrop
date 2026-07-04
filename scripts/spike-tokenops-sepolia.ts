/**
 * VantaDrop — minimal TokenOps SDK Sepolia proof spike.
 *
 * DO NOT RUN until you have:
 *   1. Created TWO burner Sepolia wallets (sender/admin + recipient) — NOT your main wallet.
 *   2. Funded both with a small amount of Sepolia ETH (a few cents worth is plenty; this
 *      spike mints its own test tokens, it doesn't need real value).
 *   3. Copied .env.example to .env.local and filled in the four variables.
 *   4. Confirmed .env.local is gitignored (it is, verified — see .gitignore).
 *
 * Run with: npm run spike   (== tsx scripts/spike-tokenops-sepolia.ts)
 *
 * Resume mode: if a prior run already completed mintConfidential (and/or setOperator),
 * set SPIKE_RESUME_AIRDROP_ONLY=true to skip the mint step (the CTTT address is fixed
 * per chain, so no mint is needed to resolve it). setOperator is always checked live via
 * `isOperator` first and skipped if already authorized, regardless of this flag — that
 * check is cheap and safe to run every time, resume mode or not.
 *   PowerShell: $env:SPIKE_RESUME_AIRDROP_ONLY="true"; npm run spike
 *
 * This script never logs private keys — only derived public addresses, tx hashes,
 * contract addresses, and (once decrypted) the plaintext allocation amount, which is
 * the entire point of the "recipient verifies their own allocation" step. On failure,
 * describeError() prints full diagnostic depth (name/message/code/context/shortMessage/
 * details/cause chain/util.inspect dump) but always redacts the two loaded private key
 * values by exact substring match before printing anything.
 *
 * ---------------------------------------------------------------------------
 * IMPORTANT — confirmed peer-version incompatibility (found via `tsc --noEmit`,
 * not guessed):
 *
 * @tokenops/sdk@1.1.1 declares a peer dependency on `@zama-fhe/sdk@^3.0.0`, and the
 * README's own quickstart matches @zama-fhe/sdk@3.0.0's shape. But `^3.0.0` also
 * resolves to the current latest, 3.2.0 — and 3.2.0 is NOT structurally compatible:
 *
 *   - @tokenops/sdk's `Encryptor.encrypt()` requires a return type of
 *     `{ handles: Uint8Array[], inputProof: Uint8Array }` (raw bytes).
 *   - @zama-fhe/sdk@3.0.0's `RelayerNode`/`RelayerWeb.encrypt()` returns exactly that
 *     shape — compatible.
 *   - @zama-fhe/sdk@3.2.0 changed `encrypt()` to return `{ encryptedValues: Hex[],
 *     inputProof: Hex }` (hex strings, renamed field) as part of a `createConfig()` /
 *     `relayers: {...}` config-object rework — NOT compatible with @tokenops/sdk@1.1.1.
 *
 * This was caught by running `npx tsc --noEmit` against this file with 3.2.0 installed:
 * TypeScript correctly refused to accept `zama.relayer` as an `Encryptor`. Verified by
 * reading node_modules/@zama-fhe/sdk's own .d.ts files for both versions directly —
 * not assumed.
 *
 * RESOLUTION: package.json pins `@zama-fhe/sdk` to the exact version `3.0.0` (not
 * `^3.0.0`) to prevent a future `npm install` from silently reintroducing this
 * break. This script is written against 3.0.0's real, verified API:
 *   - `RelayerNode` / `SepoliaConfig` from `@zama-fhe/sdk/node` (matches the
 *     @tokenops/sdk README's own documented pattern for this version).
 *   - `ViemSigner` from `@zama-fhe/sdk/viem`.
 *   - `ZamaSDK` (root) constructed as `new ZamaSDK({ relayer, signer })`.
 *   - `sdk.allow([contractAddress])` — one-time EIP-712 authorization (3.0.0's name
 *     for the "grant permit" step; later SDK versions renamed this `permits.grantPermit`).
 *   - `sdk.userDecrypt([{ handle, contractAddress }])` — the actual decrypt call.
 *   - `sdk.createToken(address).balanceOf(address)` — convenience for the post-claim
 *     balance check (wraps allow+decrypt internally).
 *
 * If you ever upgrade @tokenops/sdk and it declares a newer @zama-fhe/sdk peer range,
 * re-run `npx tsc --noEmit` before assuming this script (or the version pin) still
 * holds — don't just bump the version and guess.
 * ---------------------------------------------------------------------------
 */

import { existsSync } from "node:fs";
import util from "node:util";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { sepolia as viemSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

import { ZamaSDK, memoryStorage } from "@zama-fhe/sdk";
import { RelayerNode, SepoliaConfig } from "@zama-fhe/sdk/node";
import { ViemSigner } from "@zama-fhe/sdk/viem";

import { getFheAirdropFactoryAddress, isTokenOpsSdkError } from "@tokenops/sdk";
import { setOperator, erc7984OperatorAbi } from "@tokenops/sdk/fhe";
import { createTestnetFaucetClient } from "@tokenops/sdk/testnet-faucet";
import {
  createConfidentialAirdropFactoryClient,
  createConfidentialAirdropClient,
  encryptUint64,
  signClaimAuthorization,
} from "@tokenops/sdk/fhe-airdrop";

// ---------------------------------------------------------------------------
// 0. Env loading — prefer .env.local, fall back to .env. Never print values.
// ---------------------------------------------------------------------------

const envFile = existsSync(".env.local") ? ".env.local" : ".env";
const dotenv = await import("dotenv");
dotenv.config({ path: envFile });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env.local and fill it in ` +
        `(loaded from "${envFile}"). Refusing to continue with a placeholder.`,
    );
  }
  return value;
}

const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
const senderPrivateKey = requireEnv("SENDER_PRIVATE_KEY") as Hex;
const recipientPrivateKey = requireEnv("RECIPIENT_PRIVATE_KEY") as Hex;
const recipientAddressEnv = requireEnv("RECIPIENT_ADDRESS") as Address;

/**
 * When true: skip `mintConfidential` entirely (assumes the sender already
 * holds CTTT from a prior run — the CTTT proxy address is a fixed, pre-deployed
 * address per chain, not something that changes per mint, so no mint tx is
 * needed to resolve it). `setOperator` is checked-then-skipped via a live
 * `isOperator` read regardless of this flag, since that check is cheap and
 * safe to run every time.
 */
const resumeAirdropOnly = process.env.SPIKE_RESUME_AIRDROP_ONLY === "true";

// ---------------------------------------------------------------------------
// Helper: pretty-print a TokenOpsSdkError (or any error) in full diagnostic
// depth, without ever printing private keys.
//
// Safety net: whatever gets built below is passed through redactSecrets()
// before being returned, which does an exact (not pattern-based) substring
// replacement of the two loaded private key values. A regex like
// /0x[a-f0-9]{64}/ was deliberately NOT used for this — tx hashes, encrypted
// handles, and signatures are also 32/65-byte 0x-hex strings we WANT to show,
// and a blanket pattern would redact those too. Exact-match on the two known
// secret values is the only redaction that can't collide with legitimate data.
// ---------------------------------------------------------------------------

function redactSecrets(text: string): string {
  let out = text;
  for (const secret of [senderPrivateKey, recipientPrivateKey]) {
    if (secret) out = out.split(secret).join("[REDACTED_PRIVATE_KEY]");
  }
  return out;
}

/** Recursively format an error's `.cause` chain (viem/tokenops errors nest
 * a raw RPC/relayer error under `.cause`, which is where the actually useful
 * diagnostic detail usually lives). */
function formatCause(cause: unknown, depth = 0): string {
  const indent = "  ".repeat(depth + 1);
  if (cause === undefined || cause === null) return "";
  if (!(cause instanceof Error)) {
    return `${indent}cause (non-Error): ${util.inspect(cause, { depth: 8, colors: false })}`;
  }
  const anyCause = cause as Error & Record<string, unknown>;
  const lines: string[] = [
    `${indent}cause.name: ${anyCause.name}`,
    `${indent}cause.message: ${anyCause.message}`,
  ];
  if (typeof anyCause.shortMessage === "string") lines.push(`${indent}cause.shortMessage: ${anyCause.shortMessage}`);
  if (typeof anyCause.details === "string") lines.push(`${indent}cause.details: ${anyCause.details}`);
  if ("data" in anyCause && anyCause.data !== undefined) {
    lines.push(`${indent}cause.data: ${util.inspect(anyCause.data, { depth: 8, colors: false })}`);
  }
  if (Array.isArray(anyCause.metaMessages)) {
    lines.push(`${indent}cause.metaMessages:`);
    for (const m of anyCause.metaMessages as unknown[]) lines.push(`${indent}  ${String(m)}`);
  }
  if (typeof anyCause.stack === "string") {
    lines.push(`${indent}cause.stack:`);
    lines.push(anyCause.stack.split("\n").map((l) => `${indent}  ${l}`).join("\n"));
  }
  if (anyCause.cause) {
    lines.push(`${indent}--- nested cause ---`);
    lines.push(formatCause(anyCause.cause, depth + 1));
  }
  return lines.join("\n");
}

function describeError(err: unknown): string {
  const parts: string[] = [];

  if (err instanceof Error) {
    const anyErr = err as Error & Record<string, unknown>;
    parts.push(`name: ${anyErr.name}`);
    parts.push(`message: ${anyErr.message}`);
    if (isTokenOpsSdkError(err)) {
      parts.push(`code: ${err.code}`);
      parts.push(`context: ${JSON.stringify(err.context, null, 2)}`);
    }
    if (typeof anyErr.shortMessage === "string") parts.push(`shortMessage: ${anyErr.shortMessage}`);
    if (typeof anyErr.details === "string") parts.push(`details: ${anyErr.details}`);
    if (anyErr.cause) {
      parts.push(`cause:`);
      parts.push(formatCause(anyErr.cause));
    }
    parts.push(`--- full inspected error object (util.inspect, depth 8) ---`);
    parts.push(util.inspect(err, { depth: 8, colors: false }));
  } else {
    parts.push(`non-Error thrown: ${util.inspect(err, { depth: 8, colors: false })}`);
  }

  return redactSecrets(parts.join("\n"));
}

/** Build a ZamaSDK bound to one wallet. Permits/decryption are signer-specific,
 * so sender and recipient each need their own instance. */
function buildZamaSdk(publicClientArg: PublicClient, walletClientArg: WalletClient) {
  const relayer = new RelayerNode({
    transports: { [SepoliaConfig.chainId]: { ...SepoliaConfig, network: rpcUrl } },
    getChainId: async () => viemSepolia.id,
  });
  const signer = new ViemSigner({ publicClient: publicClientArg, walletClient: walletClientArg });
  return new ZamaSDK({ relayer, signer, storage: memoryStorage });
}

async function main() {
  console.log(`Loaded env from ${envFile}. (Private keys are never printed.)`);

  // -------------------------------------------------------------------------
  // a. Sender/admin setup
  // -------------------------------------------------------------------------
  const senderAccount = privateKeyToAccount(senderPrivateKey);
  const recipientAccount = privateKeyToAccount(recipientPrivateKey);

  if (recipientAccount.address.toLowerCase() !== recipientAddressEnv.toLowerCase()) {
    throw new Error(
      "RECIPIENT_ADDRESS does not match the address derived from RECIPIENT_PRIVATE_KEY. " +
        "Fix .env.local — these must be the same wallet.",
    );
  }

  console.log(`Sender/admin address:   ${senderAccount.address}`);
  console.log(`Recipient address:      ${recipientAccount.address}`);

  const publicClient = createPublicClient({ chain: viemSepolia, transport: http(rpcUrl) });

  const senderWalletClient = createWalletClient({
    account: senderAccount,
    chain: viemSepolia,
    transport: http(rpcUrl),
  });
  const recipientWalletClient = createWalletClient({
    account: recipientAccount,
    chain: viemSepolia,
    transport: http(rpcUrl),
  });

  const senderZama = buildZamaSdk(publicClient, senderWalletClient);
  const recipientZama = buildZamaSdk(publicClient, recipientWalletClient);

  try {
    const chainId = viemSepolia.id;

    const airdropFactoryAddress = getFheAirdropFactoryAddress(chainId);
    if (!airdropFactoryAddress) {
      throw new Error(
        `getFheAirdropFactoryAddress(${chainId}) returned undefined — TokenOps' airdrop ` +
          `factory does not resolve for this chain. This answers research question #1 ` +
          `("can we use TokenOps SDK on Sepolia") in the negative if it happens — stop here ` +
          `and report back rather than guessing an address.`,
      );
    }
    console.log(`Confidential airdrop factory (Sepolia): ${airdropFactoryAddress}`);

    // -----------------------------------------------------------------------
    // d. Testnet faucet — mint a distributable confidential token (CTTT).
    //    Answers research question #4 ("can we use the testnet faucet flow").
    //    Skipped under SPIKE_RESUME_AIRDROP_ONLY=true (sender already holds CTTT
    //    from a prior successful run).
    // -----------------------------------------------------------------------
    const faucet = createTestnetFaucetClient({ publicClient, walletClient: senderWalletClient });
    const cttTokenAddress = faucet.address; // CTTT proxy address — fixed per chain, no mint needed to resolve it.
    console.log(`  CTTT token address: ${cttTokenAddress}`);

    if (resumeAirdropOnly) {
      console.log(`SPIKE_RESUME_AIRDROP_ONLY=true — skipping mintConfidential (assuming sender already holds CTTT).`);
    } else {
      const mintAmount = 10_000_000n; // 10 CTTT at 6 decimals — small, disposable test amount.
      console.log(`Minting ${mintAmount} raw CTTT units to sender via testnet faucet...`);
      const mintResult = await faucet.mintConfidential({ amount: mintAmount });
      console.log(`  mintConfidential tx: ${mintResult.hash}`);
    }

    // -----------------------------------------------------------------------
    // b. Create and fund a confidential airdrop.
    //    Answers research question #2 ("can we create/interact with a confidential airdrop").
    // -----------------------------------------------------------------------
    console.log(`Checking whether airdrop factory is already an authorized operator on CTTT...`);
    const alreadyOperator = await publicClient.readContract({
      address: cttTokenAddress,
      abi: erc7984OperatorAbi,
      functionName: "isOperator",
      args: [senderAccount.address, airdropFactoryAddress],
    });
    if (alreadyOperator) {
      console.log(`  already authorized — skipping setOperator.`);
    } else {
      console.log(`Authorizing airdrop factory as ERC-7984 operator on CTTT...`);
      await setOperator({
        publicClient,
        walletClient: senderWalletClient,
        token: cttTokenAddress,
        spender: airdropFactoryAddress,
      });
      console.log(`  operator authorized.`);
    }

    const now = Math.floor(Date.now() / 1000);
    const airdropAmount = 1_000_000n; // 1 CTTT at 6 decimals for this one recipient.
    const userSalt = keccak256(stringToHex(`vantadrop-spike:${Date.now()}`));

    const factoryClient = createConfidentialAirdropFactoryClient({
      publicClient,
      walletClient: senderWalletClient,
      encryptor: senderZama.relayer,
    });

    console.log(`Creating and funding confidential airdrop clone...`);
    const created = await factoryClient.createAndFundConfidentialAirdrop({
      params: {
        token: cttTokenAddress,
        startTimestamp: now, // claim window open immediately for this spike
        endTimestamp: now + 7 * 86400,
        canExtendClaimWindow: false,
        admin: senderAccount.address,
      },
      userSalt,
      amount: airdropAmount,
      encryptor: senderZama.relayer,
      account: senderAccount,
    });
    console.log(`  createAndFundConfidentialAirdrop tx: ${created.hash}`);
    console.log(`  airdrop clone address: ${created.airdrop}`);

    // -----------------------------------------------------------------------
    // c. Sign/authorize the recipient's claim.
    // -----------------------------------------------------------------------
    console.log(`Encrypting recipient allocation (bound to recipient address)...`);
    const encryptedInput = await encryptUint64({
      encryptor: senderZama.relayer,
      contractAddress: created.airdrop,
      userAddress: recipientAccount.address,
      value: airdropAmount,
    });
    console.log(`  encrypted handle: ${encryptedInput.handle}`);

    console.log(`Admin signing claim authorization...`);
    const signature = await signClaimAuthorization({
      walletClient: senderWalletClient,
      airdropAddress: created.airdrop,
      recipient: recipientAccount.address,
      encryptedAmountHandle: encryptedInput.handle,
    });
    console.log(`  claim authorization signed.`);

    // -----------------------------------------------------------------------
    // d. Recipient checks allocation (preflight + signature validity).
    // -----------------------------------------------------------------------
    const recipientAirdropClient = createConfidentialAirdropClient({
      publicClient,
      walletClient: recipientWalletClient,
      address: created.airdrop,
    });

    console.log(`Recipient running preflightClaim...`);
    const preflight = await recipientAirdropClient.preflightClaim({
      caller: recipientAccount.address,
      encryptedAmountHandle: encryptedInput.handle,
    });
    console.log(`  preflight ready: ${preflight.ready}`);
    if (!preflight.ready) {
      for (const blocker of preflight.blockers) {
        console.log(`  blocker: ${describeError(blocker)}`);
      }
      throw new Error("Preflight reported the claim is not ready. Stopping before spending gas.");
    }

    console.log(`Recipient checking isSignatureValid...`);
    const validSignature = await recipientAirdropClient.isSignatureValid({
      encryptedAmountHandle: encryptedInput.handle,
      signature,
      caller: recipientAccount.address,
    });
    console.log(`  signature valid: ${validSignature}`);
    if (!validSignature) {
      throw new Error("Admin signature did not validate for this recipient/handle pair. Stopping.");
    }

    // -----------------------------------------------------------------------
    // e. Recipient decrypts/verifies their own allocation BEFORE claiming.
    //    Answers research question #3 ("can a recipient verify/decrypt their own
    //    allocation") — this is the bounty's headline requirement.
    // -----------------------------------------------------------------------
    console.log(`Recipient calling getClaimAmount (write tx — grants ACL decrypt access)...`);
    const claimAmountView = await recipientAirdropClient.getClaimAmount({
      encryptedInput,
      signature,
      account: recipientAccount,
    });
    console.log(`  getClaimAmount tx: ${claimAmountView.hash}`);
    console.log(`  granted handle: ${claimAmountView.handle}`);

    console.log(`Recipient authorizing decryption on the airdrop contract (one-time EIP-712 signature)...`);
    await recipientZama.allow([created.airdrop]);

    console.log(`Recipient decrypting their allocation handle...`);
    const decrypted = await recipientZama.userDecrypt([
      { handle: claimAmountView.handle, contractAddress: created.airdrop },
    ]);
    const decryptedAmount = decrypted[claimAmountView.handle];
    console.log(`  DECRYPTED ALLOCATION AMOUNT (raw units): ${decryptedAmount}`);
    if (decryptedAmount !== airdropAmount) {
      console.log(
        `  WARNING: decrypted amount (${decryptedAmount}) does not match the amount the ` +
          `admin encrypted (${airdropAmount}). Investigate before trusting this flow.`,
      );
    }

    // -----------------------------------------------------------------------
    // Recipient claims (consumes the signature).
    // -----------------------------------------------------------------------
    console.log(`Recipient submitting claim()...`);
    const claimHash = await recipientAirdropClient.claim({
      encryptedInput,
      signature,
      account: recipientAccount,
    });
    console.log(`  claim tx: ${claimHash}`);
    await publicClient.waitForTransactionReceipt({ hash: claimHash });
    console.log(`  claim confirmed.`);

    // -----------------------------------------------------------------------
    // Post-claim verification: re-read and decrypt the recipient's CTTT balance
    // via the ZamaSDK Token convenience (wraps allow + userDecrypt internally).
    // -----------------------------------------------------------------------
    console.log(`Recipient verifying post-claim CTTT balance...`);
    const recipientToken = recipientZama.createToken(cttTokenAddress);
    const balance = await recipientToken.balanceOf(recipientAccount.address);
    console.log(`  post-claim CTTT balance (raw units): ${balance}`);

    console.log("\n=== SPIKE SUMMARY ===");
    console.log(
      JSON.stringify(
        {
          airdropFactoryAddress,
          cttTokenAddress,
          airdropAddress: created.airdrop,
          createAndFundTx: created.hash,
          claimAmountViewTx: claimAmountView.hash,
          claimTx: claimHash,
          decryptedAllocation: decryptedAmount?.toString(),
          postClaimBalance: balance?.toString(),
        },
        null,
        2,
      ),
    );
  } catch (err) {
    console.error("\n=== SPIKE FAILED ===");
    console.error(describeError(err));
    process.exitCode = 1;
  } finally {
    senderZama.relayer.terminate?.();
    recipientZama.relayer.terminate?.();
  }
}

main();
