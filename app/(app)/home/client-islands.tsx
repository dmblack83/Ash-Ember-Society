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
import { fetchLatestNews }  from "@/lib/data/news-client";

import { Masthead }          from "@/components/dashboard/Masthead";
import { News }              from "@/components/dashboard/News";
import { SmokingConditions } from "@/components/dashboard/SmokingConditions";
import { AgingAlerts }       from "@/components/dashboard/AgingAlerts";
import { Notifications }     from "@/components/dashboard/Notifications";
import { LocalShops }        from "@/components/dashboard/LocalShops";
import { DashboardPager }    from "@/components/dashboard/DashboardPager";
import { HumidorConditions } from "@/components/govee/HumidorConditions";
import { useGoveeStatus }    from "@/components/govee/useGoveeStatus";

import {
  MastheadSkeleton,
  SmokingConditionsSkeleton,
  AgingSkeleton,
  NotificationsSkeleton,
  NewsSkeleton,
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
      country={data?.country?.trim() || null}
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

/* News rail — public data (no session needed), so it fetches as soon
   as the shell hydrates. Replaced the server island when /home became
   a fully static shell; SWR keeps revisits instant while the
   cron-synced table revalidates in the background. */
export function NewsClientIsland() {
  const { data } = useSWR(keyFor.newsLatest(5), () => fetchLatestNews(5));
  if (data === undefined) return <NewsSkeleton />;
  return <News items={data} />;
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
  return <LocalShops zip={data?.zip_code?.trim() || null} city={data?.city?.trim() || null} />;
}

/* Govee humidor sensor card — pager slide. */
export function GoveeSensorIsland() {
  const { ready, session } = useAppSession();
  if (!ready || !session) return null;
  return <HumidorConditions userId={session.userId} />;
}

/* Pager wrapper. Composed client-side because the sensor slide only
   exists when a sensor is connected (a null child would otherwise
   still occupy a slide slot server-side). Slide order keeps
   Notifications at initialIndex 1, matching the previous shell. */
export function DashboardPagerIsland() {
  const { ready, session } = useAppSession();
  const userId = ready && session ? session.userId : null;
  const { status } = useGoveeStatus(userId);
  const showSensor =
    status?.connected === true && status.lastTempF !== null && status.lastHumidity !== null;

  return (
    <DashboardPager initialIndex={1}>
      <SmokingConditionsIsland />
      <NotificationsIsland />
      <AgingIsland />
      {showSensor ? <GoveeSensorIsland /> : null}
    </DashboardPager>
  );
}
