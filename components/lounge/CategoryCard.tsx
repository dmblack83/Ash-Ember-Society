"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter }                         from "next/navigation";
import { createClient }                      from "@/utils/supabase/client";
import { formatDistanceToNow }               from "date-fns";

/* ------------------------------------------------------------------ */

interface Category {
  id:          string;
  name:        string;
  slug:        string;
  description: string;
  is_locked:   boolean;
  post_count:  number;
}

interface PostRow {
  id:            string;
  title:         string;
  created_at:    string;
  user_id:       string | null;
  profiles:      { display_name: string | null } | null;
  like_count:    number;
  comment_count: number;
}

interface Props {
  category: Category;
  userId:   string;
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

/* ------------------------------------------------------------------ */

export function CategoryCard({ category, userId }: Props) {
  const router   = useRouter();
  const supabase = createClient();

  const [expanded,    setExpanded]    = useState(false);
  const [posts,       setPosts]       = useState<PostRow[]>([]);
  const [sort,        setSort]        = useState<"latest" | "top">("latest");
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(false);
  const [hasMore,     setHasMore]     = useState(false);
  const [fetchedOnce, setFetchedOnce] = useState(false);

  const fetchPosts = useCallback(
    async (currentPage: number, currentSort: "latest" | "top", append = false) => {
      setLoading(true);
      const from = (currentPage - 1) * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("forum_posts")
        .select(
          "id, title, created_at, user_id, profiles(display_name), forum_post_likes(count), forum_comments(count)"
        )
        .eq("category_id", category.id)
        .order("created_at", { ascending: false })
        .range(from, to);

      setLoading(false);
      if (error || !data) return;

      const mapped: PostRow[] = data.map((row: any) => ({
        id:            row.id,
        title:         row.title,
        created_at:    row.created_at,
        user_id:       row.user_id,
        profiles:      row.profiles,
        like_count:    (row.forum_post_likes as { count: number }[])[0]?.count ?? 0,
        comment_count: (row.forum_comments  as { count: number }[])[0]?.count ?? 0,
      }));

      const sorted =
        currentSort === "top"
          ? [...mapped].sort((a, b) => b.comment_count - a.comment_count)
          : mapped;

      setHasMore(data.length === PAGE_SIZE);
      if (append) {
        setPosts((prev) => [...prev, ...sorted]);
      } else {
        setPosts(sorted);
      }
      setFetchedOnce(true);
    },
    [category.id, supabase]
  );

  useEffect(() => {
    if (expanded && !fetchedOnce) {
      fetchPosts(1, sort);
    }
  }, [expanded, fetchedOnce, fetchPosts, sort]);

  function handleSortChange(newSort: "latest" | "top") {
    if (newSort === sort) return;
    setSort(newSort);
    setPage(1);
    setFetchedOnce(false);
    setPosts([]);
    fetchPosts(1, newSort);
  }

  function handleLoadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPosts(nextPage, sort, true);
  }

  /* ---- Render ------------------------------------------------------ */

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--border)", backgroundColor: "var(--card)" }}
    >
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-4 text-left"
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
        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
            {category.name}
          </p>
          <p
            className="text-xs mt-0.5 line-clamp-2"
            style={{ color: "var(--muted-foreground)", lineHeight: 1.5 }}
          >
            {category.description}
          </p>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{
              border: "1px solid var(--gold, #D4A04A)",
              color:  "var(--gold, #D4A04A)",
            }}
          >
            {category.post_count} post{category.post_count !== 1 ? "s" : ""}
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            style={{
              color:     "var(--muted-foreground)",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {/* Sort toggle */}
          {category.post_count > 0 && (
            <div className="flex gap-2 px-4 py-3">
              {(["latest", "top"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSortChange(s)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{
                    background:              sort === s ? "var(--gold, #D4A04A)" : "transparent",
                    color:                   sort === s ? "#1A1210"              : "var(--muted-foreground)",
                    border:                  sort === s ? "none"                 : "1px solid var(--border)",
                    cursor:                  "pointer",
                    touchAction:             "manipulation",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {s === "latest" ? "Latest" : "Top"}
                </button>
              ))}
            </div>
          )}

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
          {!loading || posts.length > 0 ? (
            <div className="px-4 pb-2">
              {posts.length === 0 && !loading && (
                <p
                  className="text-xs py-4 text-center"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  No posts yet. Be the first.
                </p>
              )}
              {posts.map((post, i) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => router.push(`/lounge/${post.id}`)}
                  className="w-full flex items-center gap-3 text-left"
                  style={{
                    minHeight:               56,
                    borderBottom:            i < posts.length - 1 ? "1px solid var(--border)" : "none",
                    paddingTop:              10,
                    paddingBottom:           10,
                    background:              "none",
                    border:                  i < posts.length - 1 ? `0 0 1px 0 solid var(--border)` : "none",
                    borderBottomStyle:       i < posts.length - 1 ? "solid" : "none",
                    borderBottomWidth:       i < posts.length - 1 ? 1 : 0,
                    borderBottomColor:       "var(--border)",
                    cursor:                  "pointer",
                    touchAction:             "manipulation",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {/* Avatar */}
                  <div
                    className="flex items-center justify-center rounded-full shrink-0 text-xs font-semibold"
                    style={{
                      width:      36,
                      height:     36,
                      background: "var(--secondary)",
                      color:      "var(--muted-foreground)",
                    }}
                  >
                    {initials(post.profiles?.display_name)}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium line-clamp-1"
                      style={{ color: "var(--foreground)" }}
                    >
                      {post.title}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                      {post.profiles?.display_name ?? "Member"} &middot; {relativeTime(post.created_at)}
                    </p>
                  </div>

                  {/* Counts */}
                  <div
                    className="flex items-center gap-2 shrink-0 text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <span className="flex items-center gap-0.5">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                        <path d="M6 1.25C3.377 1.25 1.25 3.377 1.25 6a4.75 4.75 0 007.496 3.874L11 11l-1.126-2.254A4.75 4.75 0 006 1.25z" />
                      </svg>
                      {post.comment_count}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                        <path d="M6 1a5 5 0 100 10A5 5 0 006 1zm.75 7.25a.75.75 0 01-1.5 0V5.75a.75.75 0 011.5 0v2.5zm-.75-4a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                      </svg>
                      {post.like_count}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {/* Load more */}
          {hasMore && !loading && (
            <div className="px-4 pb-4 pt-2">
              <button
                type="button"
                onClick={handleLoadMore}
                className="w-full text-xs py-2 font-medium"
                style={{
                  color:                   "var(--gold, #D4A04A)",
                  background:              "none",
                  border:                  "none",
                  cursor:                  "pointer",
                  touchAction:             "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  textDecoration:          "underline",
                }}
              >
                Load more
              </button>
            </div>
          )}

          {/* Loading more indicator */}
          {loading && posts.length > 0 && (
            <div className="py-3 flex justify-center">
              <span
                className="inline-block rounded-full border-2 animate-spin"
                style={{
                  width:       16,
                  height:      16,
                  borderColor: "var(--gold, #D4A04A)",
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
