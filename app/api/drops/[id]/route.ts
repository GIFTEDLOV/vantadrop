import { NextResponse } from "next/server";
import {
  getClaimVaultStorageStatus,
  getPublicDrop,
} from "../../../../lib/claimVault/store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const storage = getClaimVaultStorageStatus();
  if (!storage.encryptedVaultConfigured) {
    return NextResponse.json(
      {
        error: "Claim Vault is not configured in this environment.",
        storage,
      },
      { status: 503 },
    );
  }

  const drop = await getPublicDrop(id);
  if (!drop) {
    return NextResponse.json({ error: "Drop not found." }, { status: 404 });
  }
  return NextResponse.json({ drop, storage });
}
