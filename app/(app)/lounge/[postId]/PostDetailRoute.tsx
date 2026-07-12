"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { useGatedSession } from "@/lib/auth/use-gated-session";
import { keyFor } from "@/lib/data/keys";
import { fetchPostDetailBundle } from "@/lib/data/post-detail-fetchers";
import { PostDetailClient } from "@/components/lounge/PostDetailClient";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { PostDetailSkeleton } from "./_skeletons";

/**
 * Client entry for the /lounge/[postId] shell (same pattern as
 * /humidor/[id]/ItemRoute). Gates the session, loads the detail
 * bundle via SWR, and renders PostDetailClient with the exact prop
 * shape the server island used to assemble. A missing post (deleted,
 * bad deep link, RLS-hidden) redirects to /lounge — the island's
 * behavior. A FAILED fetch (network blip, transient Supabase error)
 * shows a retry state instead of a skeleton-forever hang. Tapping a
 * post now paints the skeleton instantly; revisits render from the
 * SWR cache.
 */
export function PostDetailRoute({ postId }: { postId: string }) {
  const { allowed, session } = useGatedSession();
  const router = useRouter();

  const userId = session?.userId ?? null;
  const { data, error, isValidating, mutate } = useSWR(
    allowed && userId ? keyFor.postDetail(userId, postId) : null,
    () => fetchPostDetailBundle(userId as string, postId),
  );

  const missing = data === null;
  useEffect(() => {
    if (missing) router.replace("/lounge");
  }, [missing, router]);

  /* Fetch failed with nothing cached: surface it. With cached data
     present, SWR keeps serving it and retries in the background. */
  if (error && data === undefined) {
    return (
      <div
        className="flex flex-col items-center justify-center px-6 text-center"
        style={{ minHeight: "60dvh", backgroundColor: "var(--background)" }}
      >
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          This post could not load. Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={() => mutate()}
          disabled={isValidating}
          className="mt-4 rounded-full px-5 py-2 text-sm font-semibold"
          style={{
            background:              "linear-gradient(135deg,#D4A04A,#C17817)",
            color:                   "#1A1210",
            border:                  "none",
            cursor:                  isValidating ? "default" : "pointer",
            opacity:                 isValidating ? 0.7 : 1,
            touchAction:             "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {isValidating ? "Retrying..." : "Try again"}
        </button>
      </div>
    );
  }

  if (!allowed || !session || data === undefined || data === null) {
    return <PostDetailSkeleton />;
  }

  return (
    <PullToRefresh>
      <PostDetailClient
        post={data.post}
        comments={data.comments}
        hasLiked={data.hasLiked}
        userId={session.userId}
        smokeLog={data.smokeLog}
      />
    </PullToRefresh>
  );
}
