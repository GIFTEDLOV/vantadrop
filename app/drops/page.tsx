import type { Metadata } from "next";
import { DropsDashboard } from "../../components/DropsDashboard";

export const metadata: Metadata = {
  title: "Drops",
  description:
    "Connect your wallet to privately check eligible VantaDrop claim packages through the encrypted Claim Vault.",
};

export default function DropsPage() {
  return <DropsDashboard />;
}
