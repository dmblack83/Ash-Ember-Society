"use client";

/*
 * Client data islands for the static /home shell. Each reads the current
 * user id from AppSessionProvider and fetches via SWR (browser Supabase
 * client), showing its existing skeleton until the session is ready and the
 * first fetch resolves. This mirrors components/dashboard/Notifications.tsx,
 * the island that already used this pattern. RLS scopes every read.
 */

import useSWR from "swr";

import { useAppSession } from "@/components/system/app-session";
import { keyFor }        from "@/lib/data/keys";
import { fetchProfileLite } from "@/lib/data/profile-client";
import { fetchAgingItems }  from "@/lib/data/aging-client";

import { Masthead }          from "@/components/dashboard/Masthead";
import { SmokingConditions } from "@/components/dashboard/SmokingConditions";
import { AgingAlerts }       from "@/components/dashboard/AgingAlerts";
import { Notifications }     from "@/components/dashboard/Notifications";
import { LocalShops }        from "@/components/dashboard/LocalShops";

import {
  MastheadSkeleton,
  SmokingConditionsSkeleton,
  AgingSkeleton,
  NotificationsSkeleton,
} from "./_skeletons";

/* Masthead — greeting + admin link. */
export function MastheadIsland() {
  const { ready, session } = useAppSession();
  const userId = session?.userId ?? null;
  const { data } = useSWR(
    userId ? keyFor.profile(userId) : null,
    () => fetchProfileLite(userId as string),
  );
  if (!ready || !session || data === undefined) return <MastheadSkeleton />;
  return (
    <Masthead
      displayName={data?.display_name ?? "there"}
      isAdmin={!!data?.is_admin}
    />
  );
}

/* Smoking conditions strip — reads profile zip/city, then client weather. */
export function SmokingConditionsIsland() {
  const { ready, session } = useAppSession();
  const userId = session?.userId ?? null;
  const { data } = useSWR(
    userId ? keyFor.profile(userId) : null,
    () => fetchProfileLite(userId as string),
  );
  if (!ready || !session || data === undefined) return <SmokingConditionsSkeleton />;
  return (
    <SmokingConditions
      zip={data?.zip_code?.trim() || null}
      city={data?.city?.trim() || null}
    />
  );
}

/* Notifications — already self-fetches via SWR + auth.uid() RPC. */
export function NotificationsIsland() {
  const { ready, session } = useAppSession();
  if (!ready || !session) return <NotificationsSkeleton />;
  return <Notifications userId={session.userId} />;
}

/* Aging shelf — windowed humidor query. */
export function AgingIsland() {
  const { ready, session } = useAppSession();
  const userId = session?.userId ?? null;
  const { data } = useSWR(
    userId ? keyFor.homeAging(userId) : null,
    () => fetchAgingItems(userId as string),
  );
  if (!ready || !session || data === undefined) return <AgingSkeleton />;
  return <AgingAlerts initialItems={data} />;
}

/* Local shops — reads profile zip for the external Maps link. No skeleton
   (the card renders its own internal fallback); render nothing until ready. */
export function LocalShopsIsland() {
  const { ready, session } = useAppSession();
  const userId = session?.userId ?? null;
  const { data } = useSWR(
    userId ? keyFor.profile(userId) : null,
    () => fetchProfileLite(userId as string),
  );
  if (!ready || !session || data === undefined) return null;
  return <LocalShops zip={data?.zip_code?.trim() || null} />;
}
