import { Suspense }                from "react";
import { redirect }                 from "next/navigation";
import { getServerUser }            from "@/lib/auth/server-user";
import { CategoryFeedDataIsland }   from "./_islands";
import { CategoryFeedSkeleton }     from "./_skeletons";

/*
 * Edge runtime: ~50ms cold start vs ~1-3s on Node serverless.
 * Compatible deps: @supabase/ssr, @supabase/supabase-js, next/cache,
 * next/headers, date-fns. No Stripe / Google Vision / fs / sharp here.
 *
 * No `force-dynamic` — the data island is implicitly dynamic (per-user
 * queries) but the shell here is static, so removing the flag lets the
 * static portion be served from the edge cache where possible.
 *
 * Pattern mirrors `app/(app)/home/` and `app/(app)/humidor/`.
 */
export const runtime = "edge";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function LoungeCategoryPage({ params }: Props) {
  const { slug } = await params;
  const user     = await getServerUser();
  if (!user) redirect("/login");

  return (
    <Suspense fallback={<CategoryFeedSkeleton />}>
      <CategoryFeedDataIsland slug={slug} userId={user.id} />
    </Suspense>
  );
}
