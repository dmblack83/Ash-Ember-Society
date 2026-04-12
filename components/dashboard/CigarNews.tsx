"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  DashboardSection,
  DashboardSkeleton,
} from "@/components/dashboard/dashboard-section";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface BlogPost {
  id: string;
  type: "blog" | "news_link";
  title: string;
  cover_image_url: string | null;
  excerpt: string | null;
  body: string | null;
  synopsis: string | null;
  source_name: string | null;
  source_url: string | null;
  published_at: string;
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60)                  return "just now";
  if (diff < 3600)                return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)               return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days < 7)                   return `${days} day${days !== 1 ? "s" : ""} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5)                  return `${weeks} week${weeks !== 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30.44);
  if (months < 12)                return `${months} month${months !== 1 ? "s" : ""} ago`;
  return `${Math.floor(months / 12)} year${Math.floor(months / 12) !== 1 ? "s" : ""} ago`;
}

/* ------------------------------------------------------------------
   Lightweight Markdown renderer
   ------------------------------------------------------------------ */

function parseInline(text: string): React.ReactNode {
  // Split on bold, italic, inline-code, and links
  const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(TOKEN);

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="text-xs px-1 py-0.5 rounded bg-white/10 font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (m) {
      return (
        <a
          key={i}
          href={m[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: "var(--gold)" }}
        >
          {m[1]}
        </a>
      );
    }
    return part;
  });
}

function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    /* Headings */
    if (line.startsWith("### ")) {
      nodes.push(
        <h3 key={i} className="text-base font-bold mt-4 mb-1">
          {parseInline(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={i} className="text-lg font-bold mt-4 mb-2" style={{ fontFamily: "var(--font-serif)" }}>
          {parseInline(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith("# ")) {
      nodes.push(
        <h1 key={i} className="text-xl font-bold mt-4 mb-2" style={{ fontFamily: "var(--font-serif)" }}>
          {parseInline(line.slice(2))}
        </h1>
      );

    /* Horizontal rule */
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      nodes.push(<hr key={i} className="my-4 border-white/20" />);

    /* Blockquote */
    } else if (line.startsWith("> ")) {
      nodes.push(
        <blockquote
          key={i}
          className="border-l-2 pl-4 italic text-muted-foreground my-2"
          style={{ borderColor: "var(--gold)" }}
        >
          {parseInline(line.slice(2))}
        </blockquote>
      );

    /* Unordered list — consume consecutive lines */
    } else if (/^[*-] /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[*-] /.test(lines[i])) {
        items.push(<li key={i}>{parseInline(lines[i].slice(2))}</li>);
        i++;
      }
      nodes.push(
        <ul key={`ul${i}`} className="list-disc pl-5 my-2 space-y-0.5 text-sm">
          {items}
        </ul>
      );
      continue; // i already advanced

    /* Ordered list — consume consecutive lines */
    } else if (/^\d+\. /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(<li key={i}>{parseInline(lines[i].replace(/^\d+\. /, ""))}</li>);
        i++;
      }
      nodes.push(
        <ol key={`ol${i}`} className="list-decimal pl-5 my-2 space-y-0.5 text-sm">
          {items}
        </ol>
      );
      continue;

    /* Blank line — visual gap */
    } else if (line.trim() === "") {
      nodes.push(<div key={i} className="h-2" />);

    /* Paragraph */
    } else {
      nodes.push(
        <p key={i} className="text-sm leading-relaxed my-1">
          {parseInline(line)}
        </p>
      );
    }

    i++;
  }

  return <div className="text-foreground">{nodes}</div>;
}

/* ------------------------------------------------------------------
   Branded placeholder cover (no image)
   ------------------------------------------------------------------ */

function PlaceholderCover() {
  return (
    <div
      className="w-full aspect-video flex items-center justify-center"
      style={{
        background: "linear-gradient(135deg, #1a1008 0%, #2d1b0a 60%, #3d2410 100%)",
      }}
    >
      {/* Ember glow */}
      <div
        className="absolute inset-0 rounded-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 70%, rgba(193,120,23,0.25) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      {/* Cigar icon */}
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        style={{ opacity: 0.5 }}
        aria-hidden="true"
      >
        <rect x="4" y="21" width="34" height="6" rx="3" fill="rgba(193,120,23,0.7)" />
        <rect x="38" y="22" width="6" height="4" rx="2" fill="rgba(193,120,23,0.4)" />
        <ellipse cx="5" cy="24" rx="2" ry="3" fill="rgba(239,120,50,0.6)" />
        {/* smoke wisps */}
        <path d="M6 19 Q8 14 6 10" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M10 17 Q13 11 10 7" stroke="rgba(255,255,255,0.15)" strokeWidth="1" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------
   Category badge
   Two variants:
   - "overlay"  (default) — absolute positioned, for use over images
   - "inline"             — inline-flex, for use in text rows
   ------------------------------------------------------------------ */

function CategoryBadge({
  type,
  variant = "overlay",
}: {
  type: "blog" | "news_link";
  variant?: "overlay" | "inline";
}) {
  const isNews = type === "news_link";
  const label  = isNews ? "News" : "Blog";
  const bg     = isNews ? "rgba(193,120,23,0.9)" : "rgba(220,80,30,0.9)";

  if (variant === "inline") {
    return (
      <span
        className="inline-flex items-center text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
        style={{ background: bg, color: "#fff" }}
      >
        {label}
      </span>
    );
  }

  // overlay variant — absolute, for placing on top of a cover image
  return (
    <span
      className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
      style={{
        background:     bg,
        color:          "#fff",
        backdropFilter: "blur(4px)",
      }}
    >
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------
   News card
   ------------------------------------------------------------------ */

function NewsCard({
  post,
  onTap,
}: {
  post: BlogPost;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="glass rounded-xl overflow-hidden flex flex-col text-left snap-start flex-shrink-0 w-[72vw] sm:w-[280px] transition-opacity active:opacity-70"
      style={{
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
      } as React.CSSProperties}
      aria-label={post.title}
    >
      {/* Cover image */}
      <div className="relative w-full aspect-video overflow-hidden flex-shrink-0">
        {post.cover_image_url ? (
          <img
            src={post.cover_image_url}
            alt={post.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <PlaceholderCover />
        )}
        <CategoryBadge type={post.type} />
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1 p-3 flex-1">
        {/* Title */}
        <p
          className="font-semibold leading-snug"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 13,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          } as React.CSSProperties}
        >
          {post.title}
        </p>

        {/* Excerpt / synopsis */}
        {post.type === "blog" && post.excerpt && (
          <p
            className="text-muted-foreground"
            style={{
              fontSize: 11,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            } as React.CSSProperties}
          >
            {post.excerpt}
          </p>
        )}
        {post.type === "news_link" && post.synopsis && (
          <p
            className="text-muted-foreground italic"
            style={{
              fontSize: 11,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            } as React.CSSProperties}
          >
            {post.synopsis}
          </p>
        )}
        {post.type === "news_link" && post.source_name && (
          <p
            className="font-semibold mt-0.5"
            style={{ fontSize: 10, color: "var(--gold)" }}
          >
            via {post.source_name}
          </p>
        )}

        {/* Date — pushed to bottom */}
        <p
          className="text-muted-foreground mt-auto pt-2"
          style={{ fontSize: 10 }}
        >
          {relativeTime(post.published_at)}
        </p>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------
   Bottom sheet
   ─────────────────────────────────────────────────────────────────
   - Opens at 85dvh, drag upward snaps to 96dvh (near-fullscreen)
   - Drag down > 100px dismisses
   - Scroll area is independently scrollable inside the sheet
   - For news_link: "Read Full Article" CTA is pinned above safe-area
   ------------------------------------------------------------------ */

function PostSheet({
  post,
  onClose,
}: {
  post: BlogPost;
  onClose: () => void;
}) {
  const sheetRef   = useRef<HTMLDivElement>(null);
  const startYRef  = useRef(0);
  const deltaRef   = useRef(0);
  const dragging   = useRef(false);
  const [sheetH, setSheetH] = useState<"85dvh" | "96dvh">("85dvh");

  /* Keyboard close */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  /* Lock body scroll */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* Drag handlers — only on the handle area */
  function onDragStart(e: React.TouchEvent) {
    startYRef.current = e.touches[0].clientY;
    deltaRef.current  = 0;
    dragging.current  = true;
  }

  function onDragMove(e: React.TouchEvent) {
    if (!dragging.current || !sheetRef.current) return;
    const delta = e.touches[0].clientY - startYRef.current;
    deltaRef.current = delta;
    // Only translate downward during drag (upward handled on release)
    if (delta > 0) {
      sheetRef.current.style.transition = "none";
      sheetRef.current.style.transform  = `translateY(${delta}px)`;
    }
  }

  function onDragEnd() {
    dragging.current = false;
    const delta = deltaRef.current;

    if (!sheetRef.current) return;

    if (delta > 100) {
      // Dismiss
      onClose();
    } else if (delta < -60) {
      // Expand to near-fullscreen
      sheetRef.current.style.transition = "transform 0.3s ease";
      sheetRef.current.style.transform  = "translateY(0)";
      setSheetH("96dvh");
    } else {
      // Snap back
      sheetRef.current.style.transition = "transform 0.3s ease";
      sheetRef.current.style.transform  = "translateY(0)";
    }
  }

  const isNews = post.type === "news_link";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={post.title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet panel — fixed height so content can scroll inside */}
      <div
        ref={sheetRef}
        className="relative flex flex-col rounded-t-2xl"
        style={{
          zIndex:           51,
          height:           sheetH,          // explicit height, not maxHeight
          background:       "var(--card)",
          border:           "1px solid var(--border)",
          borderBottom:     "none",
          transform:        "translateY(0)",
          transition:       "transform 0.3s ease, height 0.3s ease",
          willChange:       "transform",
        }}
      >
        {/* ── Drag handle + close button ────────────────────────── */}
        <div
          className="relative flex items-center justify-center flex-shrink-0 select-none"
          style={{
            paddingTop:    12,
            paddingBottom: 8,
            touchAction:   "none",
            cursor:        "grab",
          }}
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          aria-hidden="true"
        >
          {/* Pill */}
          <div
            className="w-10 h-1 rounded-full"
            style={{ background: "var(--muted-foreground)", opacity: 0.4 }}
          />
          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 flex items-center justify-center rounded-full transition-opacity hover:opacity-70 active:opacity-50"
            style={{
              width:      32,
              height:     32,
              background: "rgba(255,255,255,0.08)",
              top:        "50%",
              transform:  "translateY(-50%)",
            }}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* ── Header (badge + date + title + source) ────────────── */}
        <div className="flex-shrink-0 px-5 pb-3">
          {/* Badge + date row */}
          <div className="flex items-center gap-2 mb-2">
            <CategoryBadge type={post.type} variant="inline" />
            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
              {relativeTime(post.published_at)}
            </span>
          </div>

          {/* Title */}
          <h2
            className="font-bold leading-snug"
            style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}
          >
            {post.title}
          </h2>

          {/* News: source name below title */}
          {isNews && post.source_name && (
            <p className="mt-1" style={{ fontSize: 12, color: "var(--gold)" }}>
              via <span className="font-semibold">{post.source_name}</span>
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="flex-shrink-0 mx-5" style={{ height: 1, background: "var(--border)" }} />

        {/* ── Scrollable body ───────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {/* Cover image */}
          {post.cover_image_url && (
            <div
              className="relative w-full rounded-xl overflow-hidden mb-4"
              style={{ aspectRatio: "16/9" }}
            >
              <img
                src={post.cover_image_url}
                alt={post.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Blog: full markdown */}
          {!isNews && post.body && (
            <SimpleMarkdown content={post.body} />
          )}

          {/* News: synopsis */}
          {isNews && post.synopsis && (
            <p className="text-sm leading-relaxed text-muted-foreground" style={{ fontStyle: "italic" }}>
              {post.synopsis}
            </p>
          )}

          {/* Extra scroll breathing room at bottom (especially for news CTA) */}
          <div className="h-4" aria-hidden="true" />
        </div>

        {/* ── Pinned CTA for news_link ──────────────────────────── */}
        {isNews && post.source_url && (
          <div
            className="flex-shrink-0 px-5 pt-3"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 20px)" }}
          >
            <a
              href={post.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-xl font-semibold text-sm transition-opacity hover:opacity-80 active:opacity-60"
              style={{
                minHeight:      52,
                background:     "var(--primary)",
                color:          "#fff",
                textDecoration: "none",
              }}
            >
              Read Full Article
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        )}

        {/* Safe-area pad for blog posts (no CTA) */}
        {!isNews && (
          <div
            className="flex-shrink-0"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Placeholder card (no posts yet)
   ------------------------------------------------------------------ */

function EmptyCard() {
  return (
    <div
      className="glass rounded-xl overflow-hidden flex flex-col snap-start flex-shrink-0 w-[72vw] sm:w-[280px]"
    >
      <div className="relative w-full aspect-video overflow-hidden flex-shrink-0">
        <PlaceholderCover />
      </div>
      <div className="flex flex-col gap-2 p-3 flex-1 justify-center">
        <p
          className="font-semibold leading-snug text-muted-foreground"
          style={{ fontFamily: "var(--font-serif)", fontSize: 13 }}
        >
          News and updates coming soon.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   CigarNews — main export
   ------------------------------------------------------------------ */

export function CigarNews() {
  const [posts,   setPosts]   = useState<BlogPost[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [active,  setActive]  = useState<BlogPost | null>(null);

  const handleClose = useCallback(() => setActive(null), []);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();

        const { data, error } = await supabase
          .from("blog_posts")
          .select(
            "id, type, title, cover_image_url, excerpt, body, synopsis, source_name, source_url, published_at"
          )
          .not("published_at", "is", null)
          .lte("published_at", new Date().toISOString())
          .order("published_at", { ascending: false })
          .limit(6);

        if (error) throw error;
        setPosts((data as BlogPost[]) ?? []);
      } catch {
        setErrored(true);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  /* Loading */
  if (loading) {
    return (
      <DashboardSection title="Cigar News" sectionIndex={4}>
        <DashboardSkeleton height={200} />
      </DashboardSection>
    );
  }

  /* Query failed — hide section entirely */
  if (errored) return null;

  const hasPosts = posts && posts.length > 0;

  return (
    <>
      <DashboardSection title="Cigar News" sectionIndex={4}>
        {/* Break out of parent horizontal padding for edge-to-edge scroll */}
        <div className="-mx-4 sm:-mx-6">
          <div
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory pl-4 sm:pl-6 pb-3"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              WebkitOverflowScrolling: "touch",
            } as React.CSSProperties}
          >
            {hasPosts ? (
              <>
                {posts.map((post) => (
                  <NewsCard
                    key={post.id}
                    post={post}
                    onTap={() => setActive(post)}
                  />
                ))}
              </>
            ) : (
              <EmptyCard />
            )}

            {/* Right-edge spacer so last card doesn't flush the edge */}
            <div className="flex-shrink-0 w-4 sm:w-6" aria-hidden="true" />
          </div>
        </div>
      </DashboardSection>

      {/* Bottom sheet portal */}
      {active && <PostSheet post={active} onClose={handleClose} />}
    </>
  );
}
