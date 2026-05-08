import { LegalDocument } from "@/components/legal/LegalDocument";

export const metadata = {
  title: "Terms of Service — Ash & Ember Society",
};

export default function TermsPage() {
  return <LegalDocument title="Terms of Service" filename="terms-of-service.md" />;
}
