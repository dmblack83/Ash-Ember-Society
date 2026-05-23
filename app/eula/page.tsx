import { LegalDocument } from "@/components/legal/LegalDocument";

export const metadata = {
  title: "End User License Agreement — Ash & Ember Society",
};

export default function EulaPage() {
  return <LegalDocument title="End User License Agreement" filename="eula.md" />;
}
