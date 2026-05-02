"use client";

import { useState, useEffect, useMemo, memo } from "react";
import { createPortal }                        from "react-dom";
import { useRouter }                           from "next/navigation";
import { createClient }                        from "@/utils/supabase/client";
import { formatDistanceToNow }                 from "date-fns";
import { AvatarFrame }                         from "@/components/ui/AvatarFrame";
import { resolveBadge }                        from "@/lib/badge";
import { VerdictCard }                         from "@/components/humidor/VerdictCard";

/* ------------------------------------------------------------------ */
/* Exported type — consumed by the server page                          */
/* ------------------------------------------------------------------ */

export interface BurnReportThirds {
  thirds_enabled:  boolean;
  third_beginning: string | null;
  third_middle:    string | null;
  third_end:       string | null;
}

/* Normalize the join shape — PostgREST may return the 1:1 child as
   an array OR an object depending on metadata; flatten to an object. */
export function unwrapBurnReport(
  raw: BurnReportThirds | BurnReportThirds[] | null | undefined
): BurnReportThirds | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

export interface SmokeLogData {
  id:                     string;
  smoked_at:              string;
  overall_rating:         number | null;
  draw_rating:            number | null;
  burn_rating:            number | null;
  construction_rating:    number | null;
  flavor_rating:          number | null;
  pairing_drink:          string | null;
  pairing_food:           string | null;
  location:               string | null;
  occasion:               string | null;
  smoke_duration_minutes: number | null;
  review_text:            string | null;
  photo_urls:             string[] | null;
  content_video_id:       string | null;
  /* Resolved flavor names (from flavor_tag_ids ⨝ flavor_tags). The
     verdict-card flavor sentence renders these directly. Lounge call
     sites populate this after fetching the smoke log + tags. */
  flavor_tag_names?:      string[];
  cigar: {
    brand:  string | null;
    series: string | null;
    format: string | null;
  } | null;
  /* Thirds joined from the burn_reports table (1:1, optional).
     PostgREST returns embedded relations as arrays even when the FK
     is UNIQUE — callers should use a helper like `unwrapBurnReport`
     to flatten before passing to <VerdictCard />. We accept both
     shapes here so legacy callers don't break. */
  burn_report?: BurnReportThirds | BurnReportThirds[] | null;
  /* The post author's display name + city, used for the verdict-card
     byline ("DAVE · SALT LAKE CITY"). On lounge surfaces these come
     from the post author's profile, NOT the viewer's. */
  author_display_name?: string | null;
  author_city?:         string | null;
}

/* ------------------------------------------------------------------ */

interface Post {
  id:          string;
  title:       string;
  content:     string;
  created_at:  string;
  updated_at:  string;
  is_system:   boolean;
  is_locked:   boolean;
  user_id:     string | null;
  category_id: string;
  category:    { name: string; slug: string };
  author:      { display_name: string | null; avatar_url: string | null; badge?: string | null; membership_tier?: string | null } | null;
  like_count:  number;
  image_url:   string | null;
}

interface Comment {
  id:                string;
  content:           string;
  created_at:        string;
  updated_at:        string;
  user_id:           string;
  parent_comment_id: string | null;
  profiles:          { display_name: string | null; avatar_url: string | null; badge?: string | null; membership_tier?: string | null } | null;
}

interface Props {
  post:      Post;
  comments:  Comment[];
  hasLiked:  boolean;
  userId:    string;
  smokeLog?: SmokeLogData | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
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

function Avatar({
  name,
  avatarUrl,
  size = 32,
  badge,
  tier,
}: {
  name:      string | null | undefined;
  avatarUrl: string | null | undefined;
  size?:     number;
  badge?:    string | null;
  tier?:     string | null;
}) {
  const resolved = resolveBadge(badge, tier);
  const inner = avatarUrl ? (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", border: "1px solid var(--border)", flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatarUrl} alt={name ?? "Member"} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  ) : (
    <div
      className="flex items-center justify-center rounded-full shrink-0 text-xs font-semibold"
      style={{ width: size, height: size, background: "var(--secondary)", color: "var(--muted-foreground)" }}
    >
      {initials(name)}
    </div>
  );
  return <AvatarFrame badge={resolved} size={size}>{inner}</AvatarFrame>;
}

function FlameIcon({ size = 20, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* BurnReportCard — wraps the shared <VerdictCard /> + a photo lightbox */
/* ------------------------------------------------------------------ */

const BurnReportCard = memo(function BurnReportCard({ log }: { log: SmokeLogData }) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [mounted,     setMounted]     = useState(false);
  const thirds = unwrapBurnReport(log.burn_report);

  useEffect(() => { setMounted(true); }, []);

  const lightbox = mounted && lightboxSrc
    ? createPortal(
        <>
          <div
            onClick={() => setLightboxSrc(null)}
            style={{ position: "fixed", inset: 0, zIndex: 9998, backgroundColor: "rgba(0,0,0,0.92)" }}
          />
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightboxSrc} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} />
            <button
              type="button"
              onClick={() => setLightboxSrc(null)}
              aria-label="Close"
              style={{
                position: "absolute", top: 16, right: 16,
                width: 36, height: 36, borderRadius: "50%",
                background: "rgba(255,255,255,0.12)", border: "none",
                color: "#fff", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
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
    <div style={{ marginTop: 12 }}>
      <VerdictCard
        cigar={log.cigar}
        smokedAt={log.smoked_at}
        overallRating={log.overall_rating}
        drawRating={log.draw_rating}
        burnRating={log.burn_rating}
        constructionRating={log.construction_rating}
        flavorRating={log.flavor_rating}
        reviewText={log.review_text}
        smokeDurationMinutes={log.smoke_duration_minutes}
        pairingDrink={log.pairing_drink}
        occasion={log.occasion}
        flavorTagNames={log.flavor_tag_names ?? []}
        photoUrls={(log.photo_urls ?? []).filter(Boolean)}
        thirdsEnabled={thirds?.thirds_enabled ?? false}
        thirdBeginning={thirds?.third_beginning ?? null}
        thirdMiddle={thirds?.third_middle ?? null}
        thirdEnd={thirds?.third_end ?? null}
        displayName={log.author_display_name ?? null}
        city={log.author_city ?? null}
        onPhotoClick={(url) => setLightboxSrc(url)}
      />
      {lightbox}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* CommentNode — module-level component so it never remounts on parent
   re-renders. Manages its own reply/edit/delete state entirely.       */
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
  comment,
  isReply = false,
  userId,
  postId,
  onDelete,
  onEditSave,
  onReplyCreated,
}: CommentNodeProps) {
  const supabase = useMemo(() => createClient(), []);

  const [editMode,       setEditMode]       = useState(false);
  const [editText,       setEditText]       = useState(comment.content);
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [replyMode,      setReplyMode]      = useState(false);
  const [replyText,      setReplyText]      = useState("");
  const [submitting,     setSubmitting]     = useState(false);

  const isOwn = comment.user_id === userId;

  async function handleSaveEdit() {
    if (!editText.trim()) return;
    const { error } = await supabase
      .from("forum_comments")
      .update({ content: editText.trim(), updated_at: new Date().toISOString() })
      .eq("id", comment.id);
    if (!error) {
      onEditSave(comment.id, editText.trim());
      setEditMode(false);
    }
  }

  async function handleDelete() {
    await supabase.from("forum_comments").delete().eq("id", comment.id);
    onDelete(comment.id);
    setConfirmDelete(false);
  }

  async function handleReply() {
    if (replyText.trim().length < 3 || submitting) return;
    setSubmitting(true);

    const { data, error } = await supabase
      .from("forum_comments")
      .insert({
        user_id:           userId,
        post_id:           postId,
        content:           replyText.trim(),
        parent_comment_id: comment.id,
      })
      .select("id, content, created_at, updated_at, user_id, parent_comment_id")
      .single();

    if (error || !data) { setSubmitting(false); return; }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, badge, membership_tier")
      .eq("id", userId)
      .single();

    onReplyCreated({ ...data, profiles: profileData ?? null });
    setReplyText("");
    setReplyMode(false);
    setSubmitting(false);
  }

  return (
    <div
      style={{
        marginLeft:    isReply ? 24 : 0,
        paddingTop:    12,
        paddingBottom: 12,
        borderBottom:  "1px solid var(--border)",
      }}
    >
      {/* Author row */}
      <div className="flex items-center gap-2 mb-2">
        <Avatar name={comment.profiles?.display_name} avatarUrl={comment.profiles?.avatar_url} size={28} badge={comment.profiles?.badge} tier={comment.profiles?.membership_tier} />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
            {comment.profiles?.display_name ?? "Member"}
          </span>
          <span className="text-xs ml-2" style={{ color: "var(--muted-foreground)" }}>
            {relativeTime(comment.created_at)}
          </span>
        </div>
      </div>

      {/* Content or edit form */}
      {editMode ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm resize-none"
            style={{
              minHeight:       80,
              backgroundColor: "rgba(255,255,255,0.05)",
              border:          "1px solid var(--border)",
              color:           "var(--foreground)",
              fontSize:        14,
              outline:         "none",
            }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveEdit}
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{
                background:  "var(--gold, #D4A04A)",
                color:       "#1A1210",
                border:      "none",
                cursor:      "pointer",
                touchAction: "manipulation",
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => { setEditMode(false); setEditText(comment.content); }}
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{
                background:  "transparent",
                color:       "var(--muted-foreground)",
                border:      "1px solid var(--border)",
                cursor:      "pointer",
                touchAction: "manipulation",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--foreground)", whiteSpace: "pre-line" }}>
          {comment.content}
        </p>
      )}

      {/* Action row */}
      {!editMode && (
        <div className="flex items-center gap-3 mt-2">
          {!isReply && (
            <button
              type="button"
              onClick={() => { setReplyMode((v) => !v); setReplyText(""); }}
              className="text-xs"
              style={{
                color: "var(--muted-foreground)", background: "none",
                border: "none", cursor: "pointer", touchAction: "manipulation", padding: 0,
              }}
            >
              Reply
            </button>
          )}
          {isOwn && (
            <>
              <button
                type="button"
                onClick={() => { setEditMode(true); setEditText(comment.content); }}
                className="text-xs"
                style={{
                  color: "var(--muted-foreground)", background: "none",
                  border: "none", cursor: "pointer", touchAction: "manipulation", padding: 0,
                }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-xs"
                style={{
                  color: "#E8642C", background: "none",
                  border: "none", cursor: "pointer", touchAction: "manipulation", padding: 0,
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
          <span>Delete this comment?</span>
          <button
            type="button"
            onClick={handleDelete}
            style={{
              color: "#E8642C", background: "none", border: "none",
              cursor: "pointer", touchAction: "manipulation", padding: 0, fontWeight: 600,
            }}
          >
            Yes, delete
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            style={{
              color: "var(--muted-foreground)", background: "none", border: "none",
              cursor: "pointer", touchAction: "manipulation", padding: 0,
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Reply form */}
      {replyMode && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a reply..."
            autoFocus
            className="w-full rounded-xl px-3 py-2 text-sm resize-none"
            style={{
              minHeight:       72,
              backgroundColor: "rgba(255,255,255,0.05)",
              border:          "1px solid var(--border)",
              color:           "var(--foreground)",
              fontSize:        14,
              outline:         "none",
            }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReply}
              onMouseDown={(e) => e.preventDefault()}
              disabled={replyText.trim().length < 3 || submitting}
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{
                background:  replyText.trim().length >= 3 ? "var(--gold, #D4A04A)" : "rgba(212,160,74,0.3)",
                color:       "#1A1210",
                border:      "none",
                cursor:      replyText.trim().length >= 3 ? "pointer" : "default",
                touchAction: "manipulation",
              }}
            >
              {submitting ? "Sending..." : "Send Reply"}
            </button>
            <button
              type="button"
              onClick={() => { setReplyMode(false); setReplyText(""); }}
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{
                background:  "transparent",
                color:       "var(--muted-foreground)",
                border:      "1px solid var(--border)",
                cursor:      "pointer",
                touchAction: "manipulation",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* PostDetailClient                                                     */
/* ------------------------------------------------------------------ */

export function PostDetailClient({ post, comments: initialComments, hasLiked, userId, smokeLog }: Props) {
  const router   = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [liked,           setLiked]           = useState(hasLiked);
  const [likeCount,       setLikeCount]       = useState(post.like_count);
  const [liking,          setLiking]          = useState(false);
  const [localComments,   setLocalComments]   = useState<Comment[]>(initialComments);
  const [commentText,     setCommentText]     = useState("");
  const [submitting,      setSubmitting]      = useState(false);
  const [commentError,    setCommentError]    = useState<string | null>(null);
  const [showDeletePost,  setShowDeletePost]  = useState(false);
  const [deletingPost,    setDeletingPost]    = useState(false);
  const [lightboxOpen,    setLightboxOpen]    = useState(false);
  const [mounted,         setMounted]         = useState(false);

  useEffect(() => { setMounted(true); }, []);

  /* ---- Like toggle ------------------------------------------------- */

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

  /* ---- Submit top-level comment ----------------------------------- */

  async function handleComment() {
    if (commentText.trim().length < 3 || submitting) return;
    setSubmitting(true);
    setCommentError(null);

    const { data, error } = await supabase
      .from("forum_comments")
      .insert({ user_id: userId, post_id: post.id, content: commentText.trim(), parent_comment_id: null })
      .select("id, content, created_at, updated_at, user_id, parent_comment_id")
      .single();

    setSubmitting(false);
    if (error || !data) { setCommentError(error?.message ?? "Failed to post."); return; }

    const { data: profileData } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", userId).single();
    setLocalComments((prev) => [...prev, { ...data, profiles: profileData ?? null }]);
    setCommentText("");
  }

  /* ---- Handlers passed to CommentNode ----------------------------- */

  function handleDeleteComment(id: string) {
    setLocalComments((prev) => prev.filter((c) => c.id !== id && c.parent_comment_id !== id));
  }

  function handleEditSave(id: string, text: string) {
    setLocalComments((prev) => prev.map((c) => c.id === id ? { ...c, content: text } : c));
  }

  function handleReplyCreated(reply: Comment) {
    setLocalComments((prev) => [...prev, reply]);
  }

  /* ---- Delete post ------------------------------------------------- */

  async function handleDeletePost() {
    setDeletingPost(true);
    await supabase.from("forum_posts").delete().eq("id", post.id);
    router.push("/lounge");
  }

  /* ---- Comment tree ----------------------------------------------- */

  const topLevel = localComments.filter((c) => c.parent_comment_id === null);
  const repliesOf = (parentId: string) => localComments.filter((c) => c.parent_comment_id === parentId);

  /* ---- Portals ---------------------------------------------------- */

  const deletePostModal = mounted && showDeletePost
    ? createPortal(
        <>
          <div onClick={() => setShowDeletePost(false)} style={{ position: "fixed", inset: 0, zIndex: 9998, backgroundColor: "rgba(0,0,0,0.6)" }} />
          <div
            style={{
              position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              zIndex: 9999, backgroundColor: "var(--card)", borderRadius: 16, padding: 24,
              width: "calc(100% - 48px)", maxWidth: 320, border: "1px solid var(--border)",
            }}
          >
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
          <div onClick={() => setLightboxOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9998, backgroundColor: "rgba(0,0,0,0.92)" }} />
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.image_url!} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} />
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close"
              style={{
                position: "absolute", top: 16, right: 16,
                width: 36, height: 36, borderRadius: "50%",
                background: "rgba(255,255,255,0.12)", border: "none",
                color: "#fff", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
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
    <div style={{ minHeight: "100dvh", backgroundColor: "var(--background)", paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}>
      {/* Back bar */}
      <div className="flex items-center justify-between px-4" style={{ height: 56, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm"
          style={{
            color: "var(--gold, #D4A04A)", background: "none", border: "none",
            cursor: "pointer", touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
            minHeight: 44, padding: "0 4px",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>

        <span
          className="text-xs font-medium px-2.5 py-1 rounded-full"
          style={{ border: "1px solid var(--gold, #D4A04A)", color: "var(--gold, #D4A04A)" }}
        >
          {post.category.name}
        </span>

        {!post.is_system && post.user_id === userId ? (
          <button
            type="button"
            onClick={() => setShowDeletePost(true)}
            className="flex items-center justify-center"
            style={{
              width: 36, height: 36, background: "none", border: "none",
              color: "var(--muted-foreground)", cursor: "pointer",
              touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
            }}
            aria-label="Delete post"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 4h12M5 4V2.5a.5.5 0 01.5-.5h5a.5.5 0 01.5.5V4M6 7v5M10 7v5M3 4l1 9.5a.5.5 0 00.5.5h7a.5.5 0 00.5-.5L13 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <div style={{ width: 36 }} />
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Post */}
        <div className="px-4 pt-5 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h1 className="font-serif font-semibold text-xl leading-snug mb-3" style={{ color: "var(--foreground)" }}>
            {post.title}
          </h1>

          <div className="flex items-center gap-2 mb-4">
            <Avatar
              name={post.is_system ? "Ash & Ember Society" : post.author?.display_name}
              avatarUrl={post.is_system ? null : post.author?.avatar_url}
              size={32}
              badge={post.is_system ? null : post.author?.badge}
              tier={post.is_system ? null : post.author?.membership_tier}
            />
            <div>
              <p className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                {post.is_system ? "Ash & Ember Society" : (post.author?.display_name ?? "Member")}
              </p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {relativeTime(post.created_at)}
              </p>
            </div>
          </div>

          {/* Body: burn report card OR text content + optional image */}
          {smokeLog ? (
            <BurnReportCard log={smokeLog} />
          ) : (
            <>
              <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)", whiteSpace: "pre-line" }}>
                {post.content}
              </p>

              {post.image_url && (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="mt-4 rounded-xl overflow-hidden block"
                  style={{
                    width: "100%", maxHeight: 260,
                    border: "none", padding: 0, cursor: "pointer",
                    touchAction: "manipulation",
                  }}
                  aria-label="View image"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.image_url}
                    alt=""
                    style={{ width: "100%", height: "100%", maxHeight: 260, objectFit: "cover", display: "block" }}
                  />
                </button>
              )}
            </>
          )}

          {/* Like button — right aligned */}
          <div className="flex justify-end mt-5">
            <button
              type="button"
              onClick={handleLike}
              disabled={liking}
              className="flex items-center gap-1.5"
              style={{
                background: "none", border: "none",
                cursor: liking ? "default" : "pointer",
                touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
                color: liked ? "var(--gold, #D4A04A)" : "var(--muted-foreground)",
                minHeight: 44, padding: 0,
              }}
            >
              <FlameIcon size={20} filled={liked} />
              <span className="text-sm font-medium">{likeCount}</span>
            </button>
          </div>
        </div>

        {/* Comments */}
        <div className="px-4 pt-4">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>
            Comments ({topLevel.length})
          </p>

          {!post.is_locked && (
            <div className="mb-4 mt-3">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                className="w-full rounded-xl px-4 py-3 text-sm resize-none"
                style={{
                  minHeight:       80,
                  backgroundColor: "rgba(255,255,255,0.05)",
                  border:          "1px solid var(--border)",
                  color:           "var(--foreground)",
                  fontSize:        14,
                  outline:         "none",
                }}
              />
              {commentError && (
                <p className="text-xs mt-1" style={{ color: "#E8642C" }}>{commentError}</p>
              )}
              <button
                type="button"
                onClick={handleComment}
                onMouseDown={(e) => e.preventDefault()}
                disabled={commentText.trim().length < 3 || submitting}
                className="mt-3 w-full px-5 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5"
                style={{
                  height:     44,
                  background: commentText.trim().length >= 3 ? "linear-gradient(135deg, #D4A04A, #C17817)" : "rgba(212,160,74,0.3)",
                  color:      "#1A1210",
                  border:     "none",
                  cursor:     commentText.trim().length >= 3 ? "pointer" : "default",
                  touchAction: "manipulation",
                  position:   "relative",
                  zIndex:     1,
                }}
              >
                {submitting ? "Posting..." : "Post Comment"}
              </button>
            </div>
          )}

          {topLevel.length === 0 && (
            <p className="text-xs py-6 text-center" style={{ color: "var(--muted-foreground)" }}>No comments yet.</p>
          )}

          {topLevel.map((comment) => (
            <div key={comment.id}>
              <CommentNode
                comment={comment}
                userId={userId}
                postId={post.id}
                onDelete={handleDeleteComment}
                onEditSave={handleEditSave}
                onReplyCreated={handleReplyCreated}
              />
              {repliesOf(comment.id).map((reply) => (
                <CommentNode
                  key={reply.id}
                  comment={reply}
                  isReply
                  userId={userId}
                  postId={post.id}
                  onDelete={handleDeleteComment}
                  onEditSave={handleEditSave}
                  onReplyCreated={handleReplyCreated}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {deletePostModal}
      {imageLightbox}
    </div>
  );
}
