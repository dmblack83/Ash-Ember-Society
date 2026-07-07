"use client";

import useSWR from "swr";
import { useGatedSession } from "@/lib/auth/use-gated-session";
import { keyFor } from "@/lib/data/keys";
import { fetchLoungeShellData } from "@/lib/data/lounge-fetchers";
import { LoungeFeedClient } from "@/components/lounge/LoungeFeedClient";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { LoungeShellSkeleton } from "./_skeletons";

/**
 * Client entry for the static /lounge shell (same pattern as /humidor
 * and /account). Gates the session via useGatedSession, then loads the
 * shell bundle (categories, pinned posts, rules gate, founder badge)
 * via SWR; the feed pages themselves load inside LoungeFeedClient via
 * useSWRInfinite. LoungeFeedClient mounts only after the shell data
 * resolves because it captures pinnedPosts/hasUnlocked into state on
 * mount. While anything resolves it shows the neutral skeleton, never
 * authed data. A failed shell fetch shows a retry state instead of a
 * skeleton-forever hang.
 */
export function LoungeRoute() {
  const { allowed, session } = useGatedSession();

  const { data: shell, error, isValidating, mutate } = useSWR(
    allowed && session ? keyFor.loungeShell(session.userId) : null,
    ([, userId]) => fetchLoungeShellData(userId),
  );

  /* Fetch failed with nothing cached to show: surface it. With cached
     shell data present, SWR keeps serving it and retries silently. */
  if (error && !shell) {
    return (
      <div
        className="flex flex-col items-center justify-center px-6 text-center"
        style={{ minHeight: "60dvh", backgroundColor: "var(--background)" }}
      >
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          The Lounge could not load. Check your connection and try again.
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

  if (!allowed || !session || !shell) return <LoungeShellSkeleton />;

  return (
    <PullToRefresh>
      <LoungeFeedClient
        categories={shell.categories}
        pinnedPosts={shell.pinnedPosts}
        rulesPost={shell.rulesPost}
        hasUnlocked={shell.hasUnlocked}
        agreementCount={shell.agreementCount}
        userId={session.userId}
        isFounder={shell.isFounder}
      />
    </PullToRefresh>
  );
}
