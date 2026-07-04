import { existsSync } from "node:fs";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

// NOTE: hardhat-toolbox-viem (not the classic @nomicfoundation/hardhat-toolbox) is
// used deliberately. Hardhat 3 split its toolbox into viem- and ethers-based
// variants; the classic `@nomicfoundation/hardhat-toolbox@latest` package installed
// via npm is a stub that refuses to run under Hardhat 3. This project already uses
// viem exclusively (see scripts/spike-tokenops-sepolia.ts), so hardhat-toolbox-viem
// is the consistent choice — no ethers.js dependency is introduced.

// Load .env.local (falling back to .env) so `configVariable(...)` below can resolve
// SEPOLIA_RPC_URL / SENDER_PRIVATE_KEY from process.env at task-run time. Reuses the
// same burner wallet already proven against Sepolia in scripts/spike-tokenops-sepolia.ts
// — never prints or logs the values.
const dotenv = await import("dotenv");
dotenv.config({ path: existsSync(".env.local") ? ".env.local" : ".env" });

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SENDER_PRIVATE_KEY")],
    },
  },
});
