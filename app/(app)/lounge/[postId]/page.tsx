import { Suspense }              from "react";
import { redirect }               from "next/navigation";
import { getServerUser }          from "@/lib/auth/server-user";
import { PostDetailDataIsland }   from "./_islands";
import { PostDetailSkeleton }     from "./_skeletons";

/*
 * Edge runtime: faster cold start than the Node serverless target.
 * No `force-dynamic` — the data island is implicitly dynamic (per-user
 * queries) but the shell here is static, so removing the flag lets the
 * static portion be served from the edge cache where possible.
 *
 * Pattern mirrors `app/(app)/home/` and `app/(app)/humidor/`.
 */
export const runtime = "edge";

interface Props {
  params: Promise<{ postId: string }>;
}

export default async function PostDetailPage({ params }: Props) {
  const { postId } = await params;
  const user       = await getServerUser();
  if (!user) redirect("/login");

  return (
    <Suspense fallback={<PostDetailSkeleton />}>
      <PostDetailDataIsland postId={postId} userId={user.id} />
    </Suspense>
  );
}
