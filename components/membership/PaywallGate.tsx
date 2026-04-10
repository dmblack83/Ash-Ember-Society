import { createClient } from "@/utils/supabase/server";
import { getMembershipTier } from "@/lib/membership";
import Link from "next/link";
import type { MembershipTier } from "@/lib/stripe";

/* ------------------------------------------------------------------
   Props
   ------------------------------------------------------------------ */

interface PaywallGateProps {
  /** Minimum tier required to see children. */
  requiredTier: Exclude<MembershipTier, "free">;
  /** The content to gate. It will be rendered blurred if access is denied. */
  children: React.ReactNode;
  /** Optional replacement to render instead of the blurred preview. */
  fallback?: React.ReactNode;
}

/* ------------------------------------------------------------------
   Tier rank helper (duplicated here to avoid importing from lib/membership
   since that module imports lib/stripe which may not tree-shake cleanly)
   ------------------------------------------------------------------ */

const RANK: Record<MembershipTier, number> = { free: 0, member: 1, premium: 2 };

/* ------------------------------------------------------------------
   PaywallGate — server component
   ------------------------------------------------------------------ */

/**
 * Wraps content that requires a paid membership tier.
 *
 * Usage:
 *   <PaywallGate requiredTier="member">
 *     <CommunityPostButton />
 *   </PaywallGate>
 *
 *   <PaywallGate requiredTier="premium" fallback={<p>Premium only</p>}>
 *     <AdvancedStats />
 *   </PaywallGate>
 *
 * If the user meets the requirement, children are rendered normally.
 * If not, children are rendered blurred with a glass upgrade overlay.
 * (The children are still server-rendered but visually inaccessible.)
 */
export async function PaywallGate({ requiredTier, children, fallback }: PaywallGateProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userTier: MembershipTier = "free";

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("membership_tier")
      .eq("id", user.id)
      .single();
    userTier = getMembershipTier(profile) as MembershipTier;
  }

  const hasAccess = RANK[userTier] >= RANK[requiredTier];

  /* ── Access granted ─────────────────────────────────────────── */
  if (hasAccess) {
    return <>{children}</>;
  }

  /* ── Access denied — use custom fallback if provided ─────────── */
  if (fallback) {
    return <>{fallback}</>;
  }

  /* ── Access denied — blurred preview with glass overlay ──────── */
  const tierLabel = requiredTier === "premium" ? "Premium" : "Member";

  return (
    <div className="relative rounded-xl overflow-hidden" aria-label={`${tierLabel} feature — upgrade to unlock`}>
      {/* Blurred content preview */}
      <div
        className="pointer-events-none select-none"
        style={{
          opacity: 0.25,
          filter: "blur(6px)",
          userSelect: "none",
        }}
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Glass upgrade overlay */}
      <div
        className="absolute inset-0 glass flex flex-col items-center justify-center gap-4 px-6 py-8 text-center"
        style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      >
        {/* Lock icon */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: requiredTier === "premium"
              ? "rgba(212,160,74,0.12)"
              : "rgba(193,120,23,0.12)",
            border: `1px solid ${requiredTier === "premium" ? "rgba(212,160,74,0.3)" : "rgba(193,120,23,0.3)"}`,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <rect
              x="3"
              y="8"
              width="12"
              height="8"
              rx="1.5"
              stroke={requiredTier === "premium" ? "var(--accent)" : "var(--primary)"}
              strokeWidth="1.3"
            />
            <path
              d="M6 8V6a3 3 0 016 0v2"
              stroke={requiredTier === "premium" ? "var(--accent)" : "var(--primary)"}
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <p
          className="text-base text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Upgrade to{" "}
          <span style={{ color: requiredTier === "premium" ? "var(--accent)" : "var(--primary)" }}>
            {tierLabel}
          </span>{" "}
          to unlock this.
        </p>

        <Link href="/account" className="btn btn-primary text-sm">
          See Plans
        </Link>
      </div>
    </div>
  );
}
