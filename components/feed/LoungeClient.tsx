"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useOptimistic,
  startTransition,
} from "react";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { AvatarFrame } from "@/components/ui/AvatarFrame";
import { resolveBadge } from "@/lib/badge";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface PostAuthor {
  display_name:    string | null;
  avatar_url?:     string | null;
  badge?:          string | null;
  membership_tier?: string | null;
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
  liked_by_me:    boolean;
}

interface Comment {
  id:         string;
  user_id:    string;
  content:    string;
  created_at: string;
  profiles:   PostAuthor | null;
}

/* ------------------------------------------------------------------
   Constants
   ------------------------------------------------------------------ */

const PAGE_SIZE = 20;

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function Avatar({ name, size = 40, badge, tier }: { name: string | null; size?: number; badge?: string | null; tier?: string | null }) {
  const palette = [
    "rgba(193,120,23,0.25)",
    "rgba(212,160,74,0.25)",
    "rgba(232,100,44,0.25)",
    "rgba(138,126,118,0.25)",
  ];
  const bg = palette[(name?.charCodeAt(0) ?? 0) % palette.length];
  const resolved = resolveBadge(badge, tier);
  return (
    <AvatarFrame badge={resolved} size={size}>
      <div
        className="flex-shrink-0 rounded-full flex items-center justify-center font-semibold select-none"
        style={{
          width: size,
          height: size,
          backgroundColor: bg,
          border: "1px solid var(--border)",
          color: "var(--foreground)",
          fontFamily: "var(--font-sans)",
          fontSize: size <= 30 ? 10 : 13,
          lineHeight: 1,
        }}
        aria-hidden="true"
      >
        {initials(name)}
      </div>
    </AvatarFrame>
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
   Cigar icon (reused in multiple places)
   ------------------------------------------------------------------ */

function CigarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="1.5" y="6" width="12" height="4" rx="2"
        stroke="currentColor" strokeWidth="1.3"
      />
      <path
        d="M12.5 6.5c1.2 0 2 .67 2 1.5s-.8 1.5-2 1.5"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"
      />
      <path
        d="M4 6C4 4.5 5 3.5 6.5 3"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------
   Cigar tag popover
   ------------------------------------------------------------------ */

interface CigarTagPopoverProps {
  cigarName:  string;
  cigarBrand: string;
  onChange:   (name: string, brand: string) => void;
  onClose:    () => void;
}

function CigarTagPopover({
  cigarName,
  cigarBrand,
  onChange,
  onClose,
}: CigarTagPopoverProps) {
  return (
    <div
      className="rounded-xl p-3 space-y-2.5 animate-slide-up"
      style={{ backgroundColor: "var(--muted)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-semibold tracking-widest uppercase"
          style={{ color: "var(--muted-foreground)" }}
        >
          Tag a Cigar
        </span>
        <button
          onClick={onClose}
          className="flex items-center justify-center rounded-full text-muted-foreground transition-colors"
          style={{ width: 28, height: 28 }}
          aria-label="Close cigar tag"
        >
          ✕
        </button>
      </div>
      <input
        type="text"
        value={cigarName}
        onChange={(e) => onChange(e.target.value, cigarBrand)}
        placeholder="Cigar name"
        className="input w-full text-sm"
        style={{ minHeight: 44 }}
        autoFocus
      />
      <input
        type="text"
        value={cigarBrand}
        onChange={(e) => onChange(cigarName, e.target.value)}
        placeholder="Brand (optional)"
        className="input w-full text-sm"
        style={{ minHeight: 44 }}
      />
    </div>
  );
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
  const [content,      setContent]      = useState("");
  const [imageFile,    setImageFile]    = useState<File | null>(null);
  const [preview,      setPreview]      = useState<string | null>(null);
  const [cigarName,    setCigarName]    = useState("");
  const [cigarBrand,   setCigarBrand]   = useState("");
  const [showCigar,    setShowCigar]    = useState(false);
  const [posting,      setPosting]      = useState(false);
  const [postError,    setPostError]    = useState<string | null>(null);
  const fileRef  = useRef<HTMLInputElement>(null);
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
    setPostError(null);

    try {
      let image_url: string | null = null;
      if (imageFile) {
        const ext  = imageFile.name.split(".").pop();
        const path = `${userId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("post-images")
          .upload(path, imageFile);
        if (!upErr) {
          const { data } = supabase.storage.from("post-images").getPublicUrl(path);
          image_url = data.publicUrl;
        }
      }

      const { data, error } = await supabase
        .from("posts")
        .insert({
          user_id:     userId,
          content:     content.trim(),
          image_url,
          cigar_name:  cigarName.trim()  || null,
          cigar_brand: cigarBrand.trim() || null,
        })
        .select("*, profiles!posts_user_id_fkey(display_name, avatar_url, badge, membership_tier)")
        .single();

      if (error) {
        console.error("Post insert error:", error);
        setPostError(error.message);
      } else if (data) {
        onPosted({ ...data, liked_by_me: false } as Post);
        setContent("");
        setImageFile(null);
        setPreview(null);
        setCigarName("");
        setCigarBrand("");
        setShowCigar(false);
      }
    } catch (err) {
      console.error("Unexpected post error:", err);
      setPostError("Something went wrong. Please try again.");
    } finally {
      setPosting(false);
    }
  }

  const hasCigar = cigarName.trim().length > 0;

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
    >
      {/* Avatar + textarea */}
      <div className="flex gap-3">
        <Avatar name={displayName} />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Share a moment…"
          rows={3}
          className="input flex-1 resize-none py-2.5 text-sm leading-relaxed"
          style={{ minHeight: 84 }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handlePost();
          }}
        />
      </div>

      {/* Cigar tag preview badge */}
      {hasCigar && (
        <div className="ml-[52px] animate-fade-in">
          <span
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
            style={{
              backgroundColor: "rgba(193,120,23,0.12)",
              border: "1px solid rgba(193,120,23,0.25)",
              color: "var(--primary)",
            }}
          >
            <CigarIcon size={11} />
            <span className="font-medium">{cigarName}</span>
            {cigarBrand && <span className="opacity-70">· {cigarBrand}</span>}
          </span>
        </div>
      )}

      {/* Image preview */}
      {preview && (
        <div className="relative ml-[52px] animate-fade-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Preview"
            className="w-full rounded-xl object-cover"
            style={{ maxHeight: 200 }}
          />
          <button
            onClick={() => { setImageFile(null); setPreview(null); }}
            className="absolute top-2 right-2 flex items-center justify-center rounded-full text-xs font-bold"
            style={{
              width: 28, height: 28,
              backgroundColor: "rgba(0,0,0,0.65)",
              color: "#fff",
            }}
            aria-label="Remove image"
          >
            ✕
          </button>
        </div>
      )}

      {/* Cigar popover */}
      {showCigar && (
        <div className="ml-[52px]">
          <CigarTagPopover
            cigarName={cigarName}
            cigarBrand={cigarBrand}
            onChange={(n, b) => { setCigarName(n); setCigarBrand(b); }}
            onClose={() => setShowCigar(false)}
          />
        </div>
      )}

      {/* Error message */}
      {postError && (
        <p className="ml-[52px] text-xs" style={{ color: "var(--destructive)" }}>
          {postError}
        </p>
      )}

      {/* Footer: actions + post button */}
      <div className="flex items-center justify-between ml-[52px]">
        <div className="flex items-center gap-1">
          {/* Photo */}
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center rounded-xl transition-colors"
            style={{
              width: 44, height: 44,
              color: "var(--muted-foreground)",
            }}
            aria-label="Attach photo"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <rect x="1.5" y="4" width="15" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
              <circle cx="6.5" cy="8" r="1.7" fill="currentColor"/>
              <path d="M1.5 12.5l4.5-4.5 3.5 3.5 2.5-2.5 5.5 5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              <circle cx="14" cy="5" r="1.5" fill="currentColor" opacity="0.7"/>
            </svg>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />

          {/* Cigar tag */}
          <button
            onClick={() => setShowCigar((v) => !v)}
            className="flex items-center justify-center rounded-xl transition-colors"
            style={{
              width: 44, height: 44,
              color:            hasCigar || showCigar ? "var(--primary)" : "var(--muted-foreground)",
              backgroundColor:  hasCigar || showCigar ? "rgba(193,120,23,0.10)" : "transparent",
            }}
            aria-label="Tag a cigar"
            aria-pressed={showCigar}
          >
            <CigarIcon size={18} />
          </button>
        </div>

        <button
          onClick={handlePost}
          disabled={!content.trim() || posting}
          className="btn btn-primary text-sm disabled:opacity-40"
          style={{ minHeight: 44, paddingInline: "1.25rem" }}
        >
          {posting ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 border border-white/40 border-t-white rounded-full animate-spin" />
              Posting…
            </span>
          ) : "Post"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Comment thread (slide-down reveal)
   ------------------------------------------------------------------ */

interface CommentThreadProps {
  postId:      string;
  userId:      string;
  displayName: string;
}

function CommentThread({ postId, userId, displayName }: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded,   setLoaded]   = useState(false);
  const [draft,    setDraft]    = useState("");
  const [sending,  setSending]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("post_comments")
      .select("*, profiles!post_comments_user_id_fkey(display_name, badge, membership_tier)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setComments((data ?? []) as Comment[]);
        setLoaded(true);
        setTimeout(() => inputRef.current?.focus(), 80);
      });
  }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitComment() {
    if (!draft.trim() || sending) return;
    setSending(true);
    const { data, error } = await supabase
      .from("post_comments")
      .insert({ post_id: postId, user_id: userId, content: draft.trim() })
      .select("*, profiles!post_comments_user_id_fkey(display_name, badge, membership_tier)")
      .single();
    if (!error && data) {
      setComments((prev) => [...prev, data as Comment]);
      await supabase.rpc("increment_comments", { post_id: postId });
    }
    setDraft("");
    setSending(false);
  }

  return (
    <div
      className="pt-3 space-y-3 animate-slide-up"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      {/* Loading skeleton */}
      {!loaded ? (
        <div className="space-y-2.5 animate-pulse">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-1.5 pt-0.5">
                <div className="h-2.5 bg-muted rounded w-1/4" />
                <div className="h-2.5 bg-muted rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {comments.length === 0 && (
            <p className="text-xs pl-1" style={{ color: "var(--muted-foreground)" }}>
              No comments yet — be first.
            </p>
          )}
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-2.5">
                <Avatar name={c.profiles?.display_name ?? null} size={28} badge={c.profiles?.badge} tier={c.profiles?.membership_tier} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-semibold truncate text-foreground">
                      {c.profiles?.display_name ?? "Member"}
                    </span>
                    <span className="text-[10px] flex-shrink-0" style={{ color: "var(--muted-foreground)" }}>
                      {timeAgo(c.created_at)}
                    </span>
                  </div>
                  <p className="text-sm leading-snug mt-0.5 break-words text-foreground">
                    {c.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Comment compose */}
      <div className="flex gap-2.5 items-center">
        <Avatar name={displayName} size={28} />
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitComment(); }}
            placeholder="Add a comment…"
            className="input w-full pr-11 text-sm"
            style={{ minHeight: 44 }}
          />
          <button
            onClick={submitComment}
            disabled={!draft.trim() || sending}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30"
            style={{
              width: 36, height: 36,
              color: draft.trim() ? "var(--primary)" : "var(--muted-foreground)",
            }}
            aria-label="Send comment"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M1.5 8h13M9 2.5l5.5 5.5L9 13.5"
                stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"
              />
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
  post:         Post;
  userId:       string;
  displayName:  string;
  index:        number;
  onLikeToggle: (postId: string, liked: boolean) => void;
}

function PostCard({ post, userId, displayName, index, onLikeToggle }: PostCardProps) {
  const [showComments,    setShowComments]    = useState(false);
  const [optimisticLiked, setOptimisticLiked] = useOptimistic(post.liked_by_me);
  const [optimisticCount, setOptimisticCount] = useOptimistic(post.likes_count);

  function handleLike() {
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
      style={{ animationDelay: `${Math.min(index * 50, 400)}ms` }}
    >
      {/* Author row */}
      <div className="flex items-center gap-3">
        <Avatar name={authorName} badge={post.profiles?.badge} tier={post.profiles?.membership_tier} />
        <div className="flex-1 min-w-0">
          <span
            className="font-semibold text-sm text-foreground"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {authorName}
          </span>
          <span
            className="text-[11px] ml-2"
            style={{ color: "var(--muted-foreground)" }}
          >
            {timeAgo(post.created_at)}
          </span>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
        {post.content}
      </p>

      {/* Image */}
      {post.image_url && (
        <div className="rounded-xl overflow-hidden -mx-1 relative" style={{ height: 320 }}>
          <Image
            src={post.image_url}
            alt="Post image"
            fill
            sizes="(max-width: 768px) 100vw, 600px"
            quality={78}
            className="object-cover"
          />
        </div>
      )}

      {/* Cigar tag */}
      {post.cigar_name && (
        <div
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
          style={{
            backgroundColor: "rgba(193,120,23,0.12)",
            border: "1px solid rgba(193,120,23,0.25)",
            color: "var(--primary)",
          }}
        >
          <CigarIcon size={11} />
          <span className="font-medium">{post.cigar_name}</span>
          {post.cigar_brand && (
            <span className="opacity-70">· {post.cigar_brand}</span>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-1 -mx-1">
        {/* Like button */}
        <button
          onClick={handleLike}
          className="flex items-center gap-1.5 px-3 rounded-xl transition-all active:scale-95"
          style={{
            minHeight: 44,
            color:           optimisticLiked ? "var(--ember)"            : "var(--muted-foreground)",
            backgroundColor: optimisticLiked ? "rgba(232,100,44,0.10)"  : "transparent",
          }}
          aria-label={optimisticLiked ? "Unlike post" : "Like post"}
          aria-pressed={optimisticLiked}
        >
          <svg width="19" height="19" viewBox="0 0 19 19" fill="none" aria-hidden="true">
            <path
              d="M9.5 16.5S2 12 2 7a4.5 4.5 0 017.5-3.35A4.5 4.5 0 0117 7C17 12 9.5 16.5 9.5 16.5z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              fill={optimisticLiked ? "currentColor" : "none"}
            />
          </svg>
          {optimisticCount > 0 && (
            <span className="text-xs font-semibold tabular-nums">{optimisticCount}</span>
          )}
        </button>

        {/* Comment toggle */}
        <button
          onClick={() => setShowComments((v) => !v)}
          className="flex items-center gap-1.5 px-3 rounded-xl transition-all active:scale-95"
          style={{
            minHeight: 44,
            color:           showComments ? "var(--accent)"           : "var(--muted-foreground)",
            backgroundColor: showComments ? "rgba(212,160,74,0.10)"  : "transparent",
          }}
          aria-label="Toggle comments"
          aria-expanded={showComments}
        >
          <svg width="19" height="19" viewBox="0 0 19 19" fill="none" aria-hidden="true">
            <path
              d="M2 4A1.5 1.5 0 013.5 2.5h12A1.5 1.5 0 0117 4v9a1.5 1.5 0 01-1.5 1.5H7L2 18V4z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
              fill={showComments ? "rgba(212,160,74,0.10)" : "none"}
            />
          </svg>
          {post.comments_count > 0 && (
            <span className="text-xs font-semibold tabular-nums">{post.comments_count}</span>
          )}
        </button>
      </div>

      {/* Comment thread — slides down on expand */}
      {showComments && (
        <CommentThread
          postId={post.id}
          userId={userId}
          displayName={displayName}
        />
      )}
    </article>
  );
}

/* ------------------------------------------------------------------
   Skeleton card
   ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div
      className="rounded-2xl p-4 space-y-3 animate-pulse"
      style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--muted)" }} />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3 rounded w-1/4" style={{ backgroundColor: "var(--muted)" }} />
          <div className="h-3 rounded w-full" style={{ backgroundColor: "var(--muted)" }} />
          <div className="h-3 rounded w-2/3" style={{ backgroundColor: "var(--muted)" }} />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="h-8 rounded-xl w-14" style={{ backgroundColor: "var(--muted)" }} />
        <div className="h-8 rounded-xl w-14" style={{ backgroundColor: "var(--muted)" }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Main lounge client
   ------------------------------------------------------------------ */

export interface LoungeClientProps {
  userId:      string;
  displayName: string;
}

export function LoungeClient({ userId, displayName }: LoungeClientProps) {
  const [posts,        setPosts]        = useState<Post[]>([]);
  const [pendingPosts, setPendingPosts] = useState<Post[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [hasMore,      setHasMore]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const offsetRef = useRef(0);
  const feedRef   = useRef<HTMLDivElement>(null);
  const supabase  = createClient();

  /* ── Fetch a page of posts ───────────────────────────────────── */
  const fetchPosts = useCallback(
    async (offset: number): Promise<Post[]> => {
      const { data } = await supabase
        .from("posts")
        .select("*, profiles!posts_user_id_fkey(display_name, avatar_url, badge, membership_tier)")
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
      return data.map((p) => ({
        ...p,
        liked_by_me: likedSet.has(p.id),
      })) as Post[];
    },
    [userId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* ── Initial load ────────────────────────────────────────────── */
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

  /* ── Realtime — queue new posts from other users ─────────────── */
  useEffect(() => {
    const channel = supabase
      .channel("lounge:posts:inserts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        (payload) => {
          const incoming = payload.new as Omit<Post, "profiles" | "liked_by_me">;
          if (incoming.user_id === userId) return; // already prepended optimistically
          supabase
            .from("profiles")
            .select("display_name, avatar_url, badge, membership_tier")
            .eq("id", incoming.user_id)
            .single()
            .then(({ data }) => {
              setPendingPosts((prev) => [
                { ...incoming, profiles: data, liked_by_me: false } as Post,
                ...prev,
              ]);
            });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Handlers ────────────────────────────────────────────────── */
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
    offsetRef.current += 1;
  }

  function revealPending() {
    setPosts((prev) => [...pendingPosts, ...prev]);
    setPendingPosts([]);
    feedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleLikeToggle(postId: string, liked: boolean) {
    if (liked) {
      await supabase.from("post_likes").insert({ post_id: postId, user_id: userId });
      await supabase.rpc("increment_likes", { post_id: postId });
    } else {
      await supabase
        .from("post_likes")
        .delete()
        .match({ post_id: postId, user_id: userId });
      await supabase.rpc("decrement_likes", { post_id: postId });
    }
    // Sync real count back
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
            : p,
        ),
      );
    }
  }

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
      {/* Scroll target for "reveal pending" */}
      <div ref={feedRef}>
        <h1
          className="text-3xl font-bold"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          The Lounge
        </h1>
      </div>

      {/* Compose */}
      <ComposeBox userId={userId} displayName={displayName} onPosted={handlePosted} />

      {/* "New posts" pill — floats above feed when realtime posts queue up */}
      {pendingPosts.length > 0 && (
        <div className="flex justify-center animate-slide-up">
          <button
            onClick={revealPending}
            className="flex items-center gap-2 rounded-full font-semibold text-sm transition-transform active:scale-95"
            style={{
              minHeight: 44,
              paddingInline: "1.125rem",
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
              boxShadow: "0 6px 20px rgba(193,120,23,0.4)",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path
                d="M6.5 11.5V1.5M1.5 6.5l5-5 5 5"
                stroke="currentColor" strokeWidth="1.7"
                strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
            {pendingPosts.length} new post{pendingPosts.length !== 1 ? "s" : ""}
          </button>
        </div>
      )}

      {/* Feed */}
      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : posts.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center space-y-2 animate-fade-in"
          style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
        >
          <p
            className="text-xl"
            style={{
              fontFamily: "var(--font-serif)",
              color: "var(--muted-foreground)",
            }}
          >
            The Lounge is quiet.
          </p>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Be the first to share a moment.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {posts.map((post, index) => (
              <PostCard
                key={post.id}
                post={post}
                userId={userId}
                displayName={displayName}
                index={index}
                onLikeToggle={handleLikeToggle}
              />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="btn btn-secondary px-8"
                style={{ minHeight: 44 }}
              >
                {loadingMore ? (
                  <span className="flex items-center gap-2">
                    <span
                      className="rounded-full border animate-spin"
                      style={{
                        width: 15, height: 15,
                        borderColor: "rgba(245,230,211,0.25)",
                        borderTopColor: "var(--foreground)",
                      }}
                    />
                    Loading…
                  </span>
                ) : "Load more"}
              </button>
            </div>
          )}

          {!hasMore && posts.length >= PAGE_SIZE && (
            <p
              className="text-center text-xs pt-2"
              style={{ color: "var(--muted-foreground)" }}
            >
              You&apos;ve reached the end. Time to light one up.
            </p>
          )}
        </>
      )}
    </div>
  );
}
