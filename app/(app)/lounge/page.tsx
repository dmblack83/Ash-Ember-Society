import { Suspense }            from "react";
import { redirect }             from "next/navigation";
import { getServerUser }        from "@/lib/auth/server-user";
import { LoungeFeedDataIsland } from "./_islands";
import { LoungeShellSkeleton }  from "./_skeletons";
import { PullToRefresh }        from "@/components/ui/PullToRefresh";

/*
 * Edge runtime: faster cold start than the Node serverless target.
 * The data island is implicitly dynamic (per-user queries); the shell
 * streams first. Pattern mirrors `app/(app)/home/` and `/humidor/`.
 *
 * ?c=<chip>&v=<view> select the category chip and secondary view.
 * Subsequent chip taps update the URL via shallow pushState (no
 * server round-trip); only full loads (deep link, refresh, PWA
 * resume) pass through here.
 */
export const runtime  = "edge";
export const metadata = { title: "The Lounge — Ash & Ember Society" };

interface Props {
  searchParams: Promise<{ c?: string; v?: string }>;
}

export default async function LoungePage({ searchParams }: Props) {
  const [{ c, v }, user] = await Promise.all([searchParams, getServerUser()]);
  if (!user) redirect("/login");

  return (
    <PullToRefresh>
      <Suspense fallback={<LoungeShellSkeleton />}>
        <LoungeFeedDataIsland userId={user.id} chipParam={c ?? null} viewParam={v ?? null} />
      </Suspense>
    </PullToRefresh>
  );
}
