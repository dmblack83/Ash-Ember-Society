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
 * authed data.
 */
export function LoungeRoute() {
  const { allowed, session } = useGatedSession();

  const { data: shell } = useSWR(
    allowed && session ? keyFor.loungeShell(session.userId) : null,
    ([, userId]) => fetchLoungeShellData(userId),
  );

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
