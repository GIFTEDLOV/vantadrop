import { NextResponse } from "next/server";
import {
  getClaimVaultStorageStatus,
  listPublicDrops,
} from "../../../lib/claimVault/store";

export const runtime = "nodejs";

export async function GET() {
  const storage = getClaimVaultStorageStatus();
  if (!storage.encryptedVaultConfigured) {
    return NextResponse.json({
      drops: [],
      storage,
      message: "Claim Vault is not configured in this environment.",
    });
  }

  const drops = await listPublicDrops();
  return NextResponse.json({ drops, storage });
}
