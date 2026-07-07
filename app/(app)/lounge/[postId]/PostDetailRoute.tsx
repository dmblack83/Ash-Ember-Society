"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { useGatedSession } from "@/lib/auth/use-gated-session";
import { keyFor } from "@/lib/data/keys";
import { fetchPostDetailBundle } from "@/lib/data/post-detail-fetchers";
import { PostDetailClient } from "@/components/lounge/PostDetailClient";
import { PostDetailSkeleton } from "./_skeletons";

/**
 * Client entry for the /lounge/[postId] shell (same pattern as
 * /humidor/[id]/ItemRoute). Gates the session, loads the detail
 * bundle via SWR, and renders PostDetailClient with the exact prop
 * shape the server island used to assemble. A missing post (deleted,
 * bad deep link, RLS-hidden) redirects to /lounge — the island's
 * behavior. Tapping a post now paints the skeleton instantly;
 * revisits render from the SWR cache.
 */
export function PostDetailRoute({ postId }: { postId: string }) {
  const { allowed, session } = useGatedSession();
  const router = useRouter();

  const userId = session?.userId ?? null;
  const { data } = useSWR(
    allowed && userId ? keyFor.postDetail(userId, postId) : null,
    () => fetchPostDetailBundle(userId as string, postId),
  );

  const missing = data === null;
  useEffect(() => {
    if (missing) router.replace("/lounge");
  }, [missing, router]);

  if (!allowed || !session || data === undefined || data === null) {
    return <PostDetailSkeleton />;
  }

  return (
    <PostDetailClient
      post={data.post}
      comments={data.comments}
      hasLiked={data.hasLiked}
      userId={session.userId}
      smokeLog={data.smokeLog}
    />
  );
}
