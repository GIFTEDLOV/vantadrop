import type { Metadata } from "next";
import { RecipientPortal } from "../../../components/RecipientPortal";

export const metadata: Metadata = {
  title: "Recipient Portal — Demo",
  description:
    "Walk through the recipient flow of the proven Sepolia demo: check eligibility, decrypt your own allocation, claim.",
};

export default function RecipientDemoPage() {
  return <RecipientPortal />;
}
