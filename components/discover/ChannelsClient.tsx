"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createClient }        from "@/utils/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { AvatarFrame }         from "@/components/ui/AvatarFrame";
import { resolveBadge }        from "@/lib/badge";
import type { Channel, ChannelVideo } from "@/app/(app)/discover/channels/page";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface Comment {
  id:         string;
  content:    string;
  created_at: string;
  user_id:    string;
  display_name: string | null;
  avatar_url:   string | null;
  badge:        string | null;
  membership_tier: string | null;
}

interface Props {
  channels: Channel[];
  userId:   string;
  tier:     string;
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(s: number | null): string {
  if (!s) return "";
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return ""; }
}

function initials(name: string | null | undefined): string {
  if (!name) return "A";
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/* ------------------------------------------------------------------
   Avatar
   ------------------------------------------------------------------ */

function Avatar({
  name, avatarUrl, badge, tier, size = 32,
}: {
  name: string | null | undefined;
  avatarUrl: string | null | undefined;
  badge?: string | null;
  tier?:  string | null;
  size?:  number;
}) {
  const resolved = resolveBadge(badge, tier);

  const inner = avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt={name ?? ""}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  ) : (
    <div
      style={{
        width:           "100%",
        height:          "100%",
        borderRadius:    "50%",
        backgroundColor: "var(--secondary)",
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        fontSize:        size * 0.38,
        fontWeight:      700,
        color:           "var(--primary)",
        flexShrink:      0,
      }}
    >
      {initials(name)}
    </div>
  );

  return (
    <AvatarFrame badge={resolved} size={size}>
      {inner}
    </AvatarFrame>
  );
}

/* ------------------------------------------------------------------
   Comment bottom sheet
   ------------------------------------------------------------------ */

function CommentSheet({
  video,
  userId,
  onClose,
}: {
  video:   ChannelVideo;
  userId:  string;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [comments,  setComments]  = useState<Comment[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [body,      setBody]      = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast,     setToast]     = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Load comments
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("content_video_comments")
        .select("id, content, created_at, user_id, profiles(display_name, avatar_url, badge, membership_tier)")
        .eq("video_id", video.id)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      setComments(
        (data ?? []).map((c: any) => ({
          id:              c.id,
          content:         c.content,
          created_at:      c.created_at,
          user_id:         c.user_id,
          display_name:    c.profiles?.display_name ?? null,
          avatar_url:      c.profiles?.avatar_url   ?? null,
          badge:           c.profiles?.badge        ?? null,
          membership_tier: c.profiles?.membership_tier ?? null,
        }))
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id]);

  // Dismiss on backdrop click
  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  async function handleSubmit() {
    const text = body.trim();
    if (!text || submitting) return;
    setSubmitting(true);

    const { error } = await supabase
      .from("content_video_comments")
      .insert({ video_id: video.id, user_id: userId, content: text });

    if (error) {
      setToast("Failed to post comment");
      setSubmitting(false);
      return;
    }

    // Fetch own profile for optimistic display
    const { data: me } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, badge, membership_tier")
      .eq("id", userId)
      .single();

    const optimistic: Comment = {
      id:              crypto.randomUUID(),
      content:         text,
      created_at:      new Date().toISOString(),
      user_id:         userId,
      display_name:    me?.display_name    ?? null,
      avatar_url:      me?.avatar_url      ?? null,
      badge:           me?.badge           ?? null,
      membership_tier: me?.membership_tier ?? null,
    };

    setComments((prev) => [...prev, optimistic]);
    setBody("");
    setSubmitting(false);
  }

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position:        "fixed",
        inset:           0,
        zIndex:          60,
        backgroundColor: "rgba(0,0,0,0.6)",
        display:         "flex",
        alignItems:      "flex-end",
        justifyContent:  "center",
      }}
    >
      <div
        style={{
          backgroundColor: "var(--card)",
          borderRadius:    "20px 20px 0 0",
          width:           "100%",
          maxWidth:        672,
          maxHeight:       "85vh",
          display:         "flex",
          flexDirection:   "column",
          overflow:        "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            padding:        "16px 20px 12px",
            borderBottom:   "1px solid rgba(255,255,255,0.07)",
            flexShrink:     0,
          }}
        >
          <span
            style={{
              fontSize:   17,
              fontWeight: 700,
              fontFamily: "var(--font-playfair, 'Playfair Display'), serif",
              color:      "var(--foreground)",
            }}
          >
            Comments
          </span>
          <button
            onClick={onClose}
            aria-label="Close comments"
            style={{
              background: "transparent",
              border:     "none",
              cursor:     "pointer",
              color:      "var(--muted-foreground)",
              padding:    4,
              lineHeight: 1,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <path d="M6 6l10 10M16 6L6 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Comment list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 4px" }}>
          {loading && (
            <p style={{ color: "var(--muted-foreground)", fontSize: 14, textAlign: "center", padding: "24px 0" }}>
              Loading...
            </p>
          )}
          {!loading && comments.length === 0 && (
            <p style={{ color: "var(--muted-foreground)", fontSize: 14, textAlign: "center", padding: "24px 0" }}>
              No comments yet. Be the first.
            </p>
          )}
          {comments.map((c) => (
            <div
              key={c.id}
              style={{
                display:      "flex",
                gap:          10,
                marginBottom: 16,
              }}
            >
              <div style={{ flexShrink: 0 }}>
                <Avatar
                  name={c.display_name}
                  avatarUrl={c.avatar_url}
                  badge={c.badge}
                  tier={c.membership_tier}
                  size={32}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                    {c.display_name ?? "Member"}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                    {relativeTime(c.created_at)}
                  </span>
                </div>
                <p
                  style={{
                    margin:     "3px 0 0",
                    fontSize:   14,
                    color:      "var(--foreground)",
                    lineHeight: 1.5,
                    wordBreak:  "break-word",
                  }}
                >
                  {c.content}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Compose */}
        <div
          style={{
            padding:    "12px 20px 20px",
            borderTop:  "1px solid rgba(255,255,255,0.07)",
            flexShrink: 0,
          }}
        >
          {toast && (
            <p style={{ fontSize: 13, color: "var(--ember, #E8642C)", marginBottom: 8 }}>{toast}</p>
          )}
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment..."
            rows={2}
            maxLength={500}
            style={{
              width:           "100%",
              backgroundColor: "var(--secondary)",
              border:          "1px solid rgba(255,255,255,0.08)",
              borderRadius:    10,
              color:           "var(--foreground)",
              fontSize:        16,
              padding:         "10px 12px",
              resize:          "none",
              outline:         "none",
              fontFamily:      "inherit",
              lineHeight:      1.5,
              boxSizing:       "border-box",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button
              onClick={handleSubmit}
              disabled={!body.trim() || submitting}
              style={{
                backgroundColor: body.trim() ? "var(--primary)" : "rgba(193,120,23,0.3)",
                color:           "#fff",
                border:          "none",
                borderRadius:    8,
                padding:         "9px 20px",
                fontSize:        14,
                fontWeight:      600,
                cursor:          body.trim() && !submitting ? "pointer" : "default",
                transition:      "background-color 0.15s",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {submitting ? "Posting..." : "Post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Video card — compact horizontal layout
   ------------------------------------------------------------------ */

function VideoCard({
  video,
  userId,
  tier,
  onOpenComments,
  likeCount,
  commentCount,
  liked,
  onToggleLike,
}: {
  video:          ChannelVideo;
  userId:         string;
  tier:           string;
  onOpenComments: (v: ChannelVideo) => void;
  likeCount:      number;
  commentCount:   number;
  liked:          boolean;
  onToggleLike:   (videoId: string) => void;
}) {
  const isMember = tier === "member" || tier === "premium";
  const ytUrl    = `https://www.youtube.com/watch?v=${video.youtube_video_id}`;

  return (
    <div
      style={{
        backgroundColor: "var(--card)",
        borderRadius:    12,
        border:          "1px solid rgba(255,255,255,0.06)",
        overflow:        "hidden",
        padding:         "10px 12px",
      }}
    >
      {/* Horizontal row: thumbnail left, content right */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* Thumbnail */}
        <a
          href={ytUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ position: "relative", flexShrink: 0, display: "block", borderRadius: 8, overflow: "hidden" }}
          aria-label={`Watch "${video.title}" on YouTube`}
        >
          {video.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.thumbnail_url}
              alt=""
              style={{ width: 112, height: 63, objectFit: "cover", display: "block" }}
            />
          ) : (
            <div
              style={{
                width:           112,
                height:          63,
                backgroundColor: "var(--secondary)",
                display:         "flex",
                alignItems:      "center",
                justifyContent:  "center",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="rgba(193,120,23,0.15)" stroke="rgba(193,120,23,0.3)" strokeWidth="1.2"/>
                <path d="M10 8l6 4-6 4V8z" fill="var(--primary)"/>
              </svg>
            </div>
          )}
          {/* Duration badge */}
          {video.duration_seconds && video.duration_seconds > 0 && (
            <span
              style={{
                position:        "absolute",
                bottom:          3,
                right:           3,
                backgroundColor: "rgba(0,0,0,0.8)",
                color:           "#fff",
                fontSize:        10,
                fontWeight:      600,
                padding:         "1px 4px",
                borderRadius:    3,
              }}
            >
              {formatDuration(video.duration_seconds)}
            </span>
          )}
        </a>

        {/* Right: title + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <a
            href={ytUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:         "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow:        "hidden",
              fontSize:        13,
              fontWeight:      600,
              color:           "var(--foreground)",
              lineHeight:      1.4,
              textDecoration:  "none",
            }}
          >
            {video.title}
          </a>
          <div
            style={{
              display:   "flex",
              gap:       6,
              marginTop: 4,
              fontSize:  11,
              color:     "var(--muted-foreground)",
              flexWrap:  "wrap",
            }}
          >
            {video.view_count > 0 && <span>{formatCount(video.view_count)} views</span>}
            {video.view_count > 0 && video.published_at && <span>·</span>}
            {video.published_at && <span>{relativeTime(video.published_at)}</span>}
          </div>
        </div>
      </div>

      {/* Action row */}
      <div style={{ display: "flex", gap: 16, marginTop: 10, alignItems: "center", paddingLeft: 2 }}>
        {/* Fire like button */}
        <button
          onClick={() => isMember && onToggleLike(video.id)}
          aria-label={liked ? "Unlike" : "Like"}
          style={{
            display:    "flex",
            alignItems: "center",
            gap:        4,
            background: "transparent",
            border:     "none",
            cursor:     isMember ? "pointer" : "default",
            color:      liked ? "var(--ember, #E8642C)" : "var(--muted-foreground)",
            opacity:    isMember ? 1 : 0.45,
            fontSize:   12,
            fontWeight: 600,
            padding:    0,
            WebkitTapHighlightColor: "transparent",
            transition: "color 0.15s",
          }}
          title={isMember ? undefined : "Members can like videos"}
        >
          <svg
            width="15" height="15" viewBox="0 0 24 24"
            fill={liked ? "currentColor" : "none"}
            stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
          </svg>
          <span>{likeCount}</span>
        </button>

        {/* Comment button */}
        <button
          onClick={() => onOpenComments(video)}
          aria-label="Comments"
          style={{
            display:    "flex",
            alignItems: "center",
            gap:        4,
            background: "transparent",
            border:     "none",
            cursor:     "pointer",
            color:      "var(--muted-foreground)",
            fontSize:   12,
            fontWeight: 600,
            padding:    0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
            <path
              d="M2 2.5h11a.5.5 0 01.5.5v6.5a.5.5 0 01-.5.5H5L2 12.5V3a.5.5 0 010-1z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{commentCount}</span>
        </button>

        {/* Watch on YouTube */}
        <a
          href={ytUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginLeft:     "auto",
            display:        "flex",
            alignItems:     "center",
            gap:            3,
            fontSize:       11,
            color:          "var(--muted-foreground)",
            textDecoration: "none",
            fontWeight:     500,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <rect x="0.5" y="2" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.1"/>
            <path d="M4.5 4.5l3 1.5-3 1.5V4.5z" fill="currentColor"/>
          </svg>
          YouTube
        </a>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Channel section
   ------------------------------------------------------------------ */

function ChannelSection({
  channel,
  userId,
  tier,
  likeCountMap,
  commentCountMap,
  userLikeSet,
  onToggleLike,
}: {
  channel:        Channel;
  userId:         string;
  tier:           string;
  likeCountMap:   Record<string, number>;
  commentCountMap: Record<string, number>;
  userLikeSet:    Set<string>;
  onToggleLike:   (videoId: string) => void;
}) {
  const [open,               setOpen]               = useState(false);
  const [activeCommentVideo, setActiveCommentVideo] = useState<ChannelVideo | null>(null);
  const ytChannelUrl = `https://www.youtube.com/${channel.handle}/videos`;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Channel card — tap header to expand/collapse */}
      <div
        style={{
          backgroundColor: "var(--card)",
          borderRadius:    open ? "16px 16px 0 0" : 16,
          border:          "1px solid rgba(255,255,255,0.06)",
          borderBottom:    open ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(255,255,255,0.06)",
          overflow:        "hidden",
        }}
      >
        {/* Tappable header row */}
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            width:          "100%",
            display:        "flex",
            alignItems:     "center",
            gap:            12,
            padding:        "14px 14px 14px 16px",
            background:     "transparent",
            border:         "none",
            cursor:         "pointer",
            textAlign:      "left",
            WebkitTapHighlightColor: "transparent",
          }}
          aria-expanded={open}
        >
          {/* Channel thumbnail */}
          {channel.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={channel.thumbnail_url}
              alt={channel.name}
              style={{
                width:        48,
                height:       48,
                borderRadius: "50%",
                objectFit:    "cover",
                flexShrink:   0,
                border:       "2px solid rgba(193,120,23,0.3)",
              }}
            />
          ) : (
            <div
              style={{
                width:           48,
                height:          48,
                borderRadius:    "50%",
                backgroundColor: "var(--secondary)",
                display:         "flex",
                alignItems:      "center",
                justifyContent:  "center",
                flexShrink:      0,
                fontSize:        18,
                fontWeight:      700,
                color:           "var(--primary)",
              }}
            >
              {initials(channel.name)}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize:   16,
                fontWeight: 700,
                fontFamily: "var(--font-playfair, 'Playfair Display'), serif",
                color:      "var(--foreground)",
                whiteSpace: "nowrap",
                overflow:   "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {channel.name}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                {channel.handle}
              </span>
              {channel.subscriber_count != null && channel.subscriber_count > 0 && (
                <>
                  <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>·</span>
                  <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                    {formatCount(channel.subscriber_count)} subs
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Chevron */}
          <svg
            width="18" height="18" viewBox="0 0 18 18" fill="none"
            aria-hidden="true"
            style={{
              flexShrink: 0,
              color:      "var(--muted-foreground)",
              transform:  open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.22s ease",
            }}
          >
            <path d="M4.5 6.75L9 11.25L13.5 6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Expanded body */}
        {open && (
          <div style={{ padding: "0 16px 14px" }}>
            {channel.description && (
              <p
                style={{
                  margin:          "0 0 10px",
                  fontSize:        13,
                  color:           "var(--muted-foreground)",
                  lineHeight:      1.55,
                  display:         "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow:        "hidden",
                }}
              >
                {channel.description}
              </p>
            )}
            <a
              href={ytChannelUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                display:        "inline-flex",
                alignItems:     "center",
                gap:            4,
                fontSize:       12,
                color:          "var(--muted-foreground)",
                textDecoration: "none",
                fontWeight:     500,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <rect x="0.5" y="2" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.1"/>
                <path d="M4.5 4.5l3 1.5-3 1.5V4.5z" fill="currentColor"/>
              </svg>
              Watch on YouTube
            </a>
          </div>
        )}
      </div>

      {/* Video list — only when expanded */}
      {open && (
        <div
          style={{
            border:          "1px solid rgba(255,255,255,0.06)",
            borderTop:       "none",
            borderRadius:    "0 0 16px 16px",
            overflow:        "hidden",
            backgroundColor: "var(--background)",
          }}
        >
          {channel.videos.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--muted-foreground)", textAlign: "center", padding: "16px 0" }}>
              No videos yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "8px" }}>
              {channel.videos.map((v) => (
                <VideoCard
                  key={v.id}
                  video={v}
                  userId={userId}
                  tier={tier}
                  likeCount={likeCountMap[v.id] ?? v.like_count}
                  commentCount={commentCountMap[v.id] ?? v.comment_count}
                  liked={userLikeSet.has(v.id)}
                  onToggleLike={onToggleLike}
                  onOpenComments={setActiveCommentVideo}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Comment sheet */}
      {activeCommentVideo && (
        <CommentSheet
          video={activeCommentVideo}
          userId={userId}
          onClose={() => setActiveCommentVideo(null)}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------
   Main client component
   ------------------------------------------------------------------ */

export function ChannelsClient({ channels, userId, tier }: Props) {
  const supabase = createClient();

  // Local like state (optimistic)
  const [likeCountMap,   setLikeCountMap]   = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const ch of channels) for (const v of ch.videos) m[v.id] = v.like_count;
    return m;
  });
  const [userLikeSet, setUserLikeSet] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const ch of channels) for (const v of ch.videos) if (v.user_has_liked) s.add(v.id);
    return s;
  });
  // Comment counts are server-rendered; track locally if comments are submitted
  const [commentCountMap, setCommentCountMap] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const ch of channels) for (const v of ch.videos) m[v.id] = v.comment_count;
    return m;
  });

  const isMember = tier === "member" || tier === "premium";

  const toggleLike = useCallback(async (videoId: string) => {
    if (!isMember) return;

    const liked = userLikeSet.has(videoId);

    // Optimistic update
    setUserLikeSet((prev) => {
      const next = new Set(prev);
      liked ? next.delete(videoId) : next.add(videoId);
      return next;
    });
    setLikeCountMap((prev) => ({
      ...prev,
      [videoId]: Math.max(0, (prev[videoId] ?? 0) + (liked ? -1 : 1)),
    }));

    if (liked) {
      const { error } = await supabase
        .from("content_video_likes")
        .delete()
        .eq("video_id", videoId)
        .eq("user_id", userId);

      if (error) {
        // Revert
        setUserLikeSet((prev) => { const next = new Set(prev); next.add(videoId); return next; });
        setLikeCountMap((prev) => ({ ...prev, [videoId]: (prev[videoId] ?? 0) + 1 }));
      }
    } else {
      const { error } = await supabase
        .from("content_video_likes")
        .insert({ video_id: videoId, user_id: userId });

      if (error) {
        // Revert
        setUserLikeSet((prev) => { const next = new Set(prev); next.delete(videoId); return next; });
        setLikeCountMap((prev) => ({ ...prev, [videoId]: Math.max(0, (prev[videoId] ?? 0) - 1) }));
      }
    }
  }, [isMember, userId, userLikeSet, supabase]);

  /* ── Empty state ──────────────────────────────────────────────────── */
  if (channels.length === 0) {
    return (
      <div className="max-w-2xl mx-auto" style={{ padding: "32px 16px", textAlign: "center" }}>
        <h1
          style={{
            fontSize:   22,
            fontWeight: 700,
            fontFamily: "var(--font-playfair, 'Playfair Display'), serif",
            color:      "var(--foreground)",
            marginBottom: 8,
          }}
        >
          Featured Partner Channels
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>
          Partner channels coming soon.
        </p>
      </div>
    );
  }

  /* ── Main render ─────────────────────────────────────────────────── */
  return (
    <div className="max-w-2xl mx-auto" style={{ padding: "24px 16px 40px" }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1
          style={{
            fontSize:   22,
            fontWeight: 700,
            fontFamily: "var(--font-playfair, 'Playfair Display'), serif",
            color:      "var(--foreground)",
            margin:     0,
          }}
        >
          Featured Partner Channels
        </h1>
        <p
          style={{
            fontSize:  14,
            color:     "var(--muted-foreground)",
            marginTop: 5,
            lineHeight: 1.5,
          }}
        >
          Our partner creators put out great content for aficionados like you. Show them some love and subscribe to their channels and keep the community growing.
        </p>
      </div>

      {/* Channel sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {channels.map((ch) => (
          <ChannelSection
            key={ch.id}
            channel={ch}
            userId={userId}
            tier={tier}
            likeCountMap={likeCountMap}
            commentCountMap={commentCountMap}
            userLikeSet={userLikeSet}
            onToggleLike={toggleLike}
          />
        ))}
      </div>

      {/* Like gate note for free users */}
      {!isMember && (
        <p
          style={{
            marginTop:  24,
            fontSize:   13,
            color:      "var(--muted-foreground)",
            textAlign:  "center",
          }}
        >
          Upgrade to Member to like videos.
        </p>
      )}
    </div>
  );
}
