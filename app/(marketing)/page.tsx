import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/server-user";
import LandingPage from "@/components/landing/LandingPage";

export const runtime = "edge";

export const metadata = {
  title: "Ash & Ember Society · A Society Journal of Smoke & Patience",
  description:
    "An exclusive digital sanctuary for the modern aficionado. Track your collection, refine your palate, and connect with a society of discerning enthusiasts.",
  openGraph: {
    title: "Ash & Ember Society",
    description:
      "An exclusive digital sanctuary for the modern aficionado. Track your collection, refine your palate, and connect with a society of discerning enthusiasts.",
    /* All metadata URLs use the www canonical host. Bare-host links
       drift the PWA out of its manifest scope on iOS resume and
       trigger an in-app browser fallback. */
    url: "https://www.ashember.vip",
    siteName: "Ash & Ember Society",
    images: [
      {
        url: "https://www.ashember.vip/og-image.png",
        width: 1200,
        height: 632,
        alt: "Ash & Ember Society",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ash & Ember Society",
    description:
      "An exclusive digital sanctuary for the modern aficionado. Track your collection, refine your palate, and connect with a society of discerning enthusiasts.",
    images: ["https://www.ashember.vip/og-image.png"],
  },
};

export default async function MarketingPage() {
  const user = await getServerUser();

  // Authenticated users with completed onboarding go straight to the app.
  if (user) {
    redirect(user.onboardingCompleted ? "/home" : "/onboarding");
  }

  return <LandingPage />;
}
