"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient }                               from "@/utils/supabase/client";
import { formatDistanceToNow }                        from "date-fns";
import { AvatarFrame }                                from "@/components/ui/AvatarFrame";
import { resolveBadge }                               from "@/lib/badge";

/* ------------------------------------------------------------------ */

interface Category {
  id:           string;
  name:         string;
  slug:         string;
  description:  string;
  is_locked:    boolean;
  post_count:   number;
  last_post_at: string | null;
}

interface FeedbackPost {
  id:              string;
  title:           string;
  created_at:      string;
  user_id:         string | null;
  display_name:    string | null;
  avatar_url:      string | null;
  badge:           string | null;
  membership_tier: string | null;
  upvotes:         number;
  downvotes:       number;
  comment_count:   number;
  user_vote:       1 | -1 | 0;
}

interface Props {
  category:    Category;
  userId:      string;
  canPost:     boolean;
  refreshKey?: number;
  onNewPost:   (categoryId: string) => void;
  onPostClick: (postId: string) => void;
}

/* ------------------------------------------------------------------ */

function relativeTime(iso: string): string {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); }
  catch { return ""; }
}

function Avatar({
  name,
  avatarUrl,
  size = 32,
  badge,
  tier,
}: {
  name:      string | null | undefined;
  avatarUrl: string | null | undefined;
  size?:     number;
  badge?:    string | null;
  tier?:     string | null;
}) {
  return (
    <AvatarFrame
      badge={resolveBadge(badge, tier)}
      size={size}
      name={name}
      avatarUrl={avatarUrl}
    />
  );
}

/* ---- Vote button -------------------------------------------------- */

function VoteButton({
  direction,
  active,
  count,
  disabled,
  onClick,
}: {
  direction: 1 | -1;
  active:    boolean;
  count:     number;
  disabled:  boolean;
  onClick:   () => void;
}) {
  const isUp       = direction === 1;
  const activeColor = isUp ? "#4ade80" : "#f87171";   // green-400 / red-400
  const activeBg    = isUp ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)";
  const activeBorder= isUp ? "rgba(74,222,128,0.35)"  : "rgba(248,113,113,0.35)";
  const color       = active ? activeColor : "var(--muted-foreground)";

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      aria-label={isUp ? "Upvote" : "Downvote"}
      style={{
        display:                 "flex",
        flexDirection:           "row",
        alignItems:              "center",
        justifyContent:          "center",
        gap:                     4,
        paddingLeft:             8,
        paddingRight:            8,
        height:                  32,
        flexShrink:              0,
        background:              active ? activeBg : "rgba(255,255,255,0.04)",
        border:                  active ? `1px solid ${activeBorder}` : "1px solid var(--border)",
        borderRadius:            8,
        cursor:                  disabled ? "default" : "pointer",
        touchAction:             "manipulation",
        WebkitTapHighlightColor: "transparent",
        color,
        transition:              "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
      } as React.CSSProperties}
    >
      <svg
        width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true"
        style={{ transform: isUp ? "none" : "rotate(180deg)", flexShrink: 0 }}
      >
        <path d="M6 2L10 8H2L6 2Z" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1 }}>{count}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */

export function FeedbackCard({ category, userId, canPost, refreshKey, onNewPost, onPostClick }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [expanded,    setExpanded]    = useState(false);
  const [posts,       setPosts]       = useState<FeedbackPost[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [fetchedOnce, setFetchedOnce] = useState(false);
  const [voting,      setVoting]      = useState<string | null>(null);
  const [page,        setPage]        = useState(0);

  const PAGE_SIZE = 10;

  const fetchPosts = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("forum_posts")
      .select("id, title, created_at, user_id, forum_post_votes(user_id, value), forum_comments(count)")
      .eq("category_id", category.id)
      .order("created_at", { ascending: false });

    if (error || !data) { setLoading(false); return; }

    const userIds = [...new Set((data as any[]).map((r: any) => r.user_id).filter(Boolean))] as string[];
    let nameMap: Record<string, { display_name: string | null; avatar_url: string | null; badge: string | null; membership_tier: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, badge, membership_tier")
        .in("id", userIds);
      for (const p of profileRows ?? []) nameMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url, badge: p.badge ?? null, membership_tier: p.membership_tier ?? null };
    }

    const mapped: FeedbackPost[] = (data as any[]).map((row: any) => {
      const votes     = (row.forum_post_votes ?? []) as { user_id: string; value: number }[];
      const upvotes   = votes.filter((v) => v.value === 1).length;
      const downvotes = votes.filter((v) => v.value === -1).length;
      const myVote    = votes.find((v) => v.user_id === userId)?.value ?? 0;
      return {
        id:            row.id,
        title:         row.title,
        created_at:    row.created_at,
        user_id:       row.user_id ?? null,
        display_name:    row.user_id ? (nameMap[row.user_id]?.display_name    ?? null) : null,
        avatar_url:      row.user_id ? (nameMap[row.user_id]?.avatar_url      ?? null) : null,
        badge:           row.user_id ? (nameMap[row.user_id]?.badge            ?? null) : null,
        membership_tier: row.user_id ? (nameMap[row.user_id]?.membership_tier ?? null) : null,
        upvotes,
        downvotes,
        comment_count: (row.forum_comments as { count: number }[])[0]?.count ?? 0,
        user_vote:     myVote as 1 | -1 | 0,
      };
    });

    // Newest first
    mapped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setLoading(false);
    setFetchedOnce(true);
    setPosts(mapped);
    setPage(0);
  }, [category.id, userId, supabase]);

  useEffect(() => {
    if (expanded && !fetchedOnce) fetchPosts();
  }, [expanded, fetchedOnce, fetchPosts]);

  useEffect(() => {
    if (!refreshKey) return;
    setFetchedOnce(false);
    if (expanded) fetchPosts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  /* ---- Vote handler ------------------------------------------------ */

  async function handleVote(postId: string, direction: 1 | -1) {
    if (voting) return;
    setVoting(postId);

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const prev_vote = p.user_vote;
        const toggle    = prev_vote === direction;
        const newVote   = toggle ? 0 : direction;

        let up   = p.upvotes;
        let down = p.downvotes;
        if (prev_vote === 1)  up   -= 1;
        if (prev_vote === -1) down -= 1;
        if (newVote === 1)  up   += 1;
        if (newVote === -1) down += 1;

        return { ...p, upvotes: up, downvotes: down, user_vote: newVote as 1 | -1 | 0 };
      })
    );

    const post     = posts.find((p) => p.id === postId);
    const prevVote = post?.user_vote ?? 0;
    const newVote  = prevVote === direction ? 0 : direction;

    if (newVote === 0) {
      await supabase.from("forum_post_votes").delete().eq("user_id", userId).eq("post_id", postId);
    } else if (prevVote === 0) {
      await supabase.from("forum_post_votes").insert({ user_id: userId, post_id: postId, value: newVote });
    } else {
      await supabase.from("forum_post_votes").update({ value: newVote }).eq("user_id", userId).eq("post_id", postId);
    }

    setVoting(null);
  }

  /* ---- Render ------------------------------------------------------ */

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid rgba(232,100,44,0.25)", backgroundColor: "var(--card)" }}
    >
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-4 text-left"
        style={{
          background:              "none",
          border:                  "none",
          cursor:                  "pointer",
          touchAction:             "manipulation",
          WebkitTapHighlightColor: "transparent",
          minHeight:               64,
        }}
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm" style={{ color: "var(--ember, #E8642C)" }}>
              {category.name}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)", lineHeight: 1.5 }}>
              {category.description}
            </p>
          </div>
          <div className="shrink-0 mt-0.5">
            <svg
              width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
              style={{
                color:      "var(--muted-foreground)",
                transform:  expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            >
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: "1px solid rgba(232,100,44,0.15)" }}>
          {/* Controls row */}
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Newest first
            </p>
            {!category.is_locked && canPost && (
              <button
                type="button"
                onClick={() => onNewPost(category.id)}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{
                  border:                  "1.5px solid var(--ember, #E8642C)",
                  color:                   "var(--ember, #E8642C)",
                  background:              "transparent",
                  cursor:                  "pointer",
                  touchAction:             "manipulation",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                  <path d="M5 1a.75.75 0 01.75.75V4.25h2.5a.75.75 0 010 1.5h-2.5v2.5a.75.75 0 01-1.5 0v-2.5H1.75a.75.75 0 010-1.5h2.5V1.75A.75.75 0 015 1z" />
                </svg>
                New Idea
              </button>
            )}
          </div>

          {/* Loading skeletons */}
          {loading && posts.length === 0 && (
            <div className="px-4 pb-4 flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-lg animate-pulse" style={{ height: 56, backgroundColor: "rgba(255,255,255,0.05)" }} />
              ))}
            </div>
          )}

          {/* Post list */}
          {(!loading || posts.length > 0) && (() => {
            const totalPages  = Math.ceil(posts.length / PAGE_SIZE);
            const pagePosts   = posts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
            return (
            <div className="px-4 pb-4">
              {posts.length === 0 && !loading && (
                <p className="text-xs py-4 text-center" style={{ color: "var(--muted-foreground)" }}>
                  No feedback yet. Share your first idea.
                </p>
              )}

              {pagePosts.map((post, i) => (
                <div
                  key={post.id}
                  style={{
                    paddingTop:    10,
                    paddingBottom: 10,
                    borderBottom:  i < posts.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                >
                  {/* Content row — tapping opens the post */}
                  <button
                    type="button"
                    onClick={() => onPostClick(post.id)}
                    className="w-full flex items-center gap-3 min-w-0 text-left"
                    style={{
                      background:              "none",
                      border:                  "none",
                      cursor:                  "pointer",
                      touchAction:             "manipulation",
                      WebkitTapHighlightColor: "transparent",
                      padding:                 0,
                      marginBottom:            8,
                    }}
                  >
                    <Avatar name={post.display_name} avatarUrl={post.avatar_url} size={32} badge={post.badge} tier={post.membership_tier} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-2" style={{ color: "var(--foreground)", lineHeight: 1.4 }}>
                        {post.title}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                        {post.display_name ?? "Member"} &middot; {relativeTime(post.created_at)}
                      </p>
                    </div>
                  </button>

                  {/* Action row — votes + comments, inline */}
                  <div className="flex items-center gap-2" style={{ paddingLeft: 44 }}>
                    <VoteButton
                      direction={1}
                      active={post.user_vote === 1}
                      count={post.upvotes}
                      disabled={voting === post.id}
                      onClick={() => handleVote(post.id, 1)}
                    />
                    <VoteButton
                      direction={-1}
                      active={post.user_vote === -1}
                      count={post.downvotes}
                      disabled={voting === post.id}
                      onClick={() => handleVote(post.id, -1)}
                    />
                    <div className="flex items-center gap-1 text-xs" style={{ color: "var(--muted-foreground)", marginLeft: 4 }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                        <path d="M6 1.25C3.377 1.25 1.25 3.377 1.25 6a4.75 4.75 0 007.496 3.874L11 11l-1.126-2.254A4.75 4.75 0 006 1.25z" />
                      </svg>
                      {post.comment_count}
                    </div>
                  </div>
                </div>
              ))}

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{
                      background:              page === 0 ? "transparent" : "rgba(255,255,255,0.05)",
                      border:                  "1px solid var(--border)",
                      color:                   page === 0 ? "var(--border)" : "var(--muted-foreground)",
                      cursor:                  page === 0 ? "default" : "pointer",
                      touchAction:             "manipulation",
                      WebkitTapHighlightColor: "transparent",
                    } as React.CSSProperties}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M7.5 3L4.5 6l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Prev
                  </button>

                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {page + 1} / {totalPages}
                  </p>

                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{
                      background:              page >= totalPages - 1 ? "transparent" : "rgba(255,255,255,0.05)",
                      border:                  "1px solid var(--border)",
                      color:                   page >= totalPages - 1 ? "var(--border)" : "var(--muted-foreground)",
                      cursor:                  page >= totalPages - 1 ? "default" : "pointer",
                      touchAction:             "manipulation",
                      WebkitTapHighlightColor: "transparent",
                    } as React.CSSProperties}
                  >
                    Next
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M4.5 3L7.5 6l-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
