"use client";

import { useState, useMemo } from "react";
import useSWRInfinite        from "swr/infinite";
import { useRouter }         from "next/navigation";
import dynamic               from "next/dynamic";
import { InlinePost }        from "./InlinePost";
import { PinnedPostCard }    from "./PinnedPostCard";
import type { PostItem }     from "./InlinePost";
import { keyFor }                            from "@/lib/data/keys";
import { fetchCategoryFeedPage }             from "@/lib/data/lounge-fetchers";
import type { CategoryFeedPage }             from "@/lib/data/lounge-fetchers";

/* NewPostSheet (456 lines) only mounts when the user taps "+ New Post".
   Conditional render at the call site means the chunk fetches only
   on first open; the rest of the lounge feed loads without it. */
const NewPostSheet = dynamic(
  () => import("./NewPostSheet").then((m) => ({ default: m.NewPostSheet })),
  { ssr: false },
);
import { Toast }             from "@/components/ui/toast";
import { ScrollCarets }      from "@/components/ui/ScrollCarets";

/* ------------------------------------------------------------------ */

const PAGE_SIZE = 15;

interface CategoryInfo {
  id:          string;
  name:        string;
  slug:        string;
  description: string | null;
  is_locked:   boolean;
  is_feedback: boolean;
}

interface SheetCategory {
  id:          string;
  name:        string;
  is_locked:   boolean;
  is_gate?:    boolean;
  is_feedback?: boolean;
}

interface Props {
  category:           CategoryInfo;
  allCategories:      SheetCategory[];
  initialPosts:       PostItem[];
  initialPinnedPosts?: PostItem[];
  initialLikedIds:    string[];
  userId:             string;
  membershipTier:     string;
  hasMore:            boolean;
}

/* ------------------------------------------------------------------ */

export function CategoryFeed({
  category, allCategories, initialPosts, initialPinnedPosts, initialLikedIds,
  userId, membershipTier, hasMore: initialHasMore,
}: Props) {
  const router = useRouter();

  /*
   * Posts list — paginated, infinite-scroll. useSWRInfinite keeps
   * one cache entry per page index so a navigation away + back
   * paints the entire scroll buffer instantly. Page 0 is seeded
   * from the server's initial render via fallbackData; pages 1+
   * fetch on demand when setSize() advances.
   *
   * revalidateOnMount      false  Server already provided fresh page 0
   * revalidateFirstPage    false  Don't auto-refetch page 0 when later
   *                                pages load (would double the cost)
   * revalidateOnFocus      false  Set globally in SWRProvider
   */
  const seedPage: CategoryFeedPage = useMemo(
    () => ({
      posts:    initialPosts,
      likedIds: initialLikedIds,
      hasMore:  initialHasMore,
    }),
    [initialPosts, initialLikedIds, initialHasMore],
  );

  const {
    data,
    size,
    setSize,
    isValidating,
    mutate: mutateFeed,
  } = useSWRInfinite<CategoryFeedPage>(
    (pageIndex, prev) => {
      // Stop fetching once the previous page reported no more rows.
      if (prev && !prev.hasMore) return null;
      return keyFor.loungeFeed(category.id, pageIndex, userId);
    },
    ([, categoryId, pageIndex]) =>
      fetchCategoryFeedPage({
        categoryId: categoryId as string,
        userId,
        isFeedback: category.is_feedback,
        pageIndex:  pageIndex as number,
        pageSize:   PAGE_SIZE,
      }),
    {
      fallbackData:        [seedPage],
      revalidateOnMount:   false,
      revalidateFirstPage: false,
    },
  );

  /* Derive flat views from the SWR data array. `data` is the stable
     identity from SWR; deriving via useMemo on `data` (not on the
     intermediate `pages` constant) keeps React Compiler happy and
     avoids re-computing on unrelated parent re-renders. */
  const pages    = useMemo(() => data ?? [seedPage], [data, seedPage]);
  const posts    = useMemo(() => pages.flatMap((p) => p.posts),    [pages]);
  const likedIds = useMemo(() => new Set(pages.flatMap((p) => p.likedIds)), [pages]);
  const hasMore  = pages[pages.length - 1]?.hasMore ?? false;
  const loading  = isValidating;

  /* Pinned posts are a small finite list (rarely > 1-2 items) —
   * keep as local state. Optimistic delete updates them inline. */
  const [pinnedPosts, setPinnedPosts] = useState<PostItem[]>(initialPinnedPosts ?? []);
  const [showNewPost, setShowNewPost] = useState(false);
  const [toast,       setToast]       = useState<string | null>(null);

  const canPost            = membershipTier !== "free";
  const postableCategories = allCategories.filter((c) => !c.is_locked && !c.is_gate);

  function showToast(msg: string) {
    setToast(null);
    requestAnimationFrame(() => setToast(msg));
  }

  function handleNewPost() {
    if (!canPost) { showToast("Upgrade to Member to post in the Lounge."); return; }
    /* Burn Reports posts have to be tied to a saved smoke_log; the
       composer can't author one from scratch. Send the user to the
       humidor so they pick a cigar, log a smoke, and share from
       there. CategoryCard.handleNewPost has the matching branch. */
    if (category.slug === "burn-reports") {
      router.push("/humidor");
      return;
    }
    setShowNewPost(true);
  }

  /* Optimistic delete — strip the post from every loaded page and
     from pinned. SWR's `revalidate: false` keeps the mutated cache
     without a follow-up refetch. */
  function handleDeletePost(postId: string) {
    mutateFeed(
      pages.map((page) => ({ ...page, posts: page.posts.filter((p) => p.id !== postId) })),
      { revalidate: false },
    );
    setPinnedPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  /* Advance pagination by one page. useSWRInfinite handles the fetch
     once size increments; the new page lands as the next entry in
     `data`. Disabled while a page is in flight or no more pages. */
  function loadMore() {
    if (loading || !hasMore) return;
    setSize(size + 1);
  }

  /* ---- Render ------------------------------------------------------ */

  return (
    <div style={{ minHeight: "100dvh", backgroundColor: "var(--background)", paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      <ScrollCarets />

      {/* Fixed header */}
      <div style={{
        position:          "fixed",
        top:               0,
        left:              "var(--app-content-left)",
        right:             0,
        zIndex:            40,
        height:            56,
        backgroundColor:   "rgba(26,18,16,0.97)",
        backdropFilter:    "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom:      "1px solid var(--border)",
        display:           "flex",
        alignItems:        "center",
      }}>
        <div className="flex items-center w-full px-4 md:max-w-[50%] md:mx-auto" style={{ gap: 12 }}>
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1 text-sm"
            style={{
              color:                   "var(--gold,#D4A04A)",
              background:              "none",
              border:                  "none",
              cursor:                  "pointer",
              touchAction:             "manipulation",
              WebkitTapHighlightColor: "transparent",
              minHeight:               44,
              padding:                 "0 4px",
              flexShrink:              0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>

          <h1 className="font-serif text-base font-semibold flex-1 truncate" style={{ color: "var(--foreground)" }}>
            {category.name}
          </h1>

          <button
            type="button"
            onClick={handleNewPost}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{
              background:              "linear-gradient(135deg,#D4A04A,#C17817)",
              color:                   "#1A1210",
              border:                  "none",
              cursor:                  "pointer",
              touchAction:             "manipulation",
              WebkitTapHighlightColor: "transparent",
              flexShrink:              0,
            }}
          >
            + New Post
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ paddingTop: 56 }}>

        {/* Category description */}
        {category.description && (
          <div className="px-4 pt-4 pb-1 w-full md:max-w-[50%] md:mx-auto">
            <p className="text-xs" style={{ color: "var(--muted-foreground)", lineHeight: 1.5 }}>
              {category.description}
            </p>
          </div>
        )}

        {/* Posts */}
        <div className="px-4 pt-3 flex flex-col gap-3 pb-4 w-full md:max-w-[50%] md:mx-auto">
          {pinnedPosts.map((post) => (
            <PinnedPostCard
              key={post.id}
              post={post}
              initialLiked={likedIds.has(post.id)}
              userId={userId}
              isFeedback={category.is_feedback}
              onDelete={handleDeletePost}
            />
          ))}

          {posts.length === 0 && pinnedPosts.length === 0 && (
            <div className="text-center py-16">
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No posts yet. Be the first.</p>
            </div>
          )}

          {posts.map((post) => (
            <InlinePost
              key={post.id}
              post={post}
              initialLiked={likedIds.has(post.id)}
              userId={userId}
              isFeedback={category.is_feedback}
              onDelete={handleDeletePost}
            />
          ))}

          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className="w-full rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
              style={{
                height:      48,
                background:  loading ? "rgba(212,160,74,0.08)" : "rgba(212,160,74,0.1)",
                border:      "1px solid var(--border)",
                color:       loading ? "var(--muted-foreground)" : "var(--gold,#D4A04A)",
                cursor:      loading ? "default" : "pointer",
                touchAction: "manipulation",
              }}
            >
              {loading ? (
                <>
                  <span className="inline-block rounded-full border-2 border-current border-t-transparent animate-spin"
                    style={{ width: 14, height: 14 }} />
                  Loading...
                </>
              ) : "Load More"}
            </button>
          )}
        </div>
      </div>

      {/* New post sheet — single-category mode. The picker is hidden
          since the user is already inside this category. */}
      {showNewPost && (
        <NewPostSheet
          categories={[{
            id:         category.id,
            name:       category.name,
            is_locked:  category.is_locked,
          }]}
          initialCategoryId={category.id}
          isFeedback={category.is_feedback}
          userId={userId}
          onClose={() => setShowNewPost(false)}
          onCreated={() => {
            setShowNewPost(false);
            showToast("Post created.");
            // Refetch all loaded pages so the new post appears at the
            // top. mutateFeed() with no args = refetch with the same
            // page count we're currently showing.
            mutateFeed();
          }}
        />
      )}
    </div>
  );
}
