"use client";

import {
  useState, useEffect, useRef, useCallback, useOptimistic, startTransition,
} from "react";
import { createClient } from "@/utils/supabase/client";
import { formatDistanceToNow } from "date-fns";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface PostAuthor {
  display_name: string | null;
}

interface Post {
  id:             string;
  user_id:        string;
  content:        string;
  image_url:      string | null;
  cigar_name:     string | null;
  cigar_brand:    string | null;
  likes_count:    number;
  comments_count: number;
  created_at:     string;
  profiles:       PostAuthor | null;
  liked_by_me:    boolean; // client-computed
}

interface Comment {
  id:         string;
  user_id:    string;
  content:    string;
  created_at: string;
  profiles:   PostAuthor | null;
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

const PAGE_SIZE = 15;

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function Avatar({ name, size = 36 }: { name: string | null; size?: number }) {
  const bg = [
    "rgba(193,120,23,0.25)",
    "rgba(212,160,74,0.25)",
    "rgba(232,100,44,0.25)",
    "rgba(138,126,118,0.25)",
  ];
  const color = bg[(name?.charCodeAt(0) ?? 0) % bg.length];
  return (
    <div
      className="flex-shrink-0 rounded-full flex items-center justify-center font-semibold text-xs"
      style={{
        width: size, height: size,
        backgroundColor: color,
        border: "1px solid var(--border)",
        color: "var(--foreground)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {initials(name)}
    </div>
  );
}

function timeAgo(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------
   Compose box
   ------------------------------------------------------------------ */

interface ComposeProps {
  userId:      string;
  displayName: string;
  onPosted:    (post: Post) => void;
}

function ComposeBox({ userId, displayName, onPosted }: ComposeProps) {
  const [content,   setContent]   = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview,   setPreview]   = useState<string | null>(null);
  const [posting,   setPosting]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function handlePost() {
    if (!content.trim() || posting) return;
    setPosting(true);

    let image_url: string | null = null;

    if (imageFile) {
      const ext  = imageFile.name.split(".").pop();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("post-images")
        .upload(path, imageFile);
      if (!uploadErr) {
        const { data } = supabase.storage.from("post-images").getPublicUrl(path);
        image_url = data.publicUrl;
      }
    }

    const { data, error } = await supabase
      .from("posts")
      .insert({ user_id: userId, content: content.trim(), image_url })
      .select("*, profiles(display_name)")
      .single();

    if (!error && data) {
      onPosted({ ...data, liked_by_me: false });
      setContent("");
      setImageFile(null);
      setPreview(null);
    }

    setPosting(false);
  }

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="flex gap-3">
        <Avatar name={displayName} />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Share a moment…"
          rows={3}
          className="input flex-1 resize-none py-2.5 text-sm leading-relaxed"
          style={{ minHeight: 72 }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handlePost();
          }}
        />
      </div>

      {preview && (
        <div className="relative ml-11">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview" className="rounded-lg max-h-48 object-cover" />
          <button
            onClick={() => { setImageFile(null); setPreview(null); }}
            className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs"
            style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff" }}
            aria-label="Remove image"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex items-center justify-between ml-11">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Attach image"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
            <rect x="1" y="3" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <circle cx="5" cy="6.5" r="1.2" fill="currentColor"/>
            <path d="M1 10l3.5-3.5 2.5 2.5 2-2 4 4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
          </svg>
          Photo
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

        <button
          onClick={handlePost}
          disabled={!content.trim() || posting}
          className="btn btn-primary py-1.5 px-4 text-xs disabled:opacity-40"
        >
          {posting ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 border border-white/50 border-t-white rounded-full animate-spin" />
              Posting…
            </span>
          ) : "Post"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Comment thread
   ------------------------------------------------------------------ */

interface CommentThreadProps {
  postId:   string;
  userId:   string;
  displayName: string;
  initialCount: number;
}

function CommentThread({ postId, userId, displayName, initialCount }: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded,   setLoaded]   = useState(false);
  const [draft,    setDraft]    = useState("");
  const [sending,  setSending]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("post_comments")
        .select("*, profiles(display_name)")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });
      setComments((data ?? []) as Comment[]);
      setLoaded(true);
    }
    load();
  }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitComment() {
    if (!draft.trim() || sending) return;
    setSending(true);
    const { data, error } = await supabase
      .from("post_comments")
      .insert({ post_id: postId, user_id: userId, content: draft.trim() })
      .select("*, profiles(display_name)")
      .single();
    if (!error && data) {
      setComments((prev) => [...prev, data as Comment]);
      await supabase.rpc("increment_comments", { post_id: postId });
    }
    setDraft("");
    setSending(false);
  }

  if (!loaded) {
    return (
      <div className="pt-3 pl-3">
        <div className="h-3 w-24 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <div className="pt-3 border-t space-y-3" style={{ borderColor: "var(--border)" }}>
      {comments.length === 0 && (
        <p className="text-xs text-muted-foreground pl-1">No comments yet. Be first.</p>
      )}
      {comments.map((c) => (
        <div key={c.id} className="flex gap-2.5">
          <Avatar name={c.profiles?.display_name ?? null} size={28} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-semibold text-foreground truncate">
                {c.profiles?.display_name ?? "Member"}
              </span>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                {timeAgo(c.created_at)}
              </span>
            </div>
            <p className="text-sm text-foreground leading-snug mt-0.5 break-words">{c.content}</p>
          </div>
        </div>
      ))}

      {/* Compose */}
      <div className="flex gap-2.5 items-center pt-1">
        <Avatar name={displayName} size={28} />
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitComment(); }}
            placeholder="Add a comment…"
            className="input w-full pr-9 py-2 text-sm"
          />
          <button
            onClick={submitComment}
            disabled={!draft.trim() || sending}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
            aria-label="Send comment"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
              <path d="M1.5 7.5h12M8.5 2.5l5 5-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Post card
   ------------------------------------------------------------------ */

interface PostCardProps {
  post:        Post;
  userId:      string;
  displayName: string;
  onLikeToggle: (postId: string, liked: boolean) => void;
}

function PostCard({ post, userId, displayName, onLikeToggle }: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [optimisticLiked, setOptimisticLiked] = useOptimistic(post.liked_by_me);
  const [optimisticCount, setOptimisticCount] = useOptimistic(post.likes_count);

  async function handleLike() {
    const newLiked = !optimisticLiked;
    startTransition(() => {
      setOptimisticLiked(newLiked);
      setOptimisticCount((c) => c + (newLiked ? 1 : -1));
    });
    onLikeToggle(post.id, newLiked);
  }

  const authorName = post.profiles?.display_name ?? "Member";

  return (
    <article
      className="glass rounded-2xl p-4 space-y-3 animate-fade-in"
      style={{ animationDelay: "0ms" }}
    >
      {/* Author row */}
      <div className="flex items-start gap-3">
        <Avatar name={authorName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span
              className="font-semibold text-sm text-foreground truncate"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {authorName}
            </span>
            <span className="text-[11px] text-muted-foreground flex-shrink-0">
              {timeAgo(post.created_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
        {post.content}
      </p>

      {/* Image */}
      {post.image_url && (
        <div className="rounded-lg overflow-hidden" style={{ maxHeight: 384 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.image_url}
            alt="Post image"
            className="w-full object-cover"
            style={{ maxHeight: 384 }}
          />
        </div>
      )}

      {/* Cigar tag */}
      {post.cigar_name && (
        <div className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
          style={{
            backgroundColor: "rgba(193,120,23,0.12)",
            border: "1px solid rgba(193,120,23,0.25)",
            color: "var(--primary)",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
            <rect x="1" y="4" width="9" height="3" rx="1.5" stroke="currentColor" strokeWidth="1.1"/>
            <path d="M9 4.5c.5 0 1 .44 1 1s-.5 1-1 1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
          </svg>
          <span className="font-medium">{post.cigar_name}</span>
          {post.cigar_brand && (
            <span className="text-muted-foreground">· {post.cigar_brand}</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-1">
        {/* Like */}
        <button
          onClick={handleLike}
          className="flex items-center gap-1.5 text-xs transition-colors"
          style={{ color: optimisticLiked ? "var(--ember)" : "var(--muted-foreground)" }}
          aria-label={optimisticLiked ? "Unlike" : "Like"}
          aria-pressed={optimisticLiked}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
            <path
              d="M7.5 13S1.5 9.5 1.5 5.5a3 3 0 015-2.25A3 3 0 0113.5 5.5C13.5 9.5 7.5 13 7.5 13z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
              fill={optimisticLiked ? "currentColor" : "none"}
            />
          </svg>
          {optimisticCount > 0 && <span>{optimisticCount}</span>}
        </button>

        {/* Comment toggle */}
        <button
          onClick={() => setShowComments((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Toggle comments"
          aria-expanded={showComments}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
            <path
              d="M1.5 2.5h12a1 1 0 011 1v7a1 1 0 01-1 1H5l-3.5 2.5V3.5a1 1 0 011-1z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
              fill={showComments ? "rgba(255,255,255,0.06)" : "none"}
            />
          </svg>
          {post.comments_count > 0 && <span>{post.comments_count}</span>}
        </button>
      </div>

      {/* Comment thread */}
      {showComments && (
        <CommentThread
          postId={post.id}
          userId={userId}
          displayName={displayName}
          initialCount={post.comments_count}
        />
      )}
    </article>
  );
}

/* ------------------------------------------------------------------
   Main feed client
   ------------------------------------------------------------------ */

interface FeedClientProps {
  userId:      string;
  displayName: string;
}

export function FeedClient({ userId, displayName }: FeedClientProps) {
  const [posts,    setPosts]    = useState<Post[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [hasMore,  setHasMore]  = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const offsetRef  = useRef(0);
  const supabase   = createClient();

  /* Fetch a page of posts, merging liked_by_me from post_likes */
  const fetchPosts = useCallback(async (offset: number): Promise<Post[]> => {
    const { data } = await supabase
      .from("posts")
      .select("*, profiles(display_name)")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (!data || data.length === 0) return [];

    const ids = data.map((p) => p.id as string);
    const { data: likes } = await supabase
      .from("post_likes")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", ids);

    const likedSet = new Set((likes ?? []).map((l) => l.post_id as string));
    return data.map((p) => ({ ...p, liked_by_me: likedSet.has(p.id) })) as Post[];
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Initial load */
  useEffect(() => {
    async function init() {
      setLoading(true);
      const initial = await fetchPosts(0);
      setPosts(initial);
      offsetRef.current = initial.length;
      setHasMore(initial.length === PAGE_SIZE);
      setLoading(false);
    }
    init();
  }, [fetchPosts]);

  /* Realtime — new posts from other users slide in at the top */
  useEffect(() => {
    const channel = supabase
      .channel("public:posts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        (payload) => {
          const newPost = payload.new as Omit<Post, "profiles" | "liked_by_me">;
          if (newPost.user_id === userId) return; // already added optimistically
          // Fetch author name
          supabase
            .from("profiles")
            .select("display_name")
            .eq("id", newPost.user_id)
            .single()
            .then(({ data }) => {
              setPosts((prev) => [
                { ...newPost, profiles: data, liked_by_me: false },
                ...prev,
              ]);
            });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const more = await fetchPosts(offsetRef.current);
    setPosts((prev) => [...prev, ...more]);
    offsetRef.current += more.length;
    setHasMore(more.length === PAGE_SIZE);
    setLoadingMore(false);
  }

  function handlePosted(post: Post) {
    setPosts((prev) => [post, ...prev]);
  }

  async function handleLikeToggle(postId: string, liked: boolean) {
    if (liked) {
      await supabase
        .from("post_likes")
        .insert({ post_id: postId, user_id: userId });
      await supabase.rpc("increment_likes", { post_id: postId });
    } else {
      await supabase
        .from("post_likes")
        .delete()
        .match({ post_id: postId, user_id: userId });
      await supabase.rpc("decrement_likes", { post_id: postId });
    }
    // Sync the real count back into state
    const { data } = await supabase
      .from("posts")
      .select("likes_count")
      .eq("id", postId)
      .single();
    if (data) {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, likes_count: data.likes_count, liked_by_me: liked }
            : p
        )
      );
    }
  }

  /* ── Render ───────────────────────────────────────────────────── */

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <h1 style={{ fontFamily: "var(--font-serif)" }}>The Lounge</h1>

      {/* Compose */}
      <ComposeBox userId={userId} displayName={displayName} onPosted={handlePosted} />

      {/* Feed */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="rounded-2xl p-4 space-y-3 animate-pulse"
              style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
            >
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-muted rounded w-1/4" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center space-y-2"
          style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
        >
          <p
            className="text-lg text-muted-foreground"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            The Lounge is quiet.
          </p>
          <p className="text-sm text-muted-foreground">
            Be the first to share a moment.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                userId={userId}
                displayName={displayName}
                onLikeToggle={handleLikeToggle}
              />
            ))}
          </div>

          {hasMore && (
            <div className="text-center pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="btn btn-secondary px-8"
              >
                {loadingMore ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border border-foreground/30 border-t-foreground rounded-full animate-spin" />
                    Loading…
                  </span>
                ) : "Load more"}
              </button>
            </div>
          )}

          {!hasMore && posts.length > PAGE_SIZE && (
            <p className="text-center text-xs text-muted-foreground pt-2">
              You've reached the end.
            </p>
          )}
        </>
      )}
    </div>
  );
}
