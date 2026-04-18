"use client";

import { useRouter } from "next/navigation";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

export interface LoungePost {
  id:             string;
  content:        string;
  likes_count:    number;
  comments_count: number;
  created_at:     string;
  user: {
    display_name: string | null;
    avatar_url:   string | null;
  } | null;
}

/* ------------------------------------------------------------------
   Avatar — initials fallback
   ------------------------------------------------------------------ */

function Avatar({ src, name }: { src: string | null; name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={28}
        height={28}
        style={{
          width:        28,
          height:       28,
          borderRadius: "50%",
          objectFit:    "cover",
          flexShrink:   0,
        }}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{
        width:           28,
        height:          28,
        borderRadius:    "50%",
        background:      "rgba(201,168,76,0.20)",
        border:          "1px solid rgba(201,168,76,0.35)",
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        fontSize:        10,
        fontWeight:      700,
        color:           "#C9A84C",
        flexShrink:      0,
        letterSpacing:   "0.02em",
      }}
    >
      {initials || "?"}
    </div>
  );
}

/* ------------------------------------------------------------------
   Single post row
   ------------------------------------------------------------------ */

function PostRow({
  post,
  isLast,
  onClick,
}: {
  post:    LoungePost;
  isLast:  boolean;
  onClick: () => void;
}) {
  const name = post.user?.display_name ?? "Member";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display:         "flex",
        alignItems:      "center",
        gap:             10,
        width:           "100%",
        minHeight:       56,
        padding:         "10px 0",
        background:      "none",
        border:          "none",
        borderBottom:    isLast ? "none" : "1px solid rgba(255,255,255,0.07)",
        cursor:          "pointer",
        textAlign:       "left",
        WebkitTapHighlightColor: "transparent",
      } as React.CSSProperties}
    >
      {/* Avatar */}
      <Avatar src={post.user?.avatar_url ?? null} name={name} />

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin:        0,
            fontSize:      11,
            fontWeight:    700,
            color:         "var(--foreground)",
            lineHeight:    1.3,
            whiteSpace:    "nowrap",
            overflow:      "hidden",
            textOverflow:  "ellipsis",
          }}
        >
          {name}
        </p>
        <p
          style={{
            margin:        0,
            marginTop:     2,
            fontSize:      10,
            color:         "var(--muted-foreground)",
            lineHeight:    1.4,
            whiteSpace:    "nowrap",
            overflow:      "hidden",
            textOverflow:  "ellipsis",
          }}
        >
          {post.content}
        </p>
      </div>

      {/* Counts */}
      <div
        style={{
          display:        "flex",
          alignItems:     "center",
          gap:            10,
          flexShrink:     0,
        }}
      >
        {/* Likes */}
        <span
          style={{
            display:    "flex",
            alignItems: "center",
            gap:        3,
            fontSize:   10,
            color:      "var(--muted-foreground)",
          }}
        >
          {/* Heart icon */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {post.likes_count}
        </span>

        {/* Comments */}
        <span
          style={{
            display:    "flex",
            alignItems: "center",
            gap:        3,
            fontSize:   10,
            color:      "var(--muted-foreground)",
          }}
        >
          {/* Chat bubble icon */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {post.comments_count}
        </span>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------
   TrendingLounge — main export

   Receives initial posts as a prop (server-fetched in home/page.tsx).
   Keeps "use client" for useRouter navigation.
   ------------------------------------------------------------------ */

export function TrendingLounge({ initialPosts }: { initialPosts: LoungePost[] }) {
  const router = useRouter();

  // No posts in the last 7 days — hide the section entirely
  if (initialPosts.length === 0) return null;

  return (
    <section
      className="animate-fade-in"
      style={{ animationDelay: "200ms" }}
      aria-label="Trending in The Lounge"
    >
      {/* Glass card */}
      <div
        className="glass"
        style={{
          borderRadius: "var(--radius)",
          padding:      "14px 16px 0",
        }}
      >
        {/* Header */}
        <div
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            marginBottom:   10,
          }}
        >
          <h2
            style={{
              margin:        0,
              fontSize:      13,
              fontWeight:    700,
              color:         "var(--foreground)",
              letterSpacing: "0.01em",
            }}
          >
            Trending in The Lounge
          </h2>

          {/* Flame badge — shows the section is hot */}
          <span
            aria-hidden="true"
            style={{
              fontSize:    14,
              lineHeight:  1,
              marginRight: 2,
            }}
          >
            🔥
          </span>
        </div>

        {/* Post list */}
        <div>
          {initialPosts.map((post, i) => (
            <PostRow
              key={post.id}
              post={post}
              isLast={i === initialPosts.length - 1}
              onClick={() => router.push("/lounge")}
            />
          ))}
        </div>

        {/* Footer CTA */}
        <div
          style={{
            padding:      "10px 0 14px",
            borderTop:    "1px solid rgba(255,255,255,0.07)",
            textAlign:    "center",
          }}
        >
          <button
            type="button"
            onClick={() => router.push("/lounge")}
            style={{
              background:  "none",
              border:      "none",
              padding:     0,
              fontSize:    12,
              fontWeight:  600,
              color:       "#C9A84C",
              cursor:      "pointer",
              letterSpacing: "0.02em",
              WebkitTapHighlightColor: "transparent",
            } as React.CSSProperties}
          >
            View The Lounge →
          </button>
        </div>
      </div>
    </section>
  );
}
