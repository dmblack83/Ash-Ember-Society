"use client";

import { useState, useEffect, useMemo, memo } from "react";
import { createPortal }                        from "react-dom";
import { createClient }                        from "@/utils/supabase/client";
import { formatDistanceToNow }                 from "date-fns";
import { AvatarFrame }                         from "@/components/ui/AvatarFrame";
import { resolveBadge }                        from "@/lib/badge";
import type { SmokeLogData }                   from "./PostDetailClient";

/* ------------------------------------------------------------------ */
/* Exported types                                                        */
/* ------------------------------------------------------------------ */

export interface PostItem {
  id:            string;
  title:         string;
  content:       string;
  created_at:    string;
  user_id:       string | null;
  author: {
    display_name:    string | null;
    avatar_url:      string | null;
    badge:           string | null;
    membership_tier: string | null;
  } | null;
  like_count:    number;
  comment_count: number;
  image_url:     string | null;
  is_locked:     boolean;
  is_system:     boolean;
  smoke_log:     SmokeLogData | null;
  upvotes:       number;
  downvotes:     number;
  user_vote:     0 | 1 | -1;
}

interface Comment {
  id:                string;
  content:           string;
  created_at:        string;
  updated_at:        string;
  user_id:           string;
  parent_comment_id: string | null;
  profiles: {
    display_name:    string | null;
    avatar_url:      string | null;
    badge:           string | null;
    membership_tier: string | null;
  } | null;
}

interface Props {
  post:         PostItem;
  initialLiked: boolean;
  userId:       string;
  isFeedback:   boolean;
  onDelete:     (postId: string) => void;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                               */
/* ------------------------------------------------------------------ */

function initials(name: string | null | undefined): string {
  if (!name) return "A";
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function relativeTime(iso: string): string {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return ""; }
}

function Avatar({
  name, avatarUrl, size = 32, badge, tier,
}: { name?: string | null; avatarUrl?: string | null; size?: number; badge?: string | null; tier?: string | null }) {
  const resolved = resolveBadge(badge, tier);
  const inner = avatarUrl ? (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", border: "1px solid var(--border)", flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatarUrl} alt={name ?? "Member"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </div>
  ) : (
    <div className="flex items-center justify-center rounded-full shrink-0 text-xs font-semibold"
      style={{ width: size, height: size, background: "var(--secondary)", color: "var(--muted-foreground)" }}>
      {initials(name)}
    </div>
  );
  return <AvatarFrame badge={resolved} size={size}>{inner}</AvatarFrame>;
}

function FlameIcon({ size = 18, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"} stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
    </svg>
  );
}

function ratingColor(v: number): string {
  if (v <= 40) return "#C44536";
  if (v <= 60) return "#8B6020";
  if (v <= 80) return "#3A6B45";
  return "#D4A04A";
}

function ratingLabel(v: number): string {
  if (v <= 20) return "Poor";
  if (v <= 40) return "Below Average";
  if (v <= 60) return "Average";
  if (v <= 80) return "Good";
  return "Outstanding";
}

function StarDisplay({ value }: { value: number | null }) {
  if (!value) return <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>N/A</span>;
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            fill={s <= value ? "var(--primary)" : "none"}
            stroke={s <= value ? "var(--primary)" : "var(--border)"}
            strokeWidth="1.5"
          />
        </svg>
      ))}
    </span>
  );
}

const BurnReportCard = memo(function BurnReportCard({ log }: { log: SmokeLogData }) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [mounted,     setMounted]     = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const color = log.overall_rating != null ? ratingColor(log.overall_rating) : "var(--muted-foreground)";
  const cigar = log.cigar;

  const detailRows = [
    ["Date",     log.smoked_at ? new Date(log.smoked_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : null],
    ["Location", log.location],
    ["Occasion", log.occasion],
    ["Drink",    log.pairing_drink],
    ["Food",     log.pairing_food],
    ["Duration", log.smoke_duration_minutes ? `${log.smoke_duration_minutes} min` : null],
  ].filter(([, v]) => v != null) as [string, string][];

  const starRows = [
    ["Draw",         log.draw_rating],
    ["Burn",         log.burn_rating],
    ["Construction", log.construction_rating],
    ["Flavor",       log.flavor_rating],
  ].filter(([, v]) => v != null) as [string, number][];

  const lightbox = mounted && lightboxSrc
    ? createPortal(
        <>
          <div onClick={() => setLightboxSrc(null)} style={{ position: "fixed", inset: 0, zIndex: 10990, backgroundColor: "rgba(0,0,0,0.92)" }} />
          <div style={{ position: "fixed", inset: 0, zIndex: 10991, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightboxSrc} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} />
            <button type="button" onClick={() => setLightboxSrc(null)} aria-label="Close"
              style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%",
                background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </>,
        document.body
      )
    : null;

  return (
    <div style={{ marginTop: 4 }}>
      <div className="rounded-2xl p-4 text-center mb-4" style={{ backgroundColor: "var(--secondary)", border: "1px solid var(--border)" }}>
        {cigar && (
          <>
            <p className="text-xs uppercase tracking-widest font-medium mb-1" style={{ color: "var(--muted-foreground)" }}>{cigar.brand}</p>
            <p className="text-base font-semibold mb-1" style={{ color: "var(--foreground)", fontFamily: "var(--font-serif)" }}>{cigar.series ?? cigar.format}</p>
            {cigar.format && <p className="text-xs mb-2" style={{ color: "var(--muted-foreground)" }}>{cigar.format}</p>}
          </>
        )}
        {log.overall_rating != null && (
          <>
            <p className="text-6xl font-bold leading-none mt-2" style={{ fontFamily: "var(--font-serif)", color }}>{log.overall_rating}</p>
            <p className="text-sm font-medium mt-1" style={{ color }}>{ratingLabel(log.overall_rating)}</p>
          </>
        )}
      </div>

      {(detailRows.length > 0 || starRows.length > 0) && (
        <div className="rounded-xl px-4 mb-4" style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}>
          {detailRows.map(([label, value], i) => (
            <div key={label} className="flex items-center justify-between gap-4 py-2.5"
              style={{ borderBottom: (i < detailRows.length - 1 || starRows.length > 0) ? "1px solid var(--border)" : "none" }}>
              <span className="text-xs uppercase tracking-widest font-medium flex-shrink-0" style={{ color: "var(--muted-foreground)" }}>{label}</span>
              <span className="text-sm text-right" style={{ color: "var(--foreground)" }}>{value}</span>
            </div>
          ))}
          {starRows.map(([label, value], i) => (
            <div key={label} className="flex items-center justify-between gap-4 py-2.5"
              style={{ borderBottom: i < starRows.length - 1 ? "1px solid var(--border)" : "none" }}>
              <span className="text-xs uppercase tracking-widest font-medium flex-shrink-0" style={{ color: "var(--muted-foreground)" }}>{label}</span>
              <StarDisplay value={value} />
            </div>
          ))}
        </div>
      )}

      {log.review_text && (
        <div className="mb-4">
          <p className="text-xs uppercase tracking-widest font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Review</p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)", whiteSpace: "pre-line" }}>{log.review_text}</p>
        </div>
      )}

      {log.photo_urls && log.photo_urls.length > 0 && (
        <div className="mb-2">
          <p className="text-xs uppercase tracking-widest font-medium mb-2" style={{ color: "var(--muted-foreground)" }}>Photos</p>
          <div className="flex gap-2 flex-wrap">
            {log.photo_urls.map((url, i) => (
              <button key={i} type="button" onClick={() => setLightboxSrc(url)}
                className="rounded-xl overflow-hidden"
                style={{ width: 80, height: 80, flexShrink: 0, border: "1px solid var(--border)", padding: 0, cursor: "pointer", touchAction: "manipulation" }}
                aria-label={`View photo ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {lightbox}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* CommentNode                                                           */
/* ------------------------------------------------------------------ */

interface CommentNodeProps {
  comment:        Comment;
  isReply?:       boolean;
  userId:         string;
  postId:         string;
  onDelete:       (id: string) => void;
  onEditSave:     (id: string, text: string) => void;
  onReplyCreated: (reply: Comment) => void;
}

const CommentNode = memo(function CommentNode({
  comment, isReply = false, userId, postId,
  onDelete, onEditSave, onReplyCreated,
}: CommentNodeProps) {
  const supabase = useMemo(() => createClient(), []);
  const [editMode,      setEditMode]      = useState(false);
  const [editText,      setEditText]      = useState(comment.content);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [replyMode,     setReplyMode]     = useState(false);
  const [replyText,     setReplyText]     = useState("");
  const [submitting,    setSubmitting]    = useState(false);
  const isOwn = comment.user_id === userId;

  async function handleSaveEdit() {
    if (!editText.trim()) return;
    const { error } = await supabase.from("forum_comments")
      .update({ content: editText.trim(), updated_at: new Date().toISOString() })
      .eq("id", comment.id);
    if (!error) { onEditSave(comment.id, editText.trim()); setEditMode(false); }
  }

  async function handleDelete() {
    await supabase.from("forum_comments").delete().eq("id", comment.id);
    onDelete(comment.id);
    setConfirmDelete(false);
  }

  async function handleReply() {
    if (replyText.trim().length < 3 || submitting) return;
    setSubmitting(true);
    const { data, error } = await supabase.from("forum_comments")
      .insert({ user_id: userId, post_id: postId, content: replyText.trim(), parent_comment_id: comment.id })
      .select("id, content, created_at, updated_at, user_id, parent_comment_id")
      .single();
    if (error || !data) { setSubmitting(false); return; }
    const { data: p } = await supabase.from("profiles")
      .select("display_name, avatar_url, badge, membership_tier").eq("id", userId).single();
    onReplyCreated({ ...data, profiles: p ?? null });
    setReplyText(""); setReplyMode(false); setSubmitting(false);
  }

  return (
    <div style={{ marginLeft: isReply ? 24 : 0, paddingTop: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Avatar name={comment.profiles?.display_name} avatarUrl={comment.profiles?.avatar_url} size={28}
          badge={comment.profiles?.badge} tier={comment.profiles?.membership_tier} />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
            {comment.profiles?.display_name ?? "Member"}
          </span>
          <span className="text-xs ml-2" style={{ color: "var(--muted-foreground)" }}>{relativeTime(comment.created_at)}</span>
        </div>
      </div>

      {editMode ? (
        <div className="flex flex-col gap-2">
          <textarea value={editText} onChange={(e) => setEditText(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm resize-none"
            style={{ minHeight: 72, backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--foreground)", fontSize: 14, outline: "none" }} />
          <div className="flex gap-2">
            <button type="button" onClick={handleSaveEdit} className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: "var(--gold,#D4A04A)", color: "#1A1210", border: "none", cursor: "pointer", touchAction: "manipulation" }}>Save</button>
            <button type="button" onClick={() => { setEditMode(false); setEditText(comment.content); }}
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: "transparent", color: "var(--muted-foreground)", border: "1px solid var(--border)", cursor: "pointer", touchAction: "manipulation" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--foreground)", whiteSpace: "pre-line" }}>{comment.content}</p>
      )}

      {!editMode && (
        <div className="flex items-center gap-3 mt-2">
          {!isReply && (
            <button type="button" onClick={() => { setReplyMode((v) => !v); setReplyText(""); }} className="text-xs"
              style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", touchAction: "manipulation", padding: 0 }}>Reply</button>
          )}
          {isOwn && (
            <>
              <button type="button" onClick={() => { setEditMode(true); setEditText(comment.content); }} className="text-xs"
                style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", touchAction: "manipulation", padding: 0 }}>Edit</button>
              <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs"
                style={{ color: "#E8642C", background: "none", border: "none", cursor: "pointer", touchAction: "manipulation", padding: 0 }}>Delete</button>
            </>
          )}
        </div>
      )}

      {confirmDelete && (
        <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
          <span>Delete this comment?</span>
          <button type="button" onClick={handleDelete}
            style={{ color: "#E8642C", background: "none", border: "none", cursor: "pointer", touchAction: "manipulation", padding: 0, fontWeight: 600 }}>Yes, delete</button>
          <button type="button" onClick={() => setConfirmDelete(false)}
            style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", touchAction: "manipulation", padding: 0 }}>Cancel</button>
        </div>
      )}

      {replyMode && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Write a reply..." autoFocus
            className="w-full rounded-xl px-3 py-2 text-sm resize-none"
            style={{ minHeight: 72, backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--foreground)", fontSize: 14, outline: "none" }} />
          <div className="flex gap-2">
            <button type="button" onClick={handleReply} disabled={replyText.trim().length < 3 || submitting}
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: replyText.trim().length >= 3 ? "var(--gold,#D4A04A)" : "rgba(212,160,74,0.3)", color: "#1A1210", border: "none", cursor: replyText.trim().length >= 3 ? "pointer" : "default", touchAction: "manipulation" }}>
              {submitting ? "Sending..." : "Send Reply"}
            </button>
            <button type="button" onClick={() => { setReplyMode(false); setReplyText(""); }}
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: "transparent", color: "var(--muted-foreground)", border: "1px solid var(--border)", cursor: "pointer", touchAction: "manipulation" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* InlinePost                                                            */
/* ------------------------------------------------------------------ */

export function InlinePost({ post, initialLiked, userId, isFeedback, onDelete }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [liked,              setLiked]              = useState(initialLiked);
  const [likeCount,          setLikeCount]          = useState(post.like_count);
  const [liking,             setLiking]             = useState(false);
  const [upvotes,            setUpvotes]            = useState(post.upvotes);
  const [downvotes,          setDownvotes]          = useState(post.downvotes);
  const [userVote,           setUserVote]           = useState<0 | 1 | -1>(post.user_vote);
  const [voting,             setVoting]             = useState(false);
  const [commentsOpen,       setCommentsOpen]       = useState(false);
  const [comments,           setComments]           = useState<Comment[] | null>(null);
  const [commentsLoading,    setCommentsLoading]    = useState(false);
  const [commentCount,       setCommentCount]       = useState(post.comment_count);
  const [commentText,        setCommentText]        = useState("");
  const [commentSubmitting,  setCommentSubmitting]  = useState(false);
  const [commentError,       setCommentError]       = useState<string | null>(null);
  const [showDeletePost,     setShowDeletePost]     = useState(false);
  const [deletingPost,       setDeletingPost]       = useState(false);
  const [lightboxOpen,       setLightboxOpen]       = useState(false);
  const [mounted,            setMounted]            = useState(false);

  useEffect(() => { setMounted(true); }, []);

  /* Load comments on first open */
  useEffect(() => {
    if (!commentsOpen || comments !== null) return;
    setCommentsLoading(true);

    async function load() {
      const { data } = await supabase
        .from("forum_comments")
        .select("id, content, created_at, updated_at, user_id, parent_comment_id")
        .eq("post_id", post.id)
        .order("created_at", { ascending: true });

      const rows = data ?? [];
      const userIds = [...new Set(rows.map((c) => c.user_id))];
      const nameMap: Record<string, { display_name: string | null; avatar_url: string | null; badge: string | null; membership_tier: string | null }> = {};

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, badge, membership_tier")
          .in("id", userIds);
        for (const p of profiles ?? []) {
          nameMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url, badge: p.badge ?? null, membership_tier: p.membership_tier ?? null };
        }
      }

      setComments(rows.map((c) => ({ ...c, profiles: nameMap[c.user_id] ?? null })));
      setCommentsLoading(false);
    }

    load();
  }, [commentsOpen, comments, post.id, supabase]);

  /* Like */
  async function handleLike() {
    if (liking) return;
    setLiking(true);
    if (liked) {
      setLiked(false);
      setLikeCount((n) => Math.max(0, n - 1));
      await supabase.from("forum_post_likes").delete().eq("user_id", userId).eq("post_id", post.id);
    } else {
      setLiked(true);
      setLikeCount((n) => n + 1);
      const { error } = await supabase.from("forum_post_likes").insert({ user_id: userId, post_id: post.id });
      if (error && error.code !== "23505") {
        setLiked(false);
        setLikeCount((n) => Math.max(0, n - 1));
      }
    }
    setLiking(false);
  }

  /* Vote (feedback posts) */
  async function handleVote(direction: 1 | -1) {
    if (voting) return;
    setVoting(true);

    const prev    = userVote;
    const newVote = (prev === direction ? 0 : direction) as 0 | 1 | -1;

    let up   = upvotes;
    let down = downvotes;
    if (prev === 1)  up   -= 1;
    if (prev === -1) down -= 1;
    if (newVote === 1)  up   += 1;
    if (newVote === -1) down += 1;
    setUpvotes(up);
    setDownvotes(down);
    setUserVote(newVote);

    if (newVote === 0) {
      await supabase.from("forum_post_votes").delete().eq("user_id", userId).eq("post_id", post.id);
    } else if (prev === 0) {
      await supabase.from("forum_post_votes").insert({ user_id: userId, post_id: post.id, value: newVote });
    } else {
      await supabase.from("forum_post_votes").update({ value: newVote }).eq("user_id", userId).eq("post_id", post.id);
    }
    setVoting(false);
  }

  /* Add comment */
  async function handleComment() {
    if (commentText.trim().length < 3 || commentSubmitting) return;
    setCommentSubmitting(true);
    setCommentError(null);

    const { data, error } = await supabase
      .from("forum_comments")
      .insert({ user_id: userId, post_id: post.id, content: commentText.trim(), parent_comment_id: null })
      .select("id, content, created_at, updated_at, user_id, parent_comment_id")
      .single();

    setCommentSubmitting(false);
    if (error || !data) { setCommentError(error?.message ?? "Failed to post."); return; }

    const { data: profileData } = await supabase.from("profiles")
      .select("display_name, avatar_url, badge, membership_tier").eq("id", userId).single();
    setComments((prev) => [...(prev ?? []), { ...data, profiles: profileData ?? null }]);
    setCommentCount((n) => n + 1);
    setCommentText("");
  }

  function handleDeleteComment(id: string) {
    setComments((prev) => (prev ?? []).filter((c) => c.id !== id && c.parent_comment_id !== id));
    setCommentCount((n) => Math.max(0, n - 1));
  }

  function handleEditSave(id: string, text: string) {
    setComments((prev) => (prev ?? []).map((c) => c.id === id ? { ...c, content: text } : c));
  }

  function handleReplyCreated(reply: Comment) {
    setComments((prev) => [...(prev ?? []), reply]);
    setCommentCount((n) => n + 1);
  }

  async function handleDeletePost() {
    setDeletingPost(true);
    await supabase.from("forum_posts").delete().eq("id", post.id);
    onDelete(post.id);
  }

  const topLevel  = (comments ?? []).filter((c) => c.parent_comment_id === null);
  const repliesOf = (parentId: string) => (comments ?? []).filter((c) => c.parent_comment_id === parentId);

  /* Portals */

  const deleteModal = mounted && showDeletePost
    ? createPortal(
        <>
          <div onClick={() => setShowDeletePost(false)}
            style={{ position: "fixed", inset: 0, zIndex: 9998, backgroundColor: "rgba(0,0,0,0.6)" }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 9999, backgroundColor: "var(--card)", borderRadius: 16, padding: 24,
            width: "calc(100% - 48px)", maxWidth: 320, border: "1px solid var(--border)",
          }}>
            <h3 className="font-serif font-semibold text-base mb-2" style={{ color: "var(--foreground)" }}>Delete post?</h3>
            <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>
              This cannot be undone. All comments will also be removed.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowDeletePost(false)} className="flex-1 rounded-xl font-semibold text-sm"
                style={{ height: 44, background: "transparent", border: "1px solid var(--border)", color: "var(--muted-foreground)", cursor: "pointer" }}>
                Cancel
              </button>
              <button type="button" onClick={handleDeletePost} disabled={deletingPost} className="flex-1 rounded-xl font-semibold text-sm"
                style={{ height: 44, background: "#E8642C", border: "none", color: "#fff", cursor: deletingPost ? "default" : "pointer" }}>
                {deletingPost ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </>,
        document.body
      )
    : null;

  const imageLightbox = mounted && lightboxOpen && post.image_url
    ? createPortal(
        <>
          <div onClick={() => setLightboxOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 9998, backgroundColor: "rgba(0,0,0,0.92)" }} />
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.image_url!} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} />
            <button type="button" onClick={() => setLightboxOpen(false)} aria-label="Close"
              style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </>,
        document.body
      )
    : null;

  /* ---- Render ------------------------------------------------------ */

  return (
    <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 14 }}>
      <div className="px-4 pt-4 pb-3">

        {/* Author row */}
        <div className="flex items-center gap-2 mb-3">
          <Avatar name={post.author?.display_name} avatarUrl={post.author?.avatar_url} size={32}
            badge={post.author?.badge} tier={post.author?.membership_tier} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
              {post.author?.display_name ?? "Member"}
            </p>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{relativeTime(post.created_at)}</p>
          </div>
          <div className="flex items-center gap-2">
            {post.smoke_log && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(193,120,23,0.15)", color: "var(--primary)", border: "1px solid rgba(193,120,23,0.25)" }}>
                Burn Report
              </span>
            )}
            {post.user_id === userId && (
              <button type="button" onClick={() => setShowDeletePost(true)} aria-label="Delete post"
                className="flex items-center justify-center"
                style={{ width: 32, height: 32, background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2 4h12M5 4V2.5a.5.5 0 01.5-.5h5a.5.5 0 01.5.5V4M6 7v5M10 7v5M3 4l1 9.5a.5.5 0 00.5.5h7a.5.5 0 00.5-.5L13 4"
                    stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Title */}
        <h2 className="font-serif font-semibold text-base leading-snug mb-2" style={{ color: "var(--foreground)" }}>
          {post.title}
        </h2>

        {/* Body — burn report card OR text + optional image */}
        {post.smoke_log ? (
          <BurnReportCard log={post.smoke_log} />
        ) : (
          <>
            <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)", whiteSpace: "pre-line", opacity: 0.9 }}>
              {post.content}
            </p>

            {post.image_url && (
              <button type="button" onClick={() => setLightboxOpen(true)}
                className="mt-3 rounded-xl overflow-hidden block"
                style={{ width: "100%", border: "none", padding: 0, cursor: "pointer", touchAction: "manipulation" }}
                aria-label="View image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={post.image_url} alt=""
                  style={{ width: "100%", maxHeight: 260, objectFit: "cover", display: "block" }} />
              </button>
            )}
          </>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-4 mt-4">
          {isFeedback ? (
            <>
              {/* Upvote */}
              <button type="button" onClick={() => handleVote(1)} disabled={voting}
                aria-label="Upvote"
                className="flex items-center gap-1"
                style={{
                  background:              userVote === 1 ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.04)",
                  border:                  userVote === 1 ? "1px solid rgba(74,222,128,0.35)" : "1px solid var(--border)",
                  borderRadius:            8,
                  padding:                 "4px 8px",
                  color:                   userVote === 1 ? "#4ade80" : "var(--muted-foreground)",
                  cursor:                  voting ? "default" : "pointer",
                  touchAction:             "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  minHeight:               32,
                } as React.CSSProperties}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M6 2L10 8H2L6 2Z" fill={userVote === 1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
                <span className="text-xs font-semibold">{upvotes}</span>
              </button>

              {/* Downvote */}
              <button type="button" onClick={() => handleVote(-1)} disabled={voting}
                aria-label="Downvote"
                className="flex items-center gap-1"
                style={{
                  background:              userVote === -1 ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.04)",
                  border:                  userVote === -1 ? "1px solid rgba(248,113,113,0.35)" : "1px solid var(--border)",
                  borderRadius:            8,
                  padding:                 "4px 8px",
                  color:                   userVote === -1 ? "#f87171" : "var(--muted-foreground)",
                  cursor:                  voting ? "default" : "pointer",
                  touchAction:             "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  minHeight:               32,
                } as React.CSSProperties}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ transform: "rotate(180deg)" }}>
                  <path d="M6 2L10 8H2L6 2Z" fill={userVote === -1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
                <span className="text-xs font-semibold">{downvotes}</span>
              </button>
            </>
          ) : (
            /* Like */
            <button type="button" onClick={handleLike} disabled={liking}
              className="flex items-center gap-1.5"
              style={{
                background: "none", border: "none",
                cursor: liking ? "default" : "pointer",
                touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
                color: liked ? "var(--gold,#D4A04A)" : "var(--muted-foreground)",
                minHeight: 36, padding: 0,
              }}>
              <FlameIcon size={18} filled={liked} />
              <span className="text-xs font-medium">{likeCount}</span>
            </button>
          )}

          {/* Comments */}
          <button type="button" onClick={() => setCommentsOpen((v) => !v)}
            className="flex items-center gap-1.5"
            style={{
              background: "none", border: "none",
              cursor: "pointer",
              touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
              color: commentsOpen ? "var(--gold,#D4A04A)" : "var(--muted-foreground)",
              minHeight: 36, padding: 0,
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <span className="text-xs font-medium">{commentCount}</span>
          </button>
        </div>
      </div>

      {/* Inline comments */}
      {commentsOpen && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px 16px" }}>
          {commentsLoading ? (
            <div className="flex justify-center py-6">
              <span className="inline-block rounded-full border-2 border-current border-t-transparent animate-spin"
                style={{ width: 20, height: 20, color: "var(--muted-foreground)" }} />
            </div>
          ) : (
            <>
              {/* Add comment */}
              {!post.is_locked && (
                <div className="mb-4">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    className="w-full rounded-xl px-4 py-3 text-sm resize-none"
                    style={{
                      minHeight: 72,
                      backgroundColor: "rgba(255,255,255,0.05)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                  {commentError && (
                    <p className="text-xs mt-1" style={{ color: "#E8642C" }}>{commentError}</p>
                  )}
                  <button type="button" onClick={handleComment}
                    disabled={commentText.trim().length < 3 || commentSubmitting}
                    className="mt-2 px-5 rounded-xl font-semibold text-xs"
                    style={{
                      height: 36,
                      background: commentText.trim().length >= 3 ? "linear-gradient(135deg,#D4A04A,#C17817)" : "rgba(212,160,74,0.3)",
                      color: "#1A1210",
                      border: "none",
                      cursor: commentText.trim().length >= 3 ? "pointer" : "default",
                      touchAction: "manipulation",
                    }}>
                    {commentSubmitting ? "Posting..." : "Post Comment"}
                  </button>
                </div>
              )}

              {topLevel.length === 0 && (
                <p className="text-xs py-2 text-center" style={{ color: "var(--muted-foreground)" }}>
                  No comments yet.
                </p>
              )}

              {topLevel.map((comment) => (
                <div key={comment.id}>
                  <CommentNode comment={comment} userId={userId} postId={post.id}
                    onDelete={handleDeleteComment} onEditSave={handleEditSave} onReplyCreated={handleReplyCreated} />
                  {repliesOf(comment.id).map((reply) => (
                    <CommentNode key={reply.id} comment={reply} isReply userId={userId} postId={post.id}
                      onDelete={handleDeleteComment} onEditSave={handleEditSave} onReplyCreated={handleReplyCreated} />
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {deleteModal}
      {imageLightbox}
    </div>
  );
}
