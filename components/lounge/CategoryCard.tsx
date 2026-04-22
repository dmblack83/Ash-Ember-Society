"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter }                                           from "next/navigation";
import { createClient }                                       from "@/utils/supabase/client";
import { formatDistanceToNow }                        from "date-fns";

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

interface PostRow {
  id:            string;
  title:         string;
  created_at:    string;
  user_id:       string | null;
  display_name:  string | null;
  avatar_url:    string | null;
  like_count:    number;
  comment_count: number;
}

interface Props {
  category:    Category;
  userId:      string;
  canPost:     boolean;
  refreshKey?: number;
  onNewPost:   (categoryId: string) => void;
  onPostClick: (postId: string) => void;
}

const PAGE_SIZE = 10;

/* ------------------------------------------------------------------ */

function initials(name: string | null | undefined): string {
  if (!name) return "A";
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function relativeLastPost(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const diff    = Date.now() - new Date(iso).getTime();
    const seconds = Math.floor(diff / 1000);
    const rtf     = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    if (seconds < 60)  return rtf.format(-seconds,                 "second");
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)  return rtf.format(-minutes,                 "minute");
    const hours   = Math.floor(minutes / 60);
    if (hours   < 24)  return rtf.format(-hours,                   "hour");
    const days    = Math.floor(hours   / 24);
    if (days    < 7)   return rtf.format(-days,                    "day");
    const weeks   = Math.floor(days    / 7);
    if (weeks   < 5)   return rtf.format(-weeks,                   "week");
    const months  = Math.floor(days    / 30);
    if (months  < 12)  return rtf.format(-months,                  "month");
    const years   = Math.floor(days    / 365);
    return rtf.format(-years, "year");
  } catch {
    return null;
  }
}

function Avatar({
  name,
  avatarUrl,
  size = 36,
}: {
  name:      string | null | undefined;
  avatarUrl: string | null | undefined;
  size?:     number;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name ?? "Member"}
        style={{
          width:        size,
          height:       size,
          borderRadius: "50%",
          objectFit:    "cover",
          border:       "1px solid var(--border)",
          flexShrink:   0,
        }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full shrink-0 text-xs font-semibold"
      style={{ width: size, height: size, background: "var(--secondary)", color: "var(--muted-foreground)" }}
    >
      {initials(name)}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function CategoryCard({ category, userId, canPost, refreshKey, onNewPost, onPostClick }: Props) {
  const router   = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [expanded,       setExpanded]       = useState(false);
  const [posts,          setPosts]          = useState<PostRow[]>([]);
  const [sort,           setSort]           = useState<"latest" | "top">("latest");
  const [page,           setPage]           = useState(1);
  const [loading,        setLoading]        = useState(false);
  const [hasMore,        setHasMore]        = useState(false);
  const [fetchedOnce,    setFetchedOnce]    = useState(false);
  const [localPostCount, setLocalPostCount] = useState(category.post_count);
  const [localLastPost,  setLocalLastPost]  = useState(category.last_post_at);

  // Refs so realtime callback sees current values without re-subscribing
  const expandedRef = useRef(expanded);
  const pageRef     = useRef(page);
  const sortRef     = useRef(sort);
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);
  useEffect(() => { pageRef.current     = page;     }, [page]);
  useEffect(() => { sortRef.current     = sort;     }, [sort]);

  const isBurnReports = category.slug === "burn-reports";

  const fetchPosts = useCallback(
    async (currentPage: number, currentSort: "latest" | "top") => {
      setLoading(true);
      const from = (currentPage - 1) * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("forum_posts")
        .select("id, title, created_at, user_id, forum_post_likes(count), forum_comments(count)")
        .eq("category_id", category.id)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error || !data) {
        setLoading(false);
        return;
      }

      const userIds = [
        ...new Set((data as any[]).map((r: any) => r.user_id).filter(Boolean)),
      ] as string[];

      let nameMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", userIds);
        for (const p of profileRows ?? []) {
          nameMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
        }
      }

      const mapped: PostRow[] = (data as any[]).map((row: any) => ({
        id:            row.id,
        title:         row.title,
        created_at:    row.created_at,
        user_id:       row.user_id ?? null,
        display_name:  row.user_id ? (nameMap[row.user_id]?.display_name ?? null) : null,
        avatar_url:    row.user_id ? (nameMap[row.user_id]?.avatar_url  ?? null) : null,
        like_count:    (row.forum_post_likes as { count: number }[])[0]?.count ?? 0,
        comment_count: (row.forum_comments  as { count: number }[])[0]?.count ?? 0,
      }));

      const sorted =
        currentSort === "top"
          ? [...mapped].sort((a, b) => b.comment_count - a.comment_count)
          : mapped;

      setLoading(false);
      setHasMore(data.length === PAGE_SIZE);
      setFetchedOnce(true);
      setPosts(sorted);
    },
    [category.id, supabase]
  );

  useEffect(() => {
    if (expanded && !fetchedOnce) {
      fetchPosts(1, sort);
    }
  }, [expanded, fetchedOnce, fetchPosts, sort]);

  /* ---- Realtime subscription --------------------------------------- */

  useEffect(() => {
    const channel = supabase
      .channel(`forum-posts-${category.id}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "forum_posts",
          filter: `category_id=eq.${category.id}`,
        },
        async (payload) => {
          const row = payload.new as {
            id:         string;
            title:      string;
            created_at: string;
            user_id:    string | null;
            is_system:  boolean;
          };

          if (row.is_system) return;

          // Update header stats immediately
          setLocalPostCount((n) => n + 1);
          setLocalLastPost(row.created_at);

          // If expanded on page 1 sorted by latest, prepend the new post
          if (expandedRef.current && pageRef.current === 1 && sortRef.current === "latest") {
            let display_name: string | null = null;
            let avatar_url:   string | null = null;

            if (row.user_id) {
              const { data } = await supabase
                .from("profiles")
                .select("display_name, avatar_url")
                .eq("id", row.user_id)
                .single();
              display_name = data?.display_name ?? null;
              avatar_url   = data?.avatar_url   ?? null;
            }

            const newPost: PostRow = {
              id:            row.id,
              title:         row.title,
              created_at:    row.created_at,
              user_id:       row.user_id,
              display_name,
              avatar_url,
              like_count:    0,
              comment_count: 0,
            };

            setPosts((prev) => {
              if (prev.some((p) => p.id === newPost.id)) return prev;
              return [newPost, ...prev];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [category.id, supabase]);

  // Re-fetch when parent triggers a manual refresh
  useEffect(() => {
    if (!refreshKey) return;
    setFetchedOnce(false);
    setPage(1);
    if (expanded) fetchPosts(1, sort);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  function handleSortChange(newSort: "latest" | "top") {
    if (newSort === sort) return;
    setSort(newSort);
    setPage(1);
    setFetchedOnce(false);
    setPosts([]);
    fetchPosts(1, newSort);
  }

  function handlePrev() {
    if (page <= 1 || loading) return;
    const newPage = page - 1;
    setPage(newPage);
    fetchPosts(newPage, sort);
  }

  function handleNext() {
    if (!hasMore || loading) return;
    const newPage = page + 1;
    setPage(newPage);
    fetchPosts(newPage, sort);
  }

  function handleNewPost() {
    if (isBurnReports) {
      router.push("/humidor");
    } else {
      onNewPost(category.id);
    }
  }

  /* ---- Render ------------------------------------------------------ */

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--border)", backgroundColor: "var(--card)" }}
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
            <p className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
              {category.name}
            </p>
            <p
              className="text-xs mt-1"
              style={{ color: "var(--muted-foreground)", lineHeight: 1.5 }}
            >
              {category.description}
            </p>
            <p className="text-xs mt-1.5" style={{ color: "var(--muted-foreground)", opacity: 0.7 }}>
              {localPostCount.toLocaleString()} post{localPostCount !== 1 ? "s" : ""}
              {(() => {
                const rel = relativeLastPost(localLastPost);
                return rel ? <>&nbsp;&nbsp;Last post {rel}</> : null;
              })()}
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
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {/* Sort + New Post row */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-0">
              {(["latest", "top"] as const).map((s, i) => (
                <>
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSortChange(s)}
                    className="text-xs"
                    style={{
                      background:              "none",
                      border:                  "none",
                      borderBottom:            sort === s ? "2px solid var(--gold, #D4A04A)" : "2px solid transparent",
                      color:                   sort === s ? "var(--foreground)"              : "var(--muted-foreground)",
                      fontWeight:              sort === s ? 700                              : 400,
                      cursor:                  "pointer",
                      padding:                 "2px 2px 4px",
                      touchAction:             "manipulation",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    {s === "latest" ? "Latest" : "Top"}
                  </button>
                  {i === 0 && (
                    <span
                      key="sep"
                      className="text-xs mx-2 select-none"
                      style={{ color: "var(--border)" }}
                      aria-hidden="true"
                    >
                      |
                    </span>
                  )}
                </>
              ))}
            </div>

            {!category.is_locked && (
              <button
                type="button"
                onClick={handleNewPost}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{
                  border:                  "1.5px solid var(--gold, #D4A04A)",
                  color:                   "var(--gold, #D4A04A)",
                  background:              "transparent",
                  cursor:                  "pointer",
                  touchAction:             "manipulation",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                  <path d="M5 1a.75.75 0 01.75.75V4.25h2.5a.75.75 0 010 1.5h-2.5v2.5a.75.75 0 01-1.5 0v-2.5H1.75a.75.75 0 010-1.5h2.5V1.75A.75.75 0 015 1z" />
                </svg>
                {isBurnReports ? "Burn Report" : "New Post"}
              </button>
            )}
          </div>

          {/* Loading skeletons */}
          {loading && posts.length === 0 && (
            <div className="px-4 pb-4 flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-lg animate-pulse"
                  style={{ height: 56, backgroundColor: "rgba(255,255,255,0.05)" }}
                />
              ))}
            </div>
          )}

          {/* Post list */}
          {(!loading || posts.length > 0) && (
            <div className="px-4 pb-2">
              {posts.length === 0 && !loading && (
                <p className="text-xs py-4 text-center" style={{ color: "var(--muted-foreground)" }}>
                  No posts yet. Be the first.
                </p>
              )}
              {posts.map((post, i) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => onPostClick(post.id)}
                  className="w-full flex items-center gap-3 text-left"
                  style={{
                    minHeight:               56,
                    paddingTop:              10,
                    paddingBottom:           10,
                    borderBottom:            i < posts.length - 1 ? "1px solid var(--border)" : "none",
                    borderBottomStyle:       i < posts.length - 1 ? "solid" : "none",
                    borderBottomWidth:       i < posts.length - 1 ? 1 : 0,
                    borderBottomColor:       "var(--border)",
                    background:              "none",
                    border:                  "none",
                    cursor:                  "pointer",
                    touchAction:             "manipulation",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {/* Avatar */}
                  <Avatar name={post.display_name} avatarUrl={post.avatar_url} size={36} />

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1" style={{ color: "var(--foreground)" }}>
                      {post.title}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                      {post.display_name ?? "Member"} &middot; {relativeTime(post.created_at)}
                    </p>
                  </div>

                  {/* Counts */}
                  <div className="flex items-center gap-2 shrink-0 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    <span className="flex items-center gap-0.5">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                        <path d="M6 1.25C3.377 1.25 1.25 3.377 1.25 6a4.75 4.75 0 007.496 3.874L11 11l-1.126-2.254A4.75 4.75 0 006 1.25z" />
                      </svg>
                      {post.comment_count}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
                      </svg>
                      {post.like_count}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Pagination controls */}
          {fetchedOnce && (page > 1 || hasMore) && (
            <div className="px-4 pb-4 pt-1 flex items-center justify-between">
              <button
                type="button"
                onClick={handlePrev}
                disabled={page <= 1 || loading}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{
                  border:      "1px solid var(--border)",
                  color:       page <= 1 || loading ? "var(--border)" : "var(--muted-foreground)",
                  background:  "transparent",
                  cursor:      page <= 1 || loading ? "default" : "pointer",
                  touchAction: "manipulation",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M7.5 2L4.5 6l3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Prev
              </button>

              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {loading ? "..." : `Page ${page}`}
              </span>

              <button
                type="button"
                onClick={handleNext}
                disabled={!hasMore || loading}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{
                  border:      "1px solid var(--border)",
                  color:       !hasMore || loading ? "var(--border)" : "var(--muted-foreground)",
                  background:  "transparent",
                  cursor:      !hasMore || loading ? "default" : "pointer",
                  touchAction: "manipulation",
                }}
              >
                Next
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M4.5 2L7.5 6l-3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )}

          {/* Page loading spinner */}
          {loading && posts.length > 0 && (
            <div className="py-3 flex justify-center">
              <span
                className="inline-block rounded-full border-2 animate-spin"
                style={{
                  width:          16,
                  height:         16,
                  borderColor:    "var(--gold, #D4A04A)",
                  borderTopColor: "transparent",
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
