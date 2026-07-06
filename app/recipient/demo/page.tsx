import type { Metadata } from "next";
import { RecipientPortal } from "../../../components/RecipientPortal";

export const metadata: Metadata = {
  title: "Recipient Portal",
  description:
    "Claim your confidential token allocation after wallet discovery through VantaDrop's encrypted Claim Vault.",
};

export default function RecipientDemoPage() {
  return <RecipientPortal />;
}
