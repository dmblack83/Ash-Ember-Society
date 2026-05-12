import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

/* Force dynamic rendering. This page is auth-gated by proxy.ts; if
   Next prerenders it at build time, unauthenticated fetches (e.g.,
   Serwist's precache crawler) get a 307 redirect to /login and break
   downstream consumers of the prerender manifest. See #365 for the
   incident. The actual form is a client component (OnboardingForm)
   because Supabase auth + file upload + form state all live on the
   client; this page is a server-rendered shell around it. */
export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return <OnboardingForm />;
}
