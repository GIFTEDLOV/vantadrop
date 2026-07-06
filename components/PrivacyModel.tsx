import { PrivacyPanel } from "./PrivacyPanel";

/**
 * Backward-compatible wrapper for pages that already import PrivacyModel.
 * PrivacyPanel is the shared visual primitive used by redesigned pages.
 */
export function PrivacyModel() {
  return <PrivacyPanel />;
}
