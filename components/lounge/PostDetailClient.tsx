"use client";

import { useState, useEffect }  from "react";
import { createPortal }         from "react-dom";
import { useRouter }            from "next/navigation";
import { createClient }         from "@/utils/supabase/client";
import { formatDistanceToNow }  from "date-fns";

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
  author:      { display_name: string | null } | null;
  like_count:  number;
}

interface Comment {
  id:                string;
  content:           string;
  created_at:        string;
  updated_at:        string;
  user_id:           string;
  parent_comment_id: string | null;
  profiles:          { display_name: string | null } | null;
}

interface Props {
  post:      Post;
  comments:  Comment[];
  hasLiked:  boolean;
  userId:    string;
}

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

/* ------------------------------------------------------------------ */

export function PostDetailClient({ post, comments: initialComments, hasLiked, userId }: Props) {
  const router   = useRouter();
  const supabase = createClient();

  const [liked,             setLiked]             = useState(hasLiked);
  const [likeCount,         setLikeCount]         = useState(post.like_count);
  const [liking,            setLiking]            = useState(false);

  const [localComments,     setLocalComments]     = useState<Comment[]>(initialComments);
  const [commentText,       setCommentText]       = useState("");
  const [submitting,        setSubmitting]        = useState(false);
  const [commentError,      setCommentError]      = useState<string | null>(null);

  const [replyingTo,        setReplyingTo]        = useState<string | null>(null);
  const [replyText,         setReplyText]         = useState("");
  const [submittingReply,   setSubmittingReply]   = useState(false);

  const [editingId,         setEditingId]         = useState<string | null>(null);
  const [editText,          setEditText]          = useState("");

  const [confirmDeleteId,   setConfirmDeleteId]   = useState<string | null>(null);
  const [showDeletePost,    setShowDeletePost]    = useState(false);
  const [deletingPost,      setDeletingPost]      = useState(false);

  const [mounted,           setMounted]           = useState(false);

  useEffect(() => { setMounted(true); }, []);

  /* ---- Like toggle ------------------------------------------------- */

  async function handleLike() {
    if (liking) return;
    setLiking(true);
    if (liked) {
      setLiked(false);
      setLikeCount((n) => Math.max(0, n - 1));
      await supabase
        .from("forum_post_likes")
        .delete()
        .eq("user_id", userId)
        .eq("post_id", post.id);
    } else {
      setLiked(true);
      setLikeCount((n) => n + 1);
      const { error } = await supabase
        .from("forum_post_likes")
        .insert({ user_id: userId, post_id: post.id });
      if (error && error.code !== "23505") {
        setLiked(false);
        setLikeCount((n) => Math.max(0, n - 1));
      }
    }
    setLiking(false);
  }

  /* ---- Submit comment ---------------------------------------------- */

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

    // Fetch profile for display
    const { data: profileData } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single();

    setLocalComments((prev) => [
      ...prev,
      { ...data, profiles: profileData ?? null },
    ]);
    setCommentText("");
  }

  /* ---- Submit reply ------------------------------------------------- */

  async function handleReply(parentId: string) {
    if (replyText.trim().length < 3 || submittingReply) return;
    setSubmittingReply(true);

    const { data, error } = await supabase
      .from("forum_comments")
      .insert({ user_id: userId, post_id: post.id, content: replyText.trim(), parent_comment_id: parentId })
      .select("id, content, created_at, updated_at, user_id, parent_comment_id")
      .single();

    setSubmittingReply(false);
    if (error || !data) return;

    const { data: profileData } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single();

    setLocalComments((prev) => [...prev, { ...data, profiles: profileData ?? null }]);
    setReplyingTo(null);
    setReplyText("");
  }

  /* ---- Edit comment ------------------------------------------------- */

  async function handleSaveEdit(commentId: string) {
    if (!editText.trim()) return;
    const { error } = await supabase
      .from("forum_comments")
      .update({ content: editText.trim(), updated_at: new Date().toISOString() })
      .eq("id", commentId);
    if (error) return;
    setLocalComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, content: editText.trim() } : c))
    );
    setEditingId(null);
  }

  /* ---- Delete comment ----------------------------------------------- */

  async function handleDeleteComment(commentId: string) {
    await supabase.from("forum_comments").delete().eq("id", commentId);
    setLocalComments((prev) => prev.filter((c) => c.id !== commentId && c.parent_comment_id !== commentId));
    setConfirmDeleteId(null);
  }

  /* ---- Delete post -------------------------------------------------- */

  async function handleDeletePost() {
    setDeletingPost(true);
    await supabase.from("forum_posts").delete().eq("id", post.id);
    router.push("/lounge");
  }

  /* ---- Comment node ------------------------------------------------- */

  function CommentNode({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) {
    const isOwn = comment.user_id === userId;
    return (
      <div
        style={{
          marginLeft:  isReply ? 24 : 0,
          paddingTop:  12,
          paddingBottom: 12,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Author row */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className="flex items-center justify-center rounded-full shrink-0 text-xs font-semibold"
            style={{
              width:      28,
              height:     28,
              background: "var(--secondary)",
              color:      "var(--muted-foreground)",
            }}
          >
            {initials(comment.profiles?.display_name)}
          </div>
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
        {editingId === comment.id ? (
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
                onClick={() => handleSaveEdit(comment.id)}
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
                onClick={() => setEditingId(null)}
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
        {editingId !== comment.id && (
          <div className="flex items-center gap-3 mt-2">
            {!isReply && (
              <button
                type="button"
                onClick={() => {
                  setReplyingTo(replyingTo === comment.id ? null : comment.id);
                  setReplyText("");
                }}
                className="text-xs"
                style={{
                  color:       "var(--muted-foreground)",
                  background:  "none",
                  border:      "none",
                  cursor:      "pointer",
                  touchAction: "manipulation",
                  padding:     0,
                }}
              >
                Reply
              </button>
            )}
            {isOwn && (
              <>
                <button
                  type="button"
                  onClick={() => { setEditingId(comment.id); setEditText(comment.content); }}
                  className="text-xs"
                  style={{
                    color:       "var(--muted-foreground)",
                    background:  "none",
                    border:      "none",
                    cursor:      "pointer",
                    touchAction: "manipulation",
                    padding:     0,
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(comment.id)}
                  className="text-xs"
                  style={{
                    color:       "#E8642C",
                    background:  "none",
                    border:      "none",
                    cursor:      "pointer",
                    touchAction: "manipulation",
                    padding:     0,
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        )}

        {/* Confirm delete */}
        {confirmDeleteId === comment.id && (
          <div
            className="flex items-center gap-2 mt-2 text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            <span>Delete this comment?</span>
            <button
              type="button"
              onClick={() => handleDeleteComment(comment.id)}
              style={{
                color:       "#E8642C",
                background:  "none",
                border:      "none",
                cursor:      "pointer",
                touchAction: "manipulation",
                padding:     0,
                fontWeight:  600,
              }}
            >
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              style={{
                color:       "var(--muted-foreground)",
                background:  "none",
                border:      "none",
                cursor:      "pointer",
                touchAction: "manipulation",
                padding:     0,
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Reply form */}
        {replyingTo === comment.id && (
          <div className="mt-3 flex flex-col gap-2">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply..."
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
                onClick={() => handleReply(comment.id)}
                disabled={replyText.trim().length < 3 || submittingReply}
                className="text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{
                  background:  replyText.trim().length >= 3 ? "var(--gold, #D4A04A)" : "rgba(212,160,74,0.3)",
                  color:       "#1A1210",
                  border:      "none",
                  cursor:      replyText.trim().length >= 3 ? "pointer" : "default",
                  touchAction: "manipulation",
                }}
              >
                {submittingReply ? "Sending..." : "Send Reply"}
              </button>
              <button
                type="button"
                onClick={() => { setReplyingTo(null); setReplyText(""); }}
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
  }

  /* ---- Top-level comments and their replies ------------------------ */

  const topLevel = localComments.filter((c) => c.parent_comment_id === null);
  const replies  = (parentId: string) =>
    localComments.filter((c) => c.parent_comment_id === parentId);

  /* ---- Delete post modal ------------------------------------------ */

  const deletePostModal = mounted && showDeletePost
    ? createPortal(
        <>
          <div
            onClick={() => setShowDeletePost(false)}
            style={{ position: "fixed", inset: 0, zIndex: 9998, backgroundColor: "rgba(0,0,0,0.6)" }}
          />
          <div
            style={{
              position:        "fixed",
              top:             "50%",
              left:            "50%",
              transform:       "translate(-50%, -50%)",
              zIndex:          9999,
              backgroundColor: "var(--card)",
              borderRadius:    16,
              padding:         24,
              width:           "calc(100% - 48px)",
              maxWidth:        320,
              border:          "1px solid var(--border)",
            }}
          >
            <h3 className="font-serif font-semibold text-base mb-2" style={{ color: "var(--foreground)" }}>
              Delete post?
            </h3>
            <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>
              This cannot be undone. All comments will also be removed.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeletePost(false)}
                className="flex-1 rounded-xl font-semibold text-sm"
                style={{
                  height:     44,
                  background: "transparent",
                  border:     "1px solid var(--border)",
                  color:      "var(--muted-foreground)",
                  cursor:     "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeletePost}
                disabled={deletingPost}
                className="flex-1 rounded-xl font-semibold text-sm"
                style={{
                  height:     44,
                  background: "#E8642C",
                  border:     "none",
                  color:      "#fff",
                  cursor:     deletingPost ? "default" : "pointer",
                }}
              >
                {deletingPost ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </>,
        document.body
      )
    : null;

  /* ---- Render ------------------------------------------------------ */

  return (
    <div
      className="flex flex-col"
      style={{
        minHeight:       "100dvh",
        backgroundColor: "var(--background)",
        paddingBottom:   "calc(72px + env(safe-area-inset-bottom))",
      }}
    >
      {/* Back bar */}
      <div
        className="flex items-center justify-between px-4"
        style={{
          height:       56,
          borderBottom: "1px solid var(--border)",
          flexShrink:   0,
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm"
          style={{
            color:                   "var(--gold, #D4A04A)",
            background:              "none",
            border:                  "none",
            cursor:                  "pointer",
            touchAction:             "manipulation",
            WebkitTapHighlightColor: "transparent",
            minHeight:               44,
            padding:                 "0 4px",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>

        {/* Category badge */}
        <span
          className="text-xs font-medium px-2.5 py-1 rounded-full"
          style={{
            border: "1px solid var(--gold, #D4A04A)",
            color:  "var(--gold, #D4A04A)",
          }}
        >
          {post.category.name}
        </span>

        {/* Delete post (own non-system posts only) */}
        {!post.is_system && post.user_id === userId && (
          <button
            type="button"
            onClick={() => setShowDeletePost(true)}
            className="flex items-center justify-center"
            style={{
              width:                   36,
              height:                  36,
              background:              "none",
              border:                  "none",
              color:                   "var(--muted-foreground)",
              cursor:                  "pointer",
              touchAction:             "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
            aria-label="Delete post"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 4h12M5 4V2.5a.5.5 0 01.5-.5h5a.5.5 0 01.5.5V4M6 7v5M10 7v5M3 4l1 9.5a.5.5 0 00.5.5h7a.5.5 0 00.5-.5L13 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* Spacer when no delete button */}
        {(post.is_system || post.user_id !== userId) && <div style={{ width: 36 }} />}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Post card */}
        <div className="px-4 pt-5 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h1
            className="font-serif font-semibold text-xl leading-snug mb-3"
            style={{ color: "var(--foreground)" }}
          >
            {post.title}
          </h1>

          {/* Author */}
          <div className="flex items-center gap-2 mb-4">
            <div
              className="flex items-center justify-center rounded-full shrink-0 text-xs font-semibold"
              style={{
                width:      32,
                height:     32,
                background: "var(--secondary)",
                color:      "var(--muted-foreground)",
              }}
            >
              {post.is_system ? "A" : initials(post.author?.display_name)}
            </div>
            <div>
              <p className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                {post.is_system ? "Ash & Ember Society" : (post.author?.display_name ?? "Member")}
              </p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {relativeTime(post.created_at)}
              </p>
            </div>
          </div>

          {/* Content */}
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--foreground)", whiteSpace: "pre-line" }}
          >
            {post.content}
          </p>

          {/* Like button */}
          <button
            type="button"
            onClick={handleLike}
            disabled={liking}
            className="flex items-center gap-1.5 mt-5"
            style={{
              background:              "none",
              border:                  "none",
              cursor:                  liking ? "default" : "pointer",
              touchAction:             "manipulation",
              WebkitTapHighlightColor: "transparent",
              color:                   liked ? "var(--gold, #D4A04A)" : "var(--muted-foreground)",
              minHeight:               44,
              padding:                 0,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill={liked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" strokeLinejoin="round" />
            </svg>
            <span className="text-sm font-medium">{likeCount}</span>
          </button>
        </div>

        {/* Comments section */}
        <div className="px-4 pt-4">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>
            Comments ({topLevel.length})
          </p>

          {/* Comment form */}
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
                disabled={commentText.trim().length < 3 || submitting}
                className="mt-2 px-5 rounded-xl font-semibold text-xs flex items-center gap-1.5"
                style={{
                  height:     40,
                  background: commentText.trim().length >= 3
                    ? "linear-gradient(135deg, #D4A04A, #C17817)"
                    : "rgba(212,160,74,0.3)",
                  color:      "#1A1210",
                  border:     "none",
                  cursor:     commentText.trim().length >= 3 ? "pointer" : "default",
                  touchAction: "manipulation",
                }}
              >
                {submitting ? "Posting..." : "Post Comment"}
              </button>
            </div>
          )}

          {/* Comment list */}
          {topLevel.length === 0 && (
            <p className="text-xs py-6 text-center" style={{ color: "var(--muted-foreground)" }}>
              No comments yet.
            </p>
          )}
          {topLevel.map((comment) => (
            <div key={comment.id}>
              <CommentNode comment={comment} />
              {replies(comment.id).map((reply) => (
                <CommentNode key={reply.id} comment={reply} isReply />
              ))}
            </div>
          ))}
        </div>
      </div>

      {deletePostModal}
    </div>
  );
}
