import { Suspense }         from "react";
import { redirect }          from "next/navigation";
import { getServerUser }     from "@/lib/auth/server-user";
import { HumidorDataIsland } from "./_islands";
import { HumidorShellSkeleton } from "./_skeletons";

/*
 * Edge runtime: faster cold start than the Node serverless target.
 * No `force-dynamic` — the data island is implicitly dynamic (per-user
 * queries) but the shell here is static, so removing the flag lets the
 * static portion be served from the edge cache where possible.
 */
export const runtime = "edge";

/*
 * Humidor page — sync server component. The data fetch lives in
 * `HumidorDataIsland`; Suspense streams the shell first, fills in the
 * cigar list when the query resolves. Pattern mirrors `app/(app)/home/`.
 */
export default async function HumidorPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  return (
    <Suspense fallback={<HumidorShellSkeleton />}>
      <HumidorDataIsland userId={user.id} />
    </Suspense>
  );
}
