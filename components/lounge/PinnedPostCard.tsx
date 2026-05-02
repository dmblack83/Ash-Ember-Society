"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AvatarFrame } from "@/components/ui/AvatarFrame";
import { resolveBadge } from "@/lib/badge";
import { InlinePost } from "./InlinePost";
import type { PostItem } from "./InlinePost";

interface Props {
  post:         PostItem;
  initialLiked: boolean;
  userId:       string;
  isFeedback:   boolean;
  onDelete:     (postId: string) => void;
}

function initials(name?: string | null): string {
  if (!name) return "M";
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "M";
}

function relativeTime(iso: string): string {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return ""; }
}

function Avatar({
  name, avatarUrl, size = 36, badge, tier,
}: { name?: string | null; avatarUrl?: string | null; size?: number; badge?: string | null; tier?: string | null }) {
  const resolved = resolveBadge(badge, tier);
  const inner = avatarUrl ? (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", border: "1px solid var(--border)", flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatarUrl} alt={name ?? "Member"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </div>
  ) : (
    <div className="flex items-center justify-center rounded-full shrink-0 text-sm font-semibold"
      style={{ width: size, height: size, background: "var(--secondary)", color: "var(--muted-foreground)" }}>
      {initials(name)}
    </div>
  );
  return <AvatarFrame badge={resolved} size={size}>{inner}</AvatarFrame>;
}

function PinIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5l1.6 4.2 4.4.4-3.4 2.9 1.1 4.4L8 11l-3.7 2.4 1.1-4.4L2 6.1l4.4-.4L8 1.5z"
        fill="currentColor" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PinnedPostCard({ post, initialLiked, userId, isFeedback, onDelete }: Props) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <div style={{ position: "relative" }}>
        {/* Pinned indicator + collapse handle, anchored to expanded card */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest"
          style={{
            position:                "absolute",
            top:                     -10,
            left:                    12,
            zIndex:                  1,
            padding:                 "2px 8px",
            borderRadius:            999,
            background:              "var(--card)",
            color:                   "var(--gold,#D4A04A)",
            border:                  "1px solid var(--border)",
            cursor:                  "pointer",
            touchAction:             "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
          aria-expanded
          aria-label="Collapse pinned post"
        >
          <PinIcon />
          Pinned
          <Chevron open />
        </button>
        <InlinePost
          post={post}
          initialLiked={initialLiked}
          userId={userId}
          isFeedback={isFeedback}
          onDelete={onDelete}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="w-full flex items-center gap-3 text-left"
      style={{
        backgroundColor:         "var(--card)",
        border:                  "1px solid var(--border)",
        borderRadius:            14,
        padding:                 "12px 14px",
        cursor:                  "pointer",
        touchAction:             "manipulation",
        WebkitTapHighlightColor: "transparent",
        boxShadow:               "0 0 0 1px rgba(212,160,74,0.15) inset",
      }}
      aria-expanded={false}
      aria-label={`Expand pinned post: ${post.title}`}
    >
      <Avatar
        name={post.author?.display_name}
        avatarUrl={post.author?.avatar_url}
        size={36}
        badge={post.author?.badge}
        tier={post.author?.membership_tier}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest"
            style={{ color: "var(--gold,#D4A04A)" }}
          >
            <PinIcon />
            Pinned
          </span>
          <span className="text-xs font-semibold truncate" style={{ color: "var(--foreground)" }}>
            {post.author?.display_name ?? "Member"}
          </span>
          <span className="text-xs flex-shrink-0" style={{ color: "var(--muted-foreground)" }}>
            · {relativeTime(post.created_at)}
          </span>
        </div>
        <p
          className="font-serif font-semibold text-sm leading-snug truncate"
          style={{ color: "var(--foreground)" }}
        >
          {post.title}
        </p>
      </div>
      <span style={{ color: "var(--muted-foreground)", flexShrink: 0 }}>
        <Chevron open={false} />
      </span>
    </button>
  );
}
