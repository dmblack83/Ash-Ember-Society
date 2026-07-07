"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import useSWRInfinite         from "swr/infinite";
import { useSearchParams }    from "next/navigation";
import dynamic                from "next/dynamic";
import { InlinePost }         from "./InlinePost";
import { PinnedPostCard }     from "./PinnedPostCard";
import { RulesModal }         from "./RulesModal";
import type { PostItem }      from "./InlinePost";
import { keyFor }                     from "@/lib/data/keys";
import { fetchLoungeFeedPage }        from "@/lib/data/lounge-fetchers";
import type { CategoryFeedPage }      from "@/lib/data/lounge-fetchers";
import {
  CHIPS,
  parseChip,
  parseView,
  categorySlugForChip,
  chipForCategorySlug,
  feedParamsForView,
  type ChipValue,
} from "@/lib/lounge/chips";
import type { ForumCategory } from "@/lib/data/forum";
import { Toast }              from "@/components/ui/toast";
import { ScrollCarets }       from "@/components/ui/ScrollCarets";
import { RefreshButton }      from "@/components/ui/RefreshButton";

/* NewPostSheet only mounts when the user taps "+ New Post". */
const NewPostSheet = dynamic(
  () => import("./NewPostSheet").then((m) => ({ default: m.NewPostSheet })),
  { ssr: false },
);

const PAGE_SIZE = 15;
/* Stacked sticky header: title row 56 + chip row 52 + secondary row 40. */
const TITLE_H     = 56;
const CHIPS_H     = 52;
const SECONDARY_H = 40;
const HEADER_H    = TITLE_H + CHIPS_H + SECONDARY_H;

interface RulesPost {
  id:      string;
  title:   string;
  content: string;
}

interface Props {
  categories:     ForumCategory[];
  pinnedPosts:    PostItem[];
  rulesPost:      RulesPost | null;
  hasUnlocked:    boolean;
  agreementCount: number;
  userId:         string;
  isFounder:      boolean;
}

export function LoungeFeedClient({
  categories, pinnedPosts: initialPinnedPosts,
  rulesPost, hasUnlocked, agreementCount, userId, isFounder,
}: Props) {
  const searchParams = useSearchParams();

  /* URL is the source of truth for chip + view. Chip taps write via
     window.history.pushState — Next syncs useSearchParams on native
     pushState (shallow: no server component re-render), and the back
     button walks chip history as the spec requires. */
  const chip           = parseChip(searchParams.get("c"));
  const isFeedbackChip = chip === "feedback";
  const view           = parseView(searchParams.get("v"), isFeedbackChip);
  const { filter, sort } = feedParamsForView(view);

  const idBySlug = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.slug, c.id])) as Record<string, string>,
    [categories],
  );
  const slugById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.slug])) as Record<string, string>,
    [categories],
  );

  const activeSlug         = categorySlugForChip(chip);
  const activeCategoryId   = activeSlug ? (idBySlug[activeSlug] ?? null) : null;
  const feedbackCategoryId = idBySlug["product-feedback"] ?? null;

  function pushUrl(nextChip: ChipValue, nextView: string | null) {
    const params = new URLSearchParams();
    if (nextChip !== "all") params.set("c", nextChip);
    if (nextView)           params.set("v", nextView);
    const qs = params.toString();
    window.history.pushState(null, "", qs ? `/lounge?${qs}` : "/lounge");
  }

  function handleChipTap(next: ChipValue) {
    if (next === chip) return;
    /* Chip change resets the secondary row to its default view. */
    pushUrl(next, null);
  }

  function handleViewTap(next: string) {
    if (next === view) return;
    const isDefault = next === (isFeedbackChip ? "open" : "new");
    pushUrl(chip, isDefault ? null : next);
  }

  /* ---- Feed (SWR infinite) ---------------------------------------- */
  /* No server seed: page 0 loads through the same fetcher as every
     other page. The persistent SWR cache paints revisits instantly
     while a background revalidation runs; a first-ever visit shows
     the shell skeleton then the fetched page. */

  const {
    data,
    size,
    setSize,
    isValidating,
    mutate: mutateFeed,
  } = useSWRInfinite<CategoryFeedPage>(
    (pageIndex, prev) => {
      if (prev && !prev.hasMore) return null;
      return keyFor.loungeFeed(activeCategoryId, pageIndex, userId, filter, sort);
    },
    ([, , pageIndex]) =>
      fetchLoungeFeedPage({
        categoryId:         activeCategoryId,
        feedbackCategoryId,
        userId,
        pageIndex:          pageIndex as number,
        pageSize:           PAGE_SIZE,
        filter,
        sort,
      }),
    {
      revalidateFirstPage: false,
    },
  );

  /* Stale-while-revalidate on every chip/view switch. Cached pages
     paint instantly; a background revalidation of the switched-to key
     brings in anything new — a post just composed into that category,
     someone else's post since the pages were cached, or stale pages
     when returning to an earlier key (the hook never unmounts, so SWR
     would otherwise re-serve stale data forever). First run is
     skipped: the initial key does its own fresh fetch. Brand-new keys
     dedupe with their in-flight first fetch, so this adds no extra
     request there. */
  const feedKeyId = `${activeCategoryId ?? "all"}|${filter}|${sort}`;
  const prevKeyId = useRef<string | null>(null);
  useEffect(() => {
    if (prevKeyId.current !== null && prevKeyId.current !== feedKeyId) {
      mutateFeed();
    }
    prevKeyId.current = feedKeyId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedKeyId]);

  const pages    = useMemo(() => data ?? [], [data]);
  const posts    = useMemo(() => pages.flatMap((p) => p.posts), [pages]);
  const likedIds = useMemo(() => new Set(pages.flatMap((p) => p.likedIds)), [pages]);
  const hasMore  = pages[pages.length - 1]?.hasMore ?? false;
  const loading  = isValidating;

  /* ---- Pinned posts ------------------------------------------------ */
  /* Rendered only when a specific category chip is active (All stays
     clean, per spec). Local state so optimistic delete works. */
  const [pinnedPosts, setPinnedPosts] = useState<PostItem[]>(initialPinnedPosts);
  /* Resync when the shell SWR bundle revalidates (pull-to-refresh,
     focus revalidation) — this component stays mounted, so without
     this the refreshed prop would be silently ignored. Server truth
     overrides any local optimistic delete, which is correct. */
  useEffect(() => {
    setPinnedPosts(initialPinnedPosts);
  }, [initialPinnedPosts]);
  const visiblePinnedPosts = useMemo(() => {
    if (!activeCategoryId) return [];
    const inCategory = pinnedPosts.filter((p) => p.category_id === activeCategoryId);
    return filter === "mine" ? inCategory.filter((p) => p.user_id === userId) : inCategory;
  }, [pinnedPosts, activeCategoryId, filter, userId]);

  /* ---- Composer + rules gate --------------------------------------- */

  const [unlocked,       setUnlocked]       = useState(hasUnlocked);
  /* Upgrade-only resync: a shell revalidation confirming agreement
     unlocks the composer, but never re-locks a session where the user
     just agreed locally and the refetch raced the write. */
  useEffect(() => {
    if (hasUnlocked) setUnlocked(true);
  }, [hasUnlocked]);
  const [showRules,      setShowRules]      = useState(false);
  const [pendingCompose, setPendingCompose] = useState(false);
  const [showNewPost,    setShowNewPost]    = useState(false);
  const [toast,          setToast]          = useState<string | null>(null);

  const composerCategories = useMemo(
    () =>
      (["general-discussion", "burn-reports", "product-feedback"] as const)
        .map((slug) => categories.find((c) => c.slug === slug))
        .filter((c): c is ForumCategory => !!c && !c.is_locked && !c.is_gate)
        .map((c) => ({
          id:          c.id,
          name:        c.name,
          is_locked:   c.is_locked,
          slug:        c.slug,
          is_feedback: c.is_feedback,
        })),
    [categories],
  );

  const composerInitialId =
    activeCategoryId ?? idBySlug["general-discussion"] ?? composerCategories[0]?.id ?? "";

  function showToast(msg: string) {
    setToast(null);
    requestAnimationFrame(() => setToast(msg));
  }

  function handleNewPost() {
    /* Agree-before-posting: the rules gate triggers from the composer
       (detached from the old Welcome room). Reading the feed is open. */
    if (!unlocked && rulesPost) {
      setPendingCompose(true);
      setShowRules(true);
      return;
    }
    setShowNewPost(true);
  }

  function handleCreated(categoryId: string) {
    setShowNewPost(false);
    showToast("Post created.");
    const slug       = slugById[categoryId];
    const targetChip = slug ? chipForCategorySlug(slug) : null;
    /* The All feed contains every category, so when the user composed
       from All (or is already on the post's chip) stay put and refresh
       the loaded pages — the new post lands at the top. Only jump
       chips when the post would not be visible where the user is; the
       key-change effect above revalidates the destination. */
    if (chip === "all" || !targetChip || targetChip === chip) {
      mutateFeed();
    } else {
      pushUrl(targetChip, null);
    }
  }

  /* ---- Optimistic list mutations ----------------------------------- */

  function handleDeletePost(postId: string) {
    mutateFeed(
      pages.map((page) => ({ ...page, posts: page.posts.filter((p) => p.id !== postId) })),
      { revalidate: false },
    );
    setPinnedPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  function handleClosePost(postId: string) {
    /* Remove from the "open" feedback view; other views keep the post
       (its status chip re-renders on next revalidation). */
    if (filter !== "open") return;
    mutateFeed(
      pages.map((page) => ({ ...page, posts: page.posts.filter((p) => p.id !== postId) })),
      { revalidate: false },
    );
  }

  function loadMore() {
    if (loading || !hasMore) return;
    setSize(size + 1);
  }

  const secondaryOptions: { value: string; label: string }[] = isFeedbackChip
    ? [
        { value: "open",   label: "Open" },
        { value: "closed", label: "Closed" },
        { value: "mine",   label: "My posts" },
      ]
    : [
        { value: "new",  label: "New" },
        { value: "hot",  label: "Hot" },
        { value: "mine", label: "My Posts" },
      ];

  /* ---- Render ------------------------------------------------------ */

  return (
    <div style={{ minHeight: "100dvh", backgroundColor: "var(--background)", paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      <ScrollCarets />

      {/* Fixed stacked header: title / chips / secondary */}
      <div
        style={{
          position:             "fixed",
          top:                  0,
          left:                 "var(--app-content-left)",
          right:                0,
          zIndex:               40,
          backgroundColor:      "rgba(26,18,16,0.97)",
          backdropFilter:       "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom:         "1px solid var(--border)",
        }}
      >
        {/* Row 1 — title + New Post */}
        <div className="flex items-center px-4 md:max-w-[50%] md:mx-auto" style={{ height: TITLE_H, gap: 12 }}>
          <h1 className="font-serif text-xl font-semibold flex-1" style={{ color: "var(--foreground)" }}>
            The Lounge
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

        {/* Row 2 — category chips (horizontally scrollable) */}
        <div
          role="tablist"
          aria-label="Category filter"
          className="flex items-center gap-2 px-4 md:max-w-[50%] md:mx-auto"
          style={{ height: CHIPS_H, overflowX: "auto", scrollbarWidth: "none" }}
        >
          {CHIPS.map((c) => {
            const active = c.value === chip;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => handleChipTap(c.value)}
                className="rounded-full text-xs font-semibold"
                style={{
                  flexShrink:              0,
                  padding:                 "7px 14px",
                  border:                  active ? "1px solid rgba(232,100,44,0.55)" : "1px solid var(--border)",
                  background:              active ? "rgba(232,100,44,0.14)" : "rgba(36,28,23,0.6)",
                  color:                   active ? "var(--ember,#E8642C)" : "var(--muted-foreground)",
                  cursor:                  "pointer",
                  touchAction:             "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  transition:              "background 0.15s, border-color 0.15s, color 0.15s",
                }}
                role="tab"
                aria-selected={active}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Row 3 — contextual secondary slot + refresh */}
        <div
          className="flex items-center px-4 md:max-w-[50%] md:mx-auto"
          style={{ height: SECONDARY_H, gap: 22, justifyContent: "space-between" }}
        >
          <div role="tablist" aria-label="Feed view" className="flex items-center" style={{ gap: 22 }}>
            {secondaryOptions.map((opt) => {
              const active = opt.value === view;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleViewTap(opt.value)}
                  className="text-xs font-semibold"
                  style={{
                    padding:                 "2px 0 6px",
                    border:                  "none",
                    background:              "transparent",
                    color:                   active ? "var(--gold,#D4A04A)" : "var(--muted-foreground)",
                    borderBottom:            active ? "2px solid var(--gold,#D4A04A)" : "2px solid transparent",
                    cursor:                  "pointer",
                    touchAction:             "manipulation",
                    WebkitTapHighlightColor: "transparent",
                  }}
                  role="tab"
                  aria-selected={active}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <RefreshButton
            style={{
              background:              "none",
              border:                  "none",
              color:                   "var(--gold,#D4A04A)",
              padding:                 8,
              borderRadius:            999,
              cursor:                  "pointer",
              touchAction:             "manipulation",
              WebkitTapHighlightColor: "transparent",
              display:                 "flex",
              alignItems:              "center",
              justifyContent:          "center",
              flexShrink:              0,
            }}
            className=""
            onRefresh={async () => { await mutateFeed(); }}
            ariaLabel="Refresh posts"
          />
        </div>
      </div>

      {/* Feed */}
      <div style={{ paddingTop: HEADER_H }}>
        <div className="px-4 pt-3 flex flex-col gap-3 pb-4 w-full md:max-w-[50%] md:mx-auto">
          {visiblePinnedPosts.map((post) => (
            <PinnedPostCard
              key={post.id}
              post={post}
              initialLiked={likedIds.has(post.id)}
              userId={userId}
              isFeedback={post.category_id != null && post.category_id === feedbackCategoryId}
              onDelete={handleDeletePost}
            />
          ))}

          {posts.length === 0 && visiblePinnedPosts.length === 0 && !loading && (
            <div className="text-center py-16">
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                {filter === "mine"
                  ? "You haven't posted here yet."
                  : "Nothing here yet. Be the first."}
              </p>
            </div>
          )}

          {posts.map((post) => {
            const postSlug = post.category_id ? (slugById[post.category_id] ?? null) : null;
            const postChip = postSlug ? chipForCategorySlug(postSlug) : null;
            const tagLabel =
              chip === "all" && postChip
                ? CHIPS.find((c) => c.value === postChip)?.label ?? null
                : null;
            return (
              <InlinePost
                key={post.id}
                post={post}
                initialLiked={likedIds.has(post.id)}
                userId={userId}
                isFeedback={post.category_id != null && post.category_id === feedbackCategoryId}
                isFounder={isFounder}
                onDelete={handleDeletePost}
                onClose={isFeedbackChip ? handleClosePost : undefined}
                categoryTag={tagLabel}
                onCategoryTagTap={postChip ? () => handleChipTap(postChip) : undefined}
              />
            );
          })}

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

      {/* Rules gate (from the composer) */}
      {showRules && rulesPost && (
        <RulesModal
          rulesPost={rulesPost}
          userId={userId}
          initialLiked={unlocked}
          initialCount={agreementCount}
          onClose={() => { setShowRules(false); setPendingCompose(false); }}
          onAgreed={() => {
            setUnlocked(true);
            if (pendingCompose) {
              setShowRules(false);
              setPendingCompose(false);
              setShowNewPost(true);
            }
          }}
        />
      )}

      {/* Composer */}
      {showNewPost && (
        <NewPostSheet
          categories={composerCategories}
          initialCategoryId={composerInitialId}
          userId={userId}
          onClose={() => setShowNewPost(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
