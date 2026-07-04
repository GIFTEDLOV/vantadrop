import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { defineConfig } from "hardhat/config";

// NOTE: hardhat-toolbox-viem (not the classic @nomicfoundation/hardhat-toolbox) is
// used deliberately. Hardhat 3 split its toolbox into viem- and ethers-based
// variants; the classic `@nomicfoundation/hardhat-toolbox@latest` package installed
// via npm is a stub that refuses to run under Hardhat 3. This project already uses
// viem exclusively (see scripts/spike-tokenops-sepolia.ts), so hardhat-toolbox-viem
// is the consistent choice — no ethers.js dependency is introduced.
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
  },
});
