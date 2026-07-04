import type { Metadata } from "next";
import { CreateWizard } from "../../components/wizard/CreateWizard";

export const metadata: Metadata = {
  title: "Create Distribution",
  description:
    "Smart distribution wizard for confidential ERC-7984 token distributions on Sepolia.",
};

export default function CreatePage() {
  return <CreateWizard />;
}
