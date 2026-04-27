"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/utils/supabase/client";
import type { BlogPost } from "@/components/dashboard/CigarNews";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface PostComment {
  id:         string;
  content:    string;
  created_at: string;
  user:       { display_name: string | null; avatar_url: string | null } | null;
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const d = Math.floor(diff / 86400);
  if (d < 7)   return `${d} day${d !== 1 ? "s" : ""} ago`;
  const w = Math.floor(d / 7);
  if (w < 5)   return `${w} week${w !== 1 ? "s" : ""} ago`;
  const mo = Math.floor(d / 30.44);
  if (mo < 12) return `${mo} month${mo !== 1 ? "s" : ""} ago`;
  const y = Math.floor(mo / 12);
  return `${y} year${y !== 1 ? "s" : ""} ago`;
}

/** Resolve post type robustly -- handles null or unexpected values */
function resolveType(type: string | null): "blog" | "news_link" {
  if (type === "news_link") return "news_link";
  return "blog"; // default / fallback
}

/* ------------------------------------------------------------------
   Lightweight Markdown renderer
   ------------------------------------------------------------------ */

function parseInline(text: string): React.ReactNode {
  const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(TOKEN);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="text-xs px-1 py-0.5 rounded bg-white/10 font-mono">{part.slice(1, -1)}</code>;
    const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (m) return <a key={i} href={m[2]} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--gold)" }}>{m[1]}</a>;
    return part;
  });
}

function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      nodes.push(<h3 key={i} className="text-base font-bold mt-4 mb-1">{parseInline(line.slice(4))}</h3>);
    } else if (line.startsWith("## ")) {
      nodes.push(<h2 key={i} className="text-lg font-bold mt-4 mb-2" style={{ fontFamily: "var(--font-serif)" }}>{parseInline(line.slice(3))}</h2>);
    } else if (line.startsWith("# ")) {
      nodes.push(<h1 key={i} className="text-xl font-bold mt-4 mb-2" style={{ fontFamily: "var(--font-serif)" }}>{parseInline(line.slice(2))}</h1>);
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      nodes.push(<hr key={i} className="my-4 border-white/20" />);
    } else if (line.startsWith("> ")) {
      nodes.push(<blockquote key={i} className="border-l-2 pl-4 italic text-muted-foreground my-2" style={{ borderColor: "var(--gold)" }}>{parseInline(line.slice(2))}</blockquote>);
    } else if (/^[*-] /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[*-] /.test(lines[i])) {
        items.push(<li key={i}>{parseInline(lines[i].slice(2))}</li>);
        i++;
      }
      nodes.push(<ul key={`ul${i}`} className="list-disc pl-5 my-2 space-y-0.5 text-sm">{items}</ul>);
      continue;
    } else if (/^\d+\. /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(<li key={i}>{parseInline(lines[i].replace(/^\d+\. /, ""))}</li>);
        i++;
      }
      nodes.push(<ol key={`ol${i}`} className="list-decimal pl-5 my-2 space-y-0.5 text-sm">{items}</ol>);
      continue;
    } else if (line.trim() === "") {
      nodes.push(<div key={i} className="h-2" />);
    } else {
      nodes.push(<p key={i} className="text-sm leading-relaxed my-1">{parseInline(line)}</p>);
    }
    i++;
  }
  return <div className="text-foreground">{nodes}</div>;
}

/* ------------------------------------------------------------------
   Placeholder cover
   ------------------------------------------------------------------ */

function PlaceholderCover() {
  return (
    <div
      className="relative w-full aspect-video flex items-center justify-center overflow-hidden"
      style={{ background: "linear-gradient(135deg, #1a1008 0%, #2d1b0a 60%, #3d2410 100%)" }}
    >
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 60% 40% at 50% 70%, rgba(193,120,23,0.25) 0%, transparent 70%)" }}
      />
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ opacity: 0.5 }} aria-hidden="true">
        <rect x="4"  y="21" width="34" height="6" rx="3" fill="rgba(193,120,23,0.7)" />
        <rect x="38" y="22" width="6"  height="4" rx="2" fill="rgba(193,120,23,0.4)" />
        <ellipse cx="5" cy="24" rx="2" ry="3" fill="rgba(239,120,50,0.6)" />
        <path d="M6 19 Q8 14 6 10"   stroke="rgba(255,255,255,0.2)"  strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M10 17 Q13 11 10 7" stroke="rgba(255,255,255,0.15)" strokeWidth="1"   fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------
   Category badge
   variant "overlay" = absolute, for card images
   variant "inline"  = inline-flex, for text rows in the sheet
   ------------------------------------------------------------------ */

function CategoryBadge({
  type,
  variant = "overlay",
}: {
  type:     string | null;
  variant?: "overlay" | "inline";
}) {
  const resolved = resolveType(type);
  const isNews   = resolved === "news_link";
  const label    = isNews ? "News" : "Blog";
  const bg       = isNews ? "rgba(193,120,23,0.9)" : "rgba(220,80,30,0.9)";

  const shared = {
    fontSize:        10,
    fontWeight:      700,
    textTransform:   "uppercase" as const,
    letterSpacing:   "0.08em",
    padding:         "2px 8px",
    borderRadius:    9999,
    background:      bg,
    color:           "#fff",
  };

  if (variant === "inline") {
    return <span style={{ ...shared, display: "inline-flex", alignItems: "center" }}>{label}</span>;
  }
  return (
    <span style={{ ...shared, position: "absolute", top: 8, left: 8, backdropFilter: "blur(4px)" }}>
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------
   News card (horizontal scroll row)
   ------------------------------------------------------------------ */

function NewsCard({ post, onTap }: { post: BlogPost; onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="glass rounded-xl overflow-hidden flex flex-col text-left snap-start flex-shrink-0 w-[72vw] sm:w-[280px] transition-opacity active:opacity-70"
      style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent", border: "none", padding: 0, cursor: "pointer" } as React.CSSProperties}
      aria-label={post.title}
    >
      <div className="relative w-full aspect-video overflow-hidden flex-shrink-0">
        {post.cover_image_url
          ? <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover" loading="lazy" />
          : <PlaceholderCover />
        }
        <CategoryBadge type={post.type} variant="overlay" />
      </div>
      <div className="flex flex-col gap-1 p-3 flex-1">
        <p className="font-semibold leading-snug"
          style={{ fontFamily: "var(--font-serif)", fontSize: 13, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
          {post.title}
        </p>
        {resolveType(post.type) === "blog" && post.excerpt && (
          <p className="text-muted-foreground"
            style={{ fontSize: 11, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
            {post.excerpt}
          </p>
        )}
        {resolveType(post.type) === "news_link" && (post.synopsis || post.excerpt) && (
          <p className="text-muted-foreground italic"
            style={{ fontSize: 11, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
            {post.synopsis ?? post.excerpt}
          </p>
        )}
        {resolveType(post.type) === "news_link" && post.source_name && (
          <p className="font-semibold mt-0.5" style={{ fontSize: 10, color: "var(--gold)" }}>
            via {post.source_name}
          </p>
        )}
        <p className="text-muted-foreground mt-auto pt-2" style={{ fontSize: 10 }}>
          {relativeTime(post.published_at)}
        </p>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------
   Like button
   ------------------------------------------------------------------ */

function LikeButton({
  postId,
  userId,
}: {
  postId: string;
  userId: string | null;
}) {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);
  const [busy,  setBusy]  = useState(false);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    Promise.all([
      supabase
        .from("blog_post_reactions")
        .select("id", { count: "exact", head: true })
        .eq("post_id", postId)
        .eq("type", "like"),
      supabase
        .from("blog_post_reactions")
        .select("id")
        .eq("post_id", postId)
        .eq("user_id", userId)
        .eq("type", "like")
        .maybeSingle(),
    ]).then(([countRes, ownRes]) => {
      setCount(countRes.count ?? 0);
      setLiked(!!ownRes.data);
    });
  }, [postId, userId]);

  async function toggle() {
    if (!userId || busy) return;
    setBusy(true);
    const supabase = createClient();

    if (liked) {
      setLiked(false);
      setCount((c) => Math.max(0, c - 1));
      await supabase
        .from("blog_post_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId)
        .eq("type", "like");
    } else {
      setLiked(true);
      setCount((c) => c + 1);
      await supabase
        .from("blog_post_reactions")
        .insert({ post_id: postId, user_id: userId, type: "like" });
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!userId || busy}
      className="flex items-center gap-1.5 transition-opacity active:opacity-60"
      style={{
        background:              "none",
        border:                  "none",
        cursor:                  userId ? "pointer" : "default",
        padding:                 "8px 4px",
        opacity:                 busy ? 0.6 : 1,
        touchAction:             "manipulation",
        WebkitTapHighlightColor: "transparent",
      } as React.CSSProperties}
      aria-label={liked ? "Unlike" : "Like"}
    >
      <svg
        width="20" height="20" viewBox="0 0 20 20"
        fill={liked ? "var(--gold)" : "none"}
        aria-hidden="true"
        style={{ transition: "fill 0.15s ease" }}
      >
        <path
          d="M10 17s-7-4.35-7-9a4 4 0 017-2.65A4 4 0 0117 8c0 4.65-7 9-7 9z"
          stroke={liked ? "var(--gold)" : "var(--muted-foreground)"}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span style={{ fontSize: 13, color: liked ? "var(--gold)" : "var(--muted-foreground)", fontWeight: 500 }}>
        {count > 0 ? count : ""}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------
   Comment thread
   ------------------------------------------------------------------ */

function CommentThread({
  postId,
  userId,
  userName,
}: {
  postId:   string;
  userId:   string | null;
  userName: string;
}) {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [draft,    setDraft]    = useState("");
  const [sending,  setSending]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("blog_post_comments")
      .select("id, content, created_at, user:profiles(display_name, avatar_url)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setComments((data as unknown as PostComment[]) ?? []);
        setLoading(false);
      });
  }, [postId]);

  async function submit() {
    const text = draft.trim();
    if (!text || !userId || sending) return;
    setSending(true);
    setDraft("");

    const supabase = createClient();
    const { data } = await supabase
      .from("blog_post_comments")
      .insert({ post_id: postId, user_id: userId, content: text })
      .select("id, content, created_at, user:profiles(display_name, avatar_url)")
      .single();

    if (data) {
      setComments((prev) => [...prev, data as unknown as PostComment]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
    setSending(false);
  }

  return (
    <div className="flex flex-col gap-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
      {/* Comment list */}
      {loading ? (
        <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Loading comments...</p>
      ) : comments.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>No comments yet. Be the first!</p>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              {/* Avatar */}
              <div
                className="flex-shrink-0 rounded-full flex items-center justify-center"
                style={{ width: 28, height: 28, background: "rgba(193,120,23,0.25)", overflow: "hidden" }}
              >
                {c.user?.avatar_url ? (
                  <img src={c.user.avatar_url} alt="" className="block w-full h-full object-cover" loading="lazy" />
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gold)" }}>
                    {(c.user?.display_name ?? "?")[0].toUpperCase()}
                  </span>
                )}
              </div>
              {/* Bubble */}
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>
                    {c.user?.display_name ?? "Member"}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>
                    {relativeTime(c.created_at)}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: "var(--foreground)", lineHeight: 1.5 }}>{c.content}</p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Compose */}
      {userId && (
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Add a comment..."
            disabled={sending}
            className="flex-1 rounded-xl px-3 text-sm"
            style={{
              minHeight:  40,
              background: "rgba(255,255,255,0.06)",
              border:     "1px solid var(--border)",
              color:      "var(--foreground)",
              outline:    "none",
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || sending}
            className="flex items-center justify-center rounded-xl transition-opacity active:opacity-60"
            style={{
              width:       40,
              height:      40,
              flexShrink:  0,
              background:  draft.trim() ? "var(--primary)" : "rgba(255,255,255,0.06)",
              border:      "none",
              cursor:      draft.trim() ? "pointer" : "default",
              opacity:     sending ? 0.5 : 1,
              touchAction: "manipulation",
            } as React.CSSProperties}
            aria-label="Send comment"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M14 8H2M9 3l5 5-5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Reaction bar -- likes + comment toggle
   ------------------------------------------------------------------ */

function ReactionBar({
  post,
  userId,
  userName,
}: {
  post:     BlogPost;
  userId:   string | null;
  userName: string;
}) {
  const [commentCount, setCommentCount] = useState(0);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("blog_post_comments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", post.id)
      .then(({ count }) => setCommentCount(count ?? 0));
  }, [post.id]);

  return (
    <div className="flex flex-col gap-0" style={{ borderTop: "1px solid var(--border)" }}>
      {/* Icon row */}
      <div className="flex items-center gap-4 px-5 py-2">
        <LikeButton postId={post.id} userId={userId} />

        {/* Comment toggle */}
        <button
          type="button"
          onClick={() => setShowComments((s) => !s)}
          className="flex items-center gap-1.5 transition-opacity active:opacity-60"
          style={{
            background:              "none",
            border:                  "none",
            cursor:                  "pointer",
            padding:                 "8px 4px",
            touchAction:             "manipulation",
            WebkitTapHighlightColor: "transparent",
          } as React.CSSProperties}
          aria-label="Toggle comments"
          aria-expanded={showComments}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M2 4.5A1.5 1.5 0 013.5 3h13A1.5 1.5 0 0118 4.5v8A1.5 1.5 0 0116.5 14H7l-4 4V4.5z"
              stroke={showComments ? "var(--gold)" : "var(--muted-foreground)"}
              strokeWidth="1.5"
              strokeLinejoin="round"
              fill={showComments ? "rgba(193,120,23,0.15)" : "none"}
            />
          </svg>
          <span style={{ fontSize: 13, color: showComments ? "var(--gold)" : "var(--muted-foreground)", fontWeight: 500 }}>
            {commentCount > 0 ? commentCount : ""}
          </span>
        </button>
      </div>

      {/* Comment thread -- smooth expand */}
      <div
        style={{
          overflow:       "hidden",
          maxHeight:      showComments ? 600 : 0,
          transition:     "max-height 0.3s ease",
          paddingLeft:    20,
          paddingRight:   20,
          paddingBottom:  showComments ? 16 : 0,
        }}
      >
        {showComments && (
          <CommentThread postId={post.id} userId={userId} userName={userName} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Bottom sheet
   Mobile  : slides up from bottom, covers 100dvh, drag to dismiss
   Desktop : centered modal 600px x 85vh, rounded all sides
   ------------------------------------------------------------------ */

function PostSheet({
  post,
  userId,
  userName,
  onClose,
}: {
  post:     BlogPost;
  userId:   string | null;
  userName: string;
  onClose:  () => void;
}) {
  const sheetRef    = useRef<HTMLDivElement>(null);
  const startYRef   = useRef(0);
  const deltaRef    = useRef(0);
  const [visible,   setVisible]   = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [mounted,   setMounted]   = useState(false);

  const isNews = resolveType(post.type) === "news_link";

  /* Detect desktop once on mount */
  useEffect(() => {
    setIsDesktop(window.matchMedia("(min-width: 640px)").matches);
  }, []);

  /* Slide-in on mount */
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /* Keyboard close */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  /* Mount guard (needed for createPortal) */
  useEffect(() => { setMounted(true); }, []);

  /* Lock body scroll (iOS-safe: position:fixed approach) */
  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top      = `-${scrollY}px`;
    document.body.style.width    = "100%";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.position = "";
      document.body.style.top      = "";
      document.body.style.width    = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, []);

  /* Drag handlers (mobile only, handle area) */
  function onDragStart(e: React.TouchEvent) {
    if (isDesktop) return;
    startYRef.current = e.touches[0].clientY;
    deltaRef.current  = 0;
  }
  function onDragMove(e: React.TouchEvent) {
    if (isDesktop || !sheetRef.current) return;
    const delta = e.touches[0].clientY - startYRef.current;
    deltaRef.current = delta;
    if (delta > 0) {
      sheetRef.current.style.transition = "none";
      sheetRef.current.style.transform  = `translateY(${delta}px)`;
    }
  }
  function onDragEnd() {
    if (isDesktop || !sheetRef.current) return;
    if (deltaRef.current > 100) {
      onClose();
    } else {
      sheetRef.current.style.transition = "transform 0.3s ease";
      sheetRef.current.style.transform  = "translateY(0)";
    }
  }

  /* ── Styles ──────────────────────────────────────────────────── */
  const mobileSheet: React.CSSProperties = {
    position:      "fixed",
    bottom:        0,
    left:          0,
    right:         0,
    height:        "100dvh",
    zIndex:        51,
    display:       "flex",
    flexDirection: "column",
    background:    "var(--card)",
    border:        "1px solid var(--border)",
    borderBottom:  "none",
    borderRadius:  "16px 16px 0 0",
    transform:     visible ? "translateY(0)" : "translateY(100%)",
    transition:    "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
    willChange:    "transform",
    overflow:      "hidden",
  };

  const desktopSheet: React.CSSProperties = {
    position:      "fixed",
    top:           "50%",
    left:          "50%",
    transform:     visible ? "translate(-50%, -50%)" : "translate(-50%, calc(-50% + 32px))",
    width:         600,
    maxWidth:      "calc(100vw - 32px)",
    height:        "85vh",
    zIndex:        51,
    display:       "flex",
    flexDirection: "column",
    background:    "var(--card)",
    border:        "1px solid var(--border)",
    borderRadius:  16,
    opacity:       visible ? 1 : 0,
    transition:    "transform 0.3s ease, opacity 0.3s ease",
    willChange:    "transform, opacity",
    overflow:      "hidden",
  };

  const content = (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label={post.title}
      style={isDesktop ? desktopSheet : mobileSheet}
    >
      {/* ── Drag handle + close ───────────────────────────────────── */}
      <div
        className="relative flex items-center justify-center flex-shrink-0"
        style={{
          paddingTop:    24,
          paddingBottom: 12,
          touchAction:   "none",
          cursor:        isDesktop ? "default" : "grab",
          flexShrink:    0,
        }}
        onTouchStart={onDragStart}
        onTouchMove={onDragMove}
        onTouchEnd={onDragEnd}
        aria-hidden="true"
      >
        {/* Pill */}
        {!isDesktop && (
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--muted-foreground)", opacity: 0.35 }} />
        )}
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 flex items-center justify-center rounded-full transition-opacity hover:opacity-80 active:opacity-50"
          style={{
            width:       44,
            height:      44,
            background:  "rgba(255,255,255,0.14)",
            border:      "1px solid rgba(255,255,255,0.18)",
            cursor:      "pointer",
            top:         "50%",
            transform:   "translateY(-50%)",
            touchAction: "manipulation",
          } as React.CSSProperties}
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M12 4L4 12M4 4l8 8" stroke="var(--foreground)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* ── Non-scrolling header ─────────────────────────────────── */}
      <div className="flex-shrink-0 px-5 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
        {/* Badge + date */}
        <div className="flex items-center gap-2 mb-2">
          <CategoryBadge type={post.type} variant="inline" />
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
            {relativeTime(post.published_at)}
          </span>
        </div>

        {/* Title */}
        <h2
          className="font-bold leading-snug line-clamp-3"
          style={{ fontFamily: "var(--font-serif)", fontSize: 20, color: "var(--foreground)" }}
        >
          {post.title}
        </h2>

        {/* Source (news only) */}
        {isNews && post.source_name && (
          <p className="mt-1" style={{ fontSize: 12, color: "var(--gold)" }}>
            via <span className="font-semibold">{post.source_name}</span>
            {post.published_at && (
              <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>
                {" "}· {new Date(post.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
              </span>
            )}
          </p>
        )}
      </div>

      {/* ── Scrollable body ─────────────────────────────────────── */}
      <div className="overflow-y-auto max-h-[70vh]" style={{ padding: "16px 20px", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
        {/* Cover image */}
        {post.cover_image_url && (
          <div className="relative w-full rounded-xl overflow-hidden mb-4" style={{ aspectRatio: "16/9" }}>
            <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover" loading="lazy" />
          </div>
        )}

        {/* Body content
            Blog  : body -> excerpt -> synopsis -> fallback
            News  : synopsis -> excerpt -> fallback               */}
        {isNews ? (
          <p className="text-sm leading-relaxed text-muted-foreground" style={{ fontStyle: "italic" }}>
            {post.synopsis?.trim() || post.excerpt?.trim() || post.body?.trim() || "No preview available."}
          </p>
        ) : (() => {
          const bodyContent = post.body?.trim() || post.excerpt?.trim() || post.synopsis?.trim();
          if (!bodyContent) {
            return <p className="text-sm text-muted-foreground italic">No content available.</p>;
          }
          if (bodyContent === post.body?.trim()) {
            return <SimpleMarkdown content={bodyContent} />;
          }
          return (
            <p className="text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
              {bodyContent}
            </p>
          );
        })()}

        {/* Breathing room */}
        <div className="h-4" aria-hidden="true" />
      </div>

      {/* ── Reactions (likes + comments) ─────────────────────────── */}
      <ReactionBar post={post} userId={userId} userName={userName} />

      {/* ── Pinned CTA for news_link ──────────────────────────────── */}
      {isNews && post.source_url && (
        <div
          className="flex-shrink-0 px-5 pt-3"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 20px)", borderTop: "1px solid var(--border)" }}
        >
          <a
            href={post.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-xl font-semibold text-sm transition-opacity hover:opacity-80 active:opacity-60"
            style={{ minHeight: 52, background: "var(--primary)", color: "#fff", textDecoration: "none" }}
          >
            Read Full Article
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      )}

      {/* Safe-area pad for blog posts */}
      {!isNews && (
        <div className="flex-shrink-0" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)" }} aria-hidden="true" />
      )}
    </div>
  );

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: 9999 }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background:           "rgba(0,0,0,0.72)",
          backdropFilter:       "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          opacity:              visible ? 1 : 0,
          transition:           "opacity 0.3s ease",
        }}
        onClick={onClose}
        aria-hidden="true"
      />
      {content}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------
   Empty card
   ------------------------------------------------------------------ */

function EmptyCard() {
  return (
    <div className="glass rounded-xl overflow-hidden flex flex-col snap-start flex-shrink-0 w-[72vw] sm:w-[280px]">
      <PlaceholderCover />
      <div className="flex flex-col gap-2 p-3 flex-1 justify-center">
        <p className="font-semibold leading-snug text-muted-foreground" style={{ fontFamily: "var(--font-serif)", fontSize: 13 }}>
          News and updates coming soon.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   CigarNewsClient

   Receives server-fetched posts as props; renders immediately.
   Keeps "use client" for: PostSheet open/close state, drag-to-dismiss,
   LikeButton optimistic mutations, CommentThread fetch + submit.
   ------------------------------------------------------------------ */

interface CigarNewsClientProps {
  initialPosts:   BlogPost[];
  membershipTier: string;
  userId:         string | null;
  userName:       string;
}

export function CigarNewsClient({
  initialPosts,
  userId,
  userName,
}: CigarNewsClientProps) {
  const [active,     setActive]     = useState<BlogPost | null>(null);
  const handleClose = useCallback(() => setActive(null), []);

  const hasPosts = initialPosts.length > 0;

  return (
    <>
      {/* Horizontal scroll row */}
      <div className="-mx-4 sm:-mx-6">
        <div
          className="flex gap-3 overflow-x-auto snap-x snap-mandatory pl-4 sm:pl-6 pb-3"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          {hasPosts
            ? initialPosts.map((post) => (
                <NewsCard key={post.id} post={post} onTap={() => setActive(post)} />
              ))
            : <EmptyCard />
          }
          <div className="flex-shrink-0 w-4 sm:w-6" aria-hidden="true" />
        </div>
      </div>

      {/* Post detail sheet */}
      {active && (
        <PostSheet
          post={active}
          userId={userId}
          userName={userName}
          onClose={handleClose}
        />
      )}
    </>
  );
}
