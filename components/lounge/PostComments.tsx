"use client";

/*
 * PostComments — the lounge comment machinery, extracted from
 * InlinePost so the same composer + threaded list renders in two
 * places: inline under a feed card (mounted when the comments toggle
 * opens) and inside the fullscreen burn-report modal.
 *
 * Loads every comment for the post on mount — callers control
 * lazy-loading by mounting the component on demand (InlinePost only
 * mounts it when commentsOpen flips true, preserving the previous
 * load-on-first-open behavior).
 */

import { useState, useEffect, useMemo, memo } from "react";
import { createClient }        from "@/utils/supabase/client";

/* Fire-and-forget push-notification trigger. The server re-verifies
   the comment (must exist, belong to the caller, be fresh) and works
   out recipients itself — see app/api/notify/comment/route.ts. A
   failure here must never affect the comment UX. */
function notifyCommentCreated(commentId: string) {
  void fetch("/api/notify/comment", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ commentId }),
    keepalive: true,
  }).catch(() => {});
}
import { formatDistanceToNow } from "date-fns";
import Image                   from "next/image";
import { AvatarFrame }         from "@/components/ui/AvatarFrame";
import { resolveBadge }        from "@/lib/badge";
import { log }                 from "@/lib/log";
import { PhotoLightbox }       from "@/components/ui/PhotoLightbox";
import { compressImage }       from "@/lib/image-compress";
import { checkResponse }       from "@/lib/telemetry/fetch-checks";

/* Compress + upload a comment image; returns the public URL.
   Throws with a user-facing message on failure. Exported for
   PostDetailClient, which carries its own copy of the comment
   machinery (pre-existing duplication). */
export async function uploadCommentImage(file: File): Promise<string> {
  const upload = await compressImage(file);
  const fd = new FormData();
  fd.append("file",   upload);
  fd.append("folder", "forum-comments");
  const res = checkResponse(
    await fetch("/api/upload/image", { method: "POST", body: fd }),
    { route: "/api/upload/image" },
  );
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: "Photo upload failed." }));
    throw new Error(error ?? "Photo upload failed.");
  }
  const { url } = await res.json();
  return url as string;
}

/* Small square preview with a remove X — shared by the comment and
   reply composers. */
export function ComposerImagePreview({ preview, onRemove }: { preview: string; onRemove: () => void }) {
  return (
    <div className="relative rounded-xl overflow-hidden" style={{ width: 72, height: 72 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="Photo preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 flex items-center justify-center rounded-full"
        style={{ width: 24, height: 24, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", cursor: "pointer", touchAction: "manipulation" }}
        aria-label="Remove photo"
      >
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
          <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/* "Add Photo" affordance for the composers — a camera-ish icon button. */
export function AddPhotoButton({ onPick }: { onPick: (file: File) => void }) {
  return (
    <label
      className="flex items-center gap-1.5 text-xs"
      style={{ color: "var(--muted-foreground)", cursor: "pointer", touchAction: "manipulation", width: "fit-content" }}
    >
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
        <rect x="1.5" y="3.5" width="13" height="10" rx="2" />
        <circle cx="8" cy="8.5" r="2.5" />
        <path d="M5.5 3.5L6.5 2h3l1 1.5" />
      </svg>
      Add Photo
    </label>
  );
}

/* Comment image rendered in the thread; tap opens the shared viewer. */
export function CommentImage({ url }: { url: string }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setViewerOpen(true)}
        className="mt-2 rounded-xl overflow-hidden block"
        style={{ border: "none", padding: 0, cursor: "pointer", touchAction: "manipulation", maxWidth: 220 }}
        aria-label="View photo"
      >
        <Image
          src={url}
          alt=""
          width={440}
          height={330}
          sizes="220px"
          quality={75}
          style={{ width: "100%", height: "auto", maxHeight: 180, objectFit: "cover", display: "block", borderRadius: 12 }}
        />
      </button>
      {viewerOpen && (
        <PhotoLightbox urls={[url]} initialIndex={0} onClose={() => setViewerOpen(false)} />
      )}
    </>
  );
}

export interface Comment {
  id:                string;
  content:           string;
  created_at:        string;
  updated_at:        string;
  user_id:           string;
  parent_comment_id: string | null;
  image_url?:        string | null;
  profiles: {
    display_name:    string | null;
    avatar_url:      string | null;
    badge:           string | null;
    membership_tier: string | null;
  } | null;
}

interface PostCommentsProps {
  postId:         string;
  userId:         string;
  isLocked:       boolean;
  onCountChange?: (delta: number) => void;
}

function relativeTime(iso: string): string {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return ""; }
}

function Avatar({
  name, avatarUrl, size = 32, badge, tier,
}: { name?: string | null; avatarUrl?: string | null; size?: number; badge?: string | null; tier?: string | null }) {
  return (
    <AvatarFrame
      badge={resolveBadge(badge, tier)}
      size={size}
      name={name}
      avatarUrl={avatarUrl}
    />
  );
}

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
  const [replyImage,    setReplyImage]    = useState<File | null>(null);
  const [replyPreview,  setReplyPreview]  = useState<string | null>(null);
  const [replyError,    setReplyError]    = useState<string | null>(null);
  const [submitting,    setSubmitting]    = useState(false);
  const isOwn = comment.user_id === userId;

  function clearReplyImage() {
    if (replyPreview) URL.revokeObjectURL(replyPreview);
    setReplyImage(null);
    setReplyPreview(null);
  }

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
    setReplyError(null);

    let image_url: string | null = null;
    if (replyImage) {
      try {
        image_url = await uploadCommentImage(replyImage);
      } catch (err) {
        setReplyError(err instanceof Error ? err.message : "Photo upload failed.");
        setSubmitting(false);
        return;
      }
    }

    const { data, error } = await supabase.from("forum_comments")
      .insert({ user_id: userId, post_id: postId, content: replyText.trim(), parent_comment_id: comment.id, image_url })
      .select("id, content, created_at, updated_at, user_id, parent_comment_id, image_url")
      .single();
    if (error || !data) { setReplyError(error?.message ?? "Failed to reply."); setSubmitting(false); return; }
    notifyCommentCreated(data.id);
    const { data: p } = await supabase.from("public_profiles")
      .select("display_name, avatar_url, badge, membership_tier").eq("id", userId).single();
    onReplyCreated({ ...data, profiles: p ?? null });
    setReplyText(""); clearReplyImage(); setReplyMode(false); setSubmitting(false);
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
        <>
          <p className="text-sm" style={{ color: "var(--foreground)", whiteSpace: "pre-line" }}>{comment.content}</p>
          {comment.image_url && <CommentImage url={comment.image_url} />}
        </>
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
          {replyPreview
            ? <ComposerImagePreview preview={replyPreview} onRemove={clearReplyImage} />
            : <AddPhotoButton onPick={(file) => { setReplyImage(file); setReplyPreview(URL.createObjectURL(file)); }} />}
          {replyError && <p className="text-xs" style={{ color: "#E8642C" }}>{replyError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={handleReply}
              onMouseDown={(e) => e.preventDefault()}
              disabled={replyText.trim().length < 3 || submitting}
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: replyText.trim().length >= 3 ? "var(--gold,#D4A04A)" : "rgba(212,160,74,0.3)", color: "#1A1210", border: "none", cursor: replyText.trim().length >= 3 ? "pointer" : "default", touchAction: "manipulation" }}>
              {submitting ? "Sending..." : "Send Reply"}
            </button>
            <button type="button" onClick={() => { setReplyMode(false); setReplyText(""); clearReplyImage(); }}
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: "transparent", color: "var(--muted-foreground)", border: "1px solid var(--border)", cursor: "pointer", touchAction: "manipulation" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* PostComments                                                          */
/* ------------------------------------------------------------------ */

export function PostComments({ postId, userId, isLocked, onCountChange }: PostCommentsProps) {
  const supabase = useMemo(() => createClient(), []);
  const [comments,          setComments]          = useState<Comment[] | null>(null);
  const [commentsLoading,   setCommentsLoading]   = useState(true);
  const [commentText,       setCommentText]       = useState("");
  const [commentImage,      setCommentImage]      = useState<File | null>(null);
  const [commentPreview,    setCommentPreview]    = useState<string | null>(null);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError,      setCommentError]      = useState<string | null>(null);

  function clearCommentImage() {
    if (commentPreview) URL.revokeObjectURL(commentPreview);
    setCommentImage(null);
    setCommentPreview(null);
  }

  /* Load comments on mount */
  useEffect(() => {
    if (comments !== null) return;
    setCommentsLoading(true);

    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from("forum_comments")
        .select("id, content, created_at, updated_at, user_id, parent_comment_id, image_url")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        log.error({ scope: "lounge:post-comments", message: "failed to load comments", post_id: postId, error });
      }

      const rows = data ?? [];
      const userIds = [...new Set(rows.map((c) => c.user_id))];
      const nameMap: Record<string, { display_name: string | null; avatar_url: string | null; badge: string | null; membership_tier: string | null }> = {};

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("public_profiles")
          .select("id, display_name, avatar_url, badge, membership_tier")
          .in("id", userIds);
        if (cancelled) return;
        for (const p of profiles ?? []) {
          nameMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url, badge: p.badge ?? null, membership_tier: p.membership_tier ?? null };
        }
      }

      if (cancelled) return;
      setComments(rows.map((c) => ({ ...c, profiles: nameMap[c.user_id] ?? null })));
      setCommentsLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [comments, postId, supabase]);

  /* Add comment */
  async function handleComment() {
    if (commentText.trim().length < 3 || commentSubmitting) return;
    setCommentSubmitting(true);
    setCommentError(null);

    let image_url: string | null = null;
    if (commentImage) {
      try {
        image_url = await uploadCommentImage(commentImage);
      } catch (err) {
        setCommentError(err instanceof Error ? err.message : "Photo upload failed.");
        setCommentSubmitting(false);
        return;
      }
    }

    const { data, error } = await supabase
      .from("forum_comments")
      .insert({ user_id: userId, post_id: postId, content: commentText.trim(), parent_comment_id: null, image_url })
      .select("id, content, created_at, updated_at, user_id, parent_comment_id, image_url")
      .single();

    setCommentSubmitting(false);
    if (error || !data) { setCommentError(error?.message ?? "Failed to post."); return; }
    notifyCommentCreated(data.id);

    const { data: profileData } = await supabase.from("public_profiles")
      .select("display_name, avatar_url, badge, membership_tier").eq("id", userId).single();
    setComments((prev) => [...(prev ?? []), { ...data, profiles: profileData ?? null }]);
    onCountChange?.(1);
    setCommentText("");
    clearCommentImage();
  }

  function handleDeleteComment(id: string) {
    setComments((prev) => (prev ?? []).filter((c) => c.id !== id && c.parent_comment_id !== id));
    onCountChange?.(-1);
  }

  function handleEditSave(id: string, text: string) {
    setComments((prev) => (prev ?? []).map((c) => c.id === id ? { ...c, content: text } : c));
  }

  function handleReplyCreated(reply: Comment) {
    setComments((prev) => [...(prev ?? []), reply]);
    onCountChange?.(1);
  }

  /* Group comments once per data change instead of re-filtering (top-level
     + a filter-per-parent) on every render, e.g. each composer keystroke.
     Order matches the source array, so the rendered tree is identical. */
  const { topLevel, repliesByParent } = useMemo(() => {
    const top: Comment[] = [];
    const byParent = new Map<string, Comment[]>();
    for (const c of comments ?? []) {
      if (c.parent_comment_id === null) {
        top.push(c);
      } else {
        const existing = byParent.get(c.parent_comment_id);
        if (existing) existing.push(c);
        else byParent.set(c.parent_comment_id, [c]);
      }
    }
    return { topLevel: top, repliesByParent: byParent };
  }, [comments]);

  return (
    <div>
      {commentsLoading ? (
        <div className="flex justify-center py-6">
          <span className="inline-block rounded-full border-2 border-current border-t-transparent animate-spin"
            style={{ width: 20, height: 20, color: "var(--muted-foreground)" }} />
        </div>
      ) : (
        <>
          {/* Add comment */}
          {!isLocked && (
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
              <div className="mt-2">
                {commentPreview
                  ? <ComposerImagePreview preview={commentPreview} onRemove={clearCommentImage} />
                  : <AddPhotoButton onPick={(file) => { setCommentImage(file); setCommentPreview(URL.createObjectURL(file)); }} />}
              </div>
              {commentError && (
                <p className="text-xs mt-1" style={{ color: "#E8642C" }}>{commentError}</p>
              )}
              <button type="button" onClick={handleComment}
                onMouseDown={(e) => e.preventDefault()}
                disabled={commentText.trim().length < 3 || commentSubmitting}
                className="mt-3 w-full px-5 rounded-xl font-semibold text-xs"
                style={{
                  height: 44,
                  background: commentText.trim().length >= 3 ? "linear-gradient(135deg,#D4A04A,#C17817)" : "rgba(212,160,74,0.3)",
                  color: "#1A1210",
                  border: "none",
                  cursor: commentText.trim().length >= 3 ? "pointer" : "default",
                  touchAction: "manipulation",
                  position: "relative",
                  zIndex: 1,
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
              <CommentNode comment={comment} userId={userId} postId={postId}
                onDelete={handleDeleteComment} onEditSave={handleEditSave} onReplyCreated={handleReplyCreated} />
              {(repliesByParent.get(comment.id) ?? []).map((reply) => (
                <CommentNode key={reply.id} comment={reply} isReply userId={userId} postId={postId}
                  onDelete={handleDeleteComment} onEditSave={handleEditSave} onReplyCreated={handleReplyCreated} />
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
