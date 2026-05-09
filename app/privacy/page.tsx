import { LegalDocument } from "@/components/legal/LegalDocument";

export const metadata = {
  title: "Privacy Policy — Ash & Ember Society",
};

export default function PrivacyPage() {
  return <LegalDocument title="Privacy Policy" filename="privacy-policy.md" />;
}
