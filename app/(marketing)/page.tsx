import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import LandingPage from "@/components/landing/LandingPage";

export const metadata = {
  title: "Ash & Ember Society — The Premium Cigar Enthusiast App",
  description:
    "Track your humidor, log every smoke, discover cigars and local shops, and join a community of serious enthusiasts. Built for those who take their cigar experience seriously.",
};

export default async function MarketingPage() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Read-only in server component — no-op
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Authenticated users with completed onboarding go straight to the app
  if (user) {
    const onboardingComplete = Boolean(
      (user.user_metadata as Record<string, unknown>)?.onboarding_completed
    );
    redirect(onboardingComplete ? "/home" : "/onboarding");
  }

  return <LandingPage />;
}
