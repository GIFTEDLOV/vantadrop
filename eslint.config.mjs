import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * ESLint is scoped to the Next.js app surface only (app/, components/, lib/,
 * next.config.ts — see the `lint` npm script). The pre-existing Hardhat/spike
 * files (scripts/, test/, hardhat.config.ts) are deliberately excluded: they
 * predate this config and are validated by `npx tsc --noEmit` + `npx hardhat test`.
 */
export default defineConfig([
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "artifacts/**",
    "cache/**",
    "scripts/**",
    "test/**",
    "hardhat.config.ts",
    "next-env.d.ts",
  ]),
  ...nextCoreWebVitals,
  ...nextTypescript,
]);
