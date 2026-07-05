import type { Metadata } from "next";
import { RecipientPortal } from "../../../components/RecipientPortal";

export const metadata: Metadata = {
  title: "Recipient Portal",
  description:
    "Claim your confidential token allocation: import the claim package your sender shared privately, check eligibility, decrypt your own amount, and claim — all on Sepolia.",
};

export default function RecipientDemoPage() {
  return <RecipientPortal />;
}
