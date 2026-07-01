"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import useSWR from "swr";
import { useAppSession } from "@/components/system/app-session";
import { resolveSessionGate } from "@/lib/auth/session-gate";
import { keyFor } from "@/lib/data/keys";
import { fetchAccountProfile } from "@/lib/data/account-fetchers";
import { getMembershipTier } from "@/lib/membership";
import type { MembershipTier } from "@/lib/stripe";
import { AccountClient } from "@/components/account/AccountClient";
import { AccountShellSkeleton } from "./_skeletons";

/**
 * Client entry for the static /account shell. Reads the session from
 * AppSessionProvider, applies the same gate the proxy applies, then
 * loads the full profile row via SWR (own-row RLS) and maps it to the
 * prop shape AccountClient always had — so the 1,700-line client tree
 * is untouched by the shell conversion. While the session or profile
 * resolves it shows the neutral shell skeleton — never authed data.
 */
export function AccountRoute() {
  const { ready, session } = useAppSession();
  const router   = useRouter();
  const pathname = usePathname();

  const gate = resolveSessionGate({
    hasSession:          session !== null,
    onboardingCompleted: session?.onboardingCompleted ?? false,
    pathname,
  });

  useEffect(() => {
    if (!ready) return;
    if (gate === "login") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (gate === "onboarding") {
      router.replace("/onboarding");
    }
  }, [ready, gate, pathname, router]);

  const userId = session?.userId ?? null;
  const { data: profile, isLoading } = useSWR(
    ready && gate === "allow" && userId ? keyFor.accountProfile(userId) : null,
    () => fetchAccountProfile(userId as string),
  );

  if (!ready || gate !== "allow" || !session) return <AccountShellSkeleton />;
  /* First-ever load only — revisits render instantly from the SWR cache. */
  if (isLoading && profile === undefined) return <AccountShellSkeleton />;

  const currentTier       = getMembershipTier(profile ?? null) as MembershipTier;
  const hasStripeCustomer = !!profile?.stripe_customer_id;

  return (
    <AccountClient
      userId={session.userId}
      email={session.email ?? ""}
      memberSince={profile?.created_at ?? null}
      badge={profile?.badge ?? null}
      assignedBadges={profile?.assigned_badges ?? []}
      profile={{
        display_name: profile?.display_name ?? null,
        first_name:   profile?.first_name   ?? null,
        last_name:    profile?.last_name    ?? null,
        phone:        profile?.phone        ?? null,
        city:         profile?.city         ?? null,
        state:        profile?.state        ?? null,
        zip_code:     profile?.zip_code     ?? null,
        avatar_url:   profile?.avatar_url   ?? null,
      }}
      membership={{
        currentTier,
        hasStripeCustomer,
        /* Billing date loads inside MembershipTab via
           /api/stripe/subscription-status — same as before. */
        nextBillingDate:  null,
        currentPeriodEnd: null,
      }}
    />
  );
}
