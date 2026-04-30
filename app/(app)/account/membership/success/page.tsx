import { createClient }  from "@/utils/supabase/server";
import { getServerUser } from "@/lib/auth/server-user";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getMembershipTier, TIER_DISPLAY } from "@/lib/membership";
import { SuccessConfetti } from "@/components/membership/SuccessConfetti";

export const metadata = {
  title: "Welcome — Ash & Ember Society",
};

const UNLOCKED: Record<string, string[]> = {
  member: [
    "Unlimited humidor items",
    "Post to the community feed",
    "Share burn reports publicly",
    "10% discount at partner shops",
    "Event RSVPs",
    "Digital membership card",
  ],
  premium: [
    "Unlimited humidor items",
    "Post to the community feed",
    "15% discount at partner shops",
    "Exclusive event access",
    "Digital membership card",
    "Advanced analytics (coming soon)",
    "Premium badge on profile",
  ],
};

export default async function MembershipSuccessPage() {
  const supabase = await createClient();
  const user     = await getServerUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("membership_tier, badge, display_name")
    .eq("id", user.id)
    .single();

  const tier     = getMembershipTier(profile);
  const tierInfo = TIER_DISPLAY[tier];
  const features = tier !== "free" ? UNLOCKED[tier] ?? [] : [];
  const isPremium = tier === "premium";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">

      {/* Confetti — fires on mount, no SSR */}
      <SuccessConfetti />

      <div className="max-w-md w-full text-center space-y-8 animate-fade-in">

        {/* Animated emblem */}
        <div className="flex justify-center">
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center ${isPremium ? "glow-gold" : "glow-ember"}`}
            style={{
              background: isPremium
                ? "radial-gradient(circle, rgba(212,160,74,0.15) 0%, rgba(212,160,74,0.04) 100%)"
                : "radial-gradient(circle, rgba(193,120,23,0.15) 0%, rgba(193,120,23,0.04) 100%)",
              border: `1px solid ${isPremium ? "rgba(212,160,74,0.35)" : "rgba(193,120,23,0.35)"}`,
            }}
          >
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <path
                d="M7 18L14.5 25.5L29 10"
                stroke={isPremium ? "var(--accent)" : "var(--primary)"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Headline */}
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
            Subscription Active
          </p>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              color: isPremium ? "var(--accent)" : "var(--primary)",
            }}
          >
            Welcome to {tierInfo.label}.
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your{" "}
            <span className="font-semibold" style={{ color: tierInfo.color }}>
              {tierInfo.label}
            </span>{" "}
            membership is active. The lounge is yours.
          </p>
        </div>

        {/* Tier badge */}
        {tier !== "free" && (
          <div className="flex justify-center">
            <span
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold"
              style={{
                background: isPremium
                  ? "linear-gradient(135deg, rgba(193,120,23,0.15), rgba(212,160,74,0.15))"
                  : "rgba(193,120,23,0.12)",
                border: `1px solid ${isPremium ? "rgba(212,160,74,0.3)" : "rgba(193,120,23,0.3)"}`,
                color: tierInfo.color,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                <path
                  d="M6.5 1L8 4.7L12 5.1L9.2 7.7L10 11.4L6.5 9.4L3 11.4L3.8 7.7L1 5.1L5 4.7L6.5 1Z"
                  fill={tierInfo.color}
                />
              </svg>
              {tierInfo.label} Member
            </span>
          </div>
        )}

        {/* What's unlocked */}
        {features.length > 0 && (
          <div
            className="rounded-2xl p-5 text-left space-y-3"
            style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
          >
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
              Now Unlocked
            </p>
            <ul className="space-y-2.5">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-foreground">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 15 15"
                    fill="none"
                    aria-hidden="true"
                    className="flex-shrink-0"
                  >
                    <circle
                      cx="7.5"
                      cy="7.5"
                      r="7"
                      fill={isPremium ? "rgba(212,160,74,0.15)" : "rgba(193,120,23,0.15)"}
                    />
                    <path
                      d="M4.5 7.5L6.5 9.5L10.5 5.5"
                      stroke={isPremium ? "var(--accent)" : "var(--primary)"}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Webhook still processing */}
        {tier === "free" && (
          <div
            className="rounded-xl p-4 text-sm text-muted-foreground"
            style={{ backgroundColor: "var(--muted)", border: "1px solid var(--border)" }}
          >
            Your membership is activating — it should appear within a few seconds.
            Refresh the page if it doesn&apos;t update.
          </div>
        )}

        {/* CTAs */}
        <div className="space-y-3 pt-2">
          <Link href="/account" className="btn btn-primary w-full block text-center">
            Explore Your Benefits
          </Link>
          <Link
            href="/humidor"
            className="btn btn-ghost w-full block text-center text-sm text-muted-foreground"
          >
            Back to My Humidor
          </Link>
        </div>
      </div>
    </div>
  );
}
