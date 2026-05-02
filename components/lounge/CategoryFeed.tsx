"use client";

import { useState, useMemo } from "react";
import { useRouter }         from "next/navigation";
import { createClient }      from "@/utils/supabase/client";
import { InlinePost }        from "./InlinePost";
import { PinnedPostCard }    from "./PinnedPostCard";
import type { PostItem }     from "./InlinePost";
import type { SmokeLogData } from "./PostDetailClient";
import { NewPostSheet }      from "./NewPostSheet";
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
  const router   = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [pinnedPosts,  setPinnedPosts]  = useState<PostItem[]>(initialPinnedPosts ?? []);
  const [posts,        setPosts]        = useState<PostItem[]>(initialPosts);
  const [likedIds,     setLikedIds]     = useState<Set<string>>(new Set(initialLikedIds));
  const [loading,      setLoading]      = useState(false);
  const [hasMore,      setHasMore]      = useState(initialHasMore);
  const [showNewPost,  setShowNewPost]  = useState(false);
  const [toast,        setToast]        = useState<string | null>(null);

  const canPost            = membershipTier !== "free";
  const postableCategories = allCategories.filter((c) => !c.is_locked && !c.is_gate);

  function showToast(msg: string) {
    setToast(null);
    requestAnimationFrame(() => setToast(msg));
  }

  function handleNewPost() {
    if (!canPost) { showToast("Upgrade to Member to post in the Lounge."); return; }
    setShowNewPost(true);
  }

  function handleDeletePost(postId: string) {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setPinnedPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);

    const offset = posts.length;

    const { data: rawPosts } = await supabase
      .from("forum_posts")
      .select("id, title, content, created_at, user_id, image_url, is_locked, is_system, smoke_log_id, forum_post_likes(count), forum_comments(count)")
      .eq("category_id", category.id)
      .eq("is_system", false)
      .neq("is_pinned", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    const batch = (rawPosts ?? []) as any[];

    if (batch.length === 0) {
      setHasMore(false);
      setLoading(false);
      return;
    }

    /* Fetch author profiles. We pull `city` here too so the verdict-card
       byline ("DAVE · SALT LAKE CITY") can render on shared burn-report
       posts using the post author's city, not the viewer's. */
    const authorIds = [...new Set(batch.map((p) => p.user_id).filter(Boolean) as string[])];
    const nameMap: Record<string, { display_name: string | null; avatar_url: string | null; badge: string | null; membership_tier: string | null; city: string | null }> = {};
    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, badge, membership_tier, city")
        .in("id", authorIds);
      for (const p of profiles ?? []) {
        nameMap[p.id] = {
          display_name:    p.display_name,
          avatar_url:      p.avatar_url,
          badge:           p.badge ?? null,
          membership_tier: p.membership_tier ?? null,
          city:            p.city ?? null,
        };
      }
    }

    /* Fetch liked status */
    const newPostIds = batch.map((p) => p.id) as string[];
    const newLikedSet = new Set<string>();
    if (newPostIds.length > 0) {
      const { data: likes } = await supabase
        .from("forum_post_likes")
        .select("post_id")
        .eq("user_id", userId)
        .in("post_id", newPostIds);
      for (const l of likes ?? []) newLikedSet.add(l.post_id);
    }

    /* Fetch smoke logs for posts that have them, plus their joined
       burn_reports row (1:1, optional — old logs predate the table)
       and the resolved flavor tag names. The verdict card needs all
       three. */
    const smokeLogIds = batch.map((p) => p.smoke_log_id).filter(Boolean) as string[];
    const smokeLogMap: Record<string, SmokeLogData> = {};
    if (smokeLogIds.length > 0) {
      const { data: logs } = await supabase
        .from("smoke_logs")
        .select(`
          id, smoked_at, overall_rating, draw_rating, burn_rating,
          construction_rating, flavor_rating, pairing_drink, pairing_food,
          location, occasion, smoke_duration_minutes, review_text, photo_urls,
          content_video_id, flavor_tag_ids, user_id,
          cigar:cigar_catalog(brand, series, format),
          burn_report:burn_reports(thirds_enabled, third_beginning, third_middle, third_end)
        `)
        .in("id", smokeLogIds);

      const rawLogs = (logs ?? []) as Array<Record<string, unknown> & { id: string; flavor_tag_ids: string[] | null; user_id: string | null; burn_report: Array<Record<string, unknown>> | null }>;

      // Resolve flavor tag IDs → names in one query.
      const allTagIds = [...new Set(rawLogs.flatMap((l) => l.flavor_tag_ids ?? []))];
      const tagNameMap: Record<string, string> = {};
      if (allTagIds.length > 0) {
        const { data: tags } = await supabase
          .from("flavor_tags")
          .select("id, name")
          .in("id", allTagIds);
        for (const t of (tags ?? []) as { id: string; name: string }[]) tagNameMap[t.id] = t.name;
      }

      for (const log of rawLogs) {
        const author = log.user_id ? nameMap[log.user_id as string] : null;
        // burn_report is passed through as-is (array OR object — the
        // SmokeLogData type accepts both, and render sites use
        // unwrapBurnReport() to flatten before reading fields).
        smokeLogMap[log.id] = {
          ...(log as unknown as SmokeLogData),
          flavor_tag_names: (log.flavor_tag_ids ?? [])
            .map((id) => tagNameMap[id])
            .filter(Boolean) as string[],
          author_display_name: author?.display_name ?? null,
          author_city:         author?.city         ?? null,
        };
      }
    }

    /* Fetch votes for feedback category */
    const voteMap: Record<string, { upvotes: number; downvotes: number; userVote: 0 | 1 | -1 }> = {};
    if (category.is_feedback && newPostIds.length > 0) {
      const { data: votes } = await supabase
        .from("forum_post_votes")
        .select("post_id, user_id, value")
        .in("post_id", newPostIds);
      for (const v of (votes ?? []) as { post_id: string; user_id: string; value: number }[]) {
        const cur = voteMap[v.post_id] ?? { upvotes: 0, downvotes: 0, userVote: 0 as 0 | 1 | -1 };
        if (v.value === 1)  cur.upvotes   += 1;
        if (v.value === -1) cur.downvotes += 1;
        if (v.user_id === userId) cur.userVote = v.value as 1 | -1;
        voteMap[v.post_id] = cur;
      }
    }

    const normalized: PostItem[] = batch.map((p) => {
      const v = voteMap[p.id] ?? { upvotes: 0, downvotes: 0, userVote: 0 as 0 | 1 | -1 };
      return {
        id:            p.id,
        title:         p.title,
        content:       p.content,
        created_at:    p.created_at,
        user_id:       p.user_id,
        author:        p.user_id ? (nameMap[p.user_id] ?? null) : null,
        like_count:    (p.forum_post_likes as { count: number }[])[0]?.count ?? 0,
        comment_count: (p.forum_comments  as { count: number }[])[0]?.count ?? 0,
        image_url:     p.image_url ?? null,
        is_locked:     p.is_locked,
        is_system:     p.is_system,
        smoke_log:     p.smoke_log_id ? (smokeLogMap[p.smoke_log_id] ?? null) : null,
        upvotes:       v.upvotes,
        downvotes:     v.downvotes,
        user_vote:     v.userVote,
      };
    });

    setPosts((prev) => [...prev, ...normalized]);
    setLikedIds((prev) => { const next = new Set(prev); for (const id of newLikedSet) next.add(id); return next; });
    setHasMore(batch.length >= PAGE_SIZE);
    setLoading(false);
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
        left:              0,
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

      {/* New post sheet */}
      {showNewPost && (
        <NewPostSheet
          categories={postableCategories}
          initialCategoryId={category.id}
          isFeedback={category.is_feedback}
          userId={userId}
          onClose={() => setShowNewPost(false)}
          onCreated={() => {
            setShowNewPost(false);
            showToast("Post created.");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
