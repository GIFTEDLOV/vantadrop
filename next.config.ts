import type { NextConfig } from "next";

/**
 * VantaDrop frontend config.
 *
 * `typescript.tsconfigPath` is load-bearing: the root `tsconfig.json` is owned by
 * the pre-existing Node spike script (`scripts/spike-tokenops-sepolia.ts`) and is
 * scoped to `scripts/**` with NodeNext resolution and `"types": []`. Next.js must
 * NOT rewrite or type-check against that file, so the app gets its own dedicated
 * `tsconfig.next.json`. Verified against the installed Next version (16.x), which
 * supports `typescript.tsconfigPath` (see node_modules/next/dist/server/config-shared.d.ts).
 */
const nextConfig: NextConfig = {
  typescript: {
    tsconfigPath: "tsconfig.next.json",
  },
};

export default nextConfig;
