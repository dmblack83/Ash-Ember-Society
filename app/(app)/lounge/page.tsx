import { Suspense }            from "react";
import { redirect }             from "next/navigation";
import { getServerUser }        from "@/lib/auth/server-user";
import { LoungeDataIsland }     from "./_islands";
import { LoungeShellSkeleton }  from "./_skeletons";

/*
 * Edge runtime: faster cold start than the Node serverless target.
 * No `force-dynamic` — the data island is implicitly dynamic (per-user
 * queries) but the shell here is static, so removing the flag lets the
 * static portion be served from the edge cache where possible.
 *
 * Pattern mirrors `app/(app)/home/` and `app/(app)/humidor/`.
 */
export const runtime  = "edge";
export const metadata = { title: "The Lounge — Ash & Ember Society" };

export default async function LoungePage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  return (
    <Suspense fallback={<LoungeShellSkeleton />}>
      <LoungeDataIsland userId={user.id} userEmail={user.email} />
    </Suspense>
  );
}
