import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/server-user";
import LandingPage from "@/components/landing/LandingPage";

export const metadata = {
  title: "Ash & Ember Society",
  description:
    "Track your humidor, log every smoke, discover cigars and local shops, and join a community of serious enthusiasts. Built for those who take their cigar experience seriously.",
  openGraph: {
    title: "Ash & Ember Society",
    description: "An exclusive digital sanctuary for the modern aficionado.",
    url: "https://ashember.vip",
    siteName: "Ash & Ember Society",
    images: [
      {
        url: "https://ashember.vip/og-image.png",
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
    description: "An exclusive digital sanctuary for the modern aficionado.",
    images: ["https://ashember.vip/og-image.png"],
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
