"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image                   from "next/image";
import { createClient }        from "@/utils/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { AvatarFrame }         from "@/components/ui/AvatarFrame";
import { resolveBadge }        from "@/lib/badge";
import { useEscapeKey }        from "@/lib/hooks/use-escape-key";
import type { Channel, ChannelVideo } from "@/app/(app)/discover/channels/page";

/* ------------------------------------------------------------------
   Module-level SWR cache — persists across client-side navigations.
   Base data (channels + videos + aggregate counts) is shared for all
   users. User likes are cached per-user ID.
   ------------------------------------------------------------------ */

interface RawChannel {
  id: string; name: string; handle: string; description: string | null;
  thumbnail_url: string | null; subscriber_count: number | null; last_synced_at: string | null;
}
interface RawVideo {
  id: string; channel_id: string; youtube_video_id: string; title: string;
  thumbnail_url: string | null; published_at: string | null; view_count: number;
  duration_seconds: number | null; position: number;
}
interface BaseCache {
  rawChannels:    RawChannel[];
  rawVideos:      RawVideo[];
  likeCountMap:   Record<string, number>;
  commentCountMap: Record<string, number>;
  ts:             number;
}
interface LikesCache { userId: string; likeSet: Set<string>; ts: number; }

let _baseCache:  BaseCache  | null = null;
let _baseFetch:  Promise<BaseCache> | null = null;
let _likesCache: LikesCache | null = null;

const BASE_TTL  = 5 * 60 * 1000; // 5 min
const LIKES_TTL = 60 * 1000;     // 1 min

function isFresh(ts: number, ttl: number) { return Date.now() - ts < ttl; }

async function fetchBase(): Promise<BaseCache> {
  const sb = createClient();

  const { data: rawChannels } = await sb
    .from("content_channels")
    .select("id, name, handle, description, thumbnail_url, subscriber_count, last_synced_at")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const channels   = rawChannels ?? [];
  const channelIds = channels.map((c) => c.id);

  if (channelIds.length === 0) {
    return { rawChannels: [], rawVideos: [], likeCountMap: {}, commentCountMap: {}, ts: Date.now() };
  }

  const { data: rawVideos } = await sb
    .from("content_videos")
    .select("id, channel_id, youtube_video_id, title, thumbnail_url, published_at, view_count, duration_seconds, position")
    .in("channel_id", channelIds)
    .eq("is_active", true)
    .order("position", { ascending: true });

  const videos   = rawVideos ?? [];
  const videoIds = videos.map((v) => v.id);

  const [{ data: likesData }, { data: commentsData }] = await Promise.all([
    videoIds.length ? sb.from("content_video_likes").select("video_id").in("video_id", videoIds)
                    : Promise.resolve({ data: [] as { video_id: string }[] }),
    videoIds.length ? sb.from("content_video_comments").select("video_id").in("video_id", videoIds)
                    : Promise.resolve({ data: [] as { video_id: string }[] }),
  ]);

  const likeCountMap: Record<string, number> = {};
  for (const l of likesData ?? []) {
    likeCountMap[l.video_id] = (likeCountMap[l.video_id] ?? 0) + 1;
  }
  const commentCountMap: Record<string, number> = {};
  for (const c of commentsData ?? []) {
    commentCountMap[c.video_id] = (commentCountMap[c.video_id] ?? 0) + 1;
  }

  return { rawChannels: channels, rawVideos: videos, likeCountMap, commentCountMap, ts: Date.now() };
}

function getBase(): Promise<BaseCache> {
  if (_baseCache && isFresh(_baseCache.ts, BASE_TTL)) return Promise.resolve(_baseCache);
  if (!_baseFetch) {
    _baseFetch = fetchBase()
      .then((d) => { _baseCache = d; _baseFetch = null; return d; })
      .catch((e) => { _baseFetch = null; throw e; });
  }
  return _baseFetch;
}

function getLikes(userId: string, videoIds: string[]): Promise<Set<string>> {
  if (_likesCache && _likesCache.userId === userId && isFresh(_likesCache.ts, LIKES_TTL)) {
    return Promise.resolve(_likesCache.likeSet);
  }
  if (!videoIds.length) return Promise.resolve(new Set<string>());
  return Promise.resolve(
    createClient()
      .from("content_video_likes")
      .select("video_id")
      .eq("user_id", userId)
      .in("video_id", videoIds)
  ).then(({ data }) => {
    const likeSet = new Set<string>((data ?? []).map((l: { video_id: string }) => l.video_id));
    _likesCache = { userId, likeSet, ts: Date.now() };
    return likeSet;
  });
}

function buildChannels(base: BaseCache, userLikeSet: Set<string>): Channel[] {
  const byChannel: Record<string, ChannelVideo[]> = {};
  for (const v of base.rawVideos) {
    if (!byChannel[v.channel_id]) byChannel[v.channel_id] = [];
    byChannel[v.channel_id].push({
      id:               v.id,
      youtube_video_id: v.youtube_video_id,
      title:            v.title,
      thumbnail_url:    v.thumbnail_url,
      published_at:     v.published_at,
      view_count:       v.view_count ?? 0,
      duration_seconds: v.duration_seconds,
      position:         v.position,
      like_count:       base.likeCountMap[v.id] ?? 0,
      comment_count:    base.commentCountMap[v.id] ?? 0,
      user_has_liked:   userLikeSet.has(v.id),
    });
  }
  return base.rawChannels.map((ch) => ({ ...ch, videos: byChannel[ch.id] ?? [] }));
}

/* ------------------------------------------------------------------
   Skeleton — shown on first visit before cache is warm
   ------------------------------------------------------------------ */

function ChannelsSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {[1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl overflow-hidden animate-pulse"
          style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3 p-4">
            <div className="w-12 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--secondary)" }} />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 rounded-full w-32" style={{ backgroundColor: "var(--secondary)" }} />
              <div className="h-2.5 rounded-full w-20" style={{ backgroundColor: "var(--secondary)" }} />
            </div>
          </div>
          {[1, 2, 3].map((j) => (
            <div key={j} className="flex items-start gap-3 px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="flex-shrink-0 rounded-lg" style={{ width: 112, height: 63, backgroundColor: "var(--secondary)" }} />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 rounded-full w-full"  style={{ backgroundColor: "var(--secondary)" }} />
                <div className="h-3 rounded-full w-3/4"   style={{ backgroundColor: "var(--secondary)" }} />
                <div className="h-2.5 rounded-full w-1/3" style={{ backgroundColor: "var(--secondary)" }} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

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

interface RendererProps {
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
  return (
    <AvatarFrame
      badge={resolveBadge(badge, tier)}
      size={size}
      name={name}
      avatarUrl={avatarUrl}
    />
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
  /* Mounted only when the parent is showing the sheet — Escape closes
     it for keyboard users. */
  useEscapeKey(true, onClose);

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
  const ytUrl = `https://www.youtube.com/watch?v=${video.youtube_video_id}`;

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
            <Image
              src={video.thumbnail_url}
              alt=""
              width={112}
              height={63}
              sizes="112px"
              quality={70}
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
        {/* Fire like button — open to every authenticated user. The
            former member-gated state was removed alongside the RLS
            policy update; lightweight engagement (likes / comments)
            stays open across tiers throughout the app. */}
        <button
          onClick={() => onToggleLike(video.id)}
          aria-label={liked ? "Unlike" : "Like"}
          style={{
            display:    "flex",
            alignItems: "center",
            gap:        4,
            background: "transparent",
            border:     "none",
            cursor:     "pointer",
            color:      liked ? "var(--ember, #E8642C)" : "var(--muted-foreground)",
            fontSize:   12,
            fontWeight: 600,
            padding:    0,
            WebkitTapHighlightColor: "transparent",
            transition: "color 0.15s",
          }}
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
            <Image
              src={channel.thumbnail_url}
              alt={channel.name}
              width={48}
              height={48}
              sizes="48px"
              quality={70}
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

function ChannelsRenderer({ channels, userId, tier }: RendererProps) {
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

  const toggleLike = useCallback(async (videoId: string) => {
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
  }, [userId, userLikeSet, supabase]);

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
          Community Partner Channels
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
          Community Partner Channels
        </h1>
        <p
          style={{
            fontSize:  14,
            color:     "var(--muted-foreground)",
            marginTop: 5,
            lineHeight: 1.5,
          }}
        >
          Show some love and support for our Community Partner Creators. Give them a like and subscribe to their channels to help keep the community growing.
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

      {/* Featured Content — placeholder section for staff-curated picks.
          Header + description render now so the page structure communicates
          what's coming. Content (videos / posts / shop spotlights) lands in
          a follow-up once the curation backend exists. */}
      <div style={{ marginTop: 36, marginBottom: 8 }}>
        <h2
          style={{
            fontSize:   22,
            fontWeight: 700,
            fontFamily: "var(--font-playfair, 'Playfair Display'), serif",
            color:      "var(--foreground)",
            margin:     0,
          }}
        >
          Featured Content
        </h2>
        <p
          style={{
            fontSize:  14,
            color:     "var(--muted-foreground)",
            marginTop: 5,
            lineHeight: 1.5,
          }}
        >
          Staff picks from around the cigar community.
        </p>
      </div>
      <div
        style={{
          marginTop:      12,
          padding:        "20px 16px",
          background:     "var(--card-bg)",
          border:         "1px solid var(--card-border)",
          borderRadius:   4,
          boxShadow:      "var(--card-edge)",
          textAlign:      "center",
        }}
      >
        <span
          style={{
            color:         "var(--primary)",
            fontSize:      12,
            fontWeight:    600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Coming Soon
        </span>
        <p
          style={{
            fontSize:   13,
            color:      "var(--muted-foreground)",
            marginTop:  8,
            lineHeight: 1.55,
          }}
        >
          Curated picks from the team are on the way.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Exported component — fetches data client-side with a module-level
   SWR cache. First visit shows a skeleton; return visits within the
   TTL render immediately from cache with no loading flash.
   ------------------------------------------------------------------ */

export function ChannelsClient({ userId, tier }: { userId: string; tier: string }) {
  const [channels,    setChannels]    = useState<Channel[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // If both base and likes are cached, apply synchronously and skip loading.
    if (_baseCache && isFresh(_baseCache.ts, BASE_TTL)) {
      const base     = _baseCache;
      const videoIds = base.rawVideos.map((v) => v.id);

      getLikes(userId, videoIds).then((likes) => {
        if (cancelled) return;
        setChannels(buildChannels(base, likes));
        setDataLoading(false);
      }).catch(() => { if (!cancelled) setDataLoading(false); });

      return () => { cancelled = true; };
    }

    // Cache is empty or stale — fetch fresh.
    getBase()
      .then((base) => {
        if (cancelled) return;
        const videoIds = base.rawVideos.map((v) => v.id);
        return getLikes(userId, videoIds).then((likes) => {
          if (cancelled) return;
          setChannels(buildChannels(base, likes));
          setDataLoading(false);
        });
      })
      .catch(() => { if (!cancelled) setDataLoading(false); });

    return () => { cancelled = true; };
  }, [userId]);

  if (dataLoading) return <ChannelsSkeleton />;

  return <ChannelsRenderer channels={channels} userId={userId} tier={tier} />;
}
