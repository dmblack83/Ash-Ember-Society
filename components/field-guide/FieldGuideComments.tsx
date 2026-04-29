"use client";

import { useEffect, useMemo, useState, memo } from "react";
import { createClient }  from "@/utils/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { AvatarFrame }   from "@/components/ui/AvatarFrame";
import { resolveBadge }  from "@/lib/badge";

/* ------------------------------------------------------------------
   Constants
   ------------------------------------------------------------------ */

const COMMENTS_LIMIT = 10;

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

type Profile = {
  display_name:    string | null;
  avatar_url:      string | null;
  badge:           string | null;
  membership_tier: string | null;
};

type Comment = {
  id:         string;
  vol_number: number;
  user_id:    string;
  content:    string;
  created_at: string;
  updated_at: string;
  profiles:   Profile | null;
};

/* ------------------------------------------------------------------
   Helpers — match PostModal.tsx exactly
   ------------------------------------------------------------------ */

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function relativeTime(iso: string): string {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); }
  catch { return ""; }
}

function Avatar({
  name,
  avatarUrl,
  badge,
  tier,
  size = 28,
}: {
  name:      string | null | undefined;
  avatarUrl: string | null | undefined;
  badge?:    string | null;
  tier?:     string | null;
  size?:     number;
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

/* ------------------------------------------------------------------
   CommentRow — flat, no replies (editorial content)
   ------------------------------------------------------------------ */

interface CommentRowProps {
  comment:     Comment;
  userId:      string | null;
  onDelete:    (id: string) => void;
  onEditSave:  (id: string, text: string) => void;
}

const CommentRow = memo(function CommentRow({
  comment,
  userId,
  onDelete,
  onEditSave,
}: CommentRowProps) {
  const supabase = useMemo(() => createClient(), []);

  const [editMode,      setEditMode]      = useState(false);
  const [editText,      setEditText]      = useState(comment.content);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving,        setSaving]        = useState(false);

  const isOwn = comment.user_id === userId;

  async function handleSaveEdit() {
    if (!editText.trim() || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from("field_guide_comments")
      .update({ content: editText.trim(), updated_at: new Date().toISOString() })
      .eq("id", comment.id);
    setSaving(false);
    if (!error) {
      onEditSave(comment.id, editText.trim());
      setEditMode(false);
    }
  }

  async function handleDelete() {
    await supabase.from("field_guide_comments").delete().eq("id", comment.id);
    onDelete(comment.id);
    setConfirmDelete(false);
  }

  return (
    <div
      style={{
        paddingTop:    12,
        paddingBottom: 12,
        borderBottom:  "1px solid var(--border)",
      }}
    >
      {/* Author row */}
      <div className="flex items-center gap-2 mb-2">
        <Avatar
          name={comment.profiles?.display_name}
          avatarUrl={comment.profiles?.avatar_url}
          badge={comment.profiles?.badge}
          tier={comment.profiles?.membership_tier}
          size={28}
        />
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
              disabled={saving}
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{
                background:  "var(--gold, #D4A04A)",
                color:       "#1A1210",
                border:      "none",
                cursor:      saving ? "default" : "pointer",
                touchAction: "manipulation",
              }}
            >
              {saving ? "Saving..." : "Save"}
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

      {/* Actions */}
      {!editMode && isOwn && (
        <div className="flex items-center gap-3 mt-2">
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
    </div>
  );
});

/* ------------------------------------------------------------------
   FieldGuideComments — main export
   ------------------------------------------------------------------ */

export function FieldGuideComments({ volNumber }: { volNumber: number }) {
  const supabase = useMemo(() => createClient(), []);

  const [userId,       setUserId]       = useState<string | null>(null);
  const [comments,     setComments]     = useState<Comment[]>([]);
  const [hasMore,      setHasMore]      = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [commentText,  setCommentText]  = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  /* Fetch user + first page of comments on mount */
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserId(user?.id ?? null);

      const { data } = await supabase
        .from("field_guide_comments")
        .select("id, vol_number, user_id, content, created_at, updated_at")
        .eq("vol_number", volNumber)
        .order("created_at", { ascending: true })
        .range(0, COMMENTS_LIMIT - 1);

      if (cancelled || !data) { setLoading(false); return; }

      const userIds = [...new Set(data.map((c) => c.user_id))] as string[];
      const profileMap = await fetchProfiles(supabase, userIds);

      if (!cancelled) {
        setComments(data.map((c) => ({ ...c, profiles: profileMap[c.user_id] ?? null })));
        setHasMore(data.length === COMMENTS_LIMIT);
        setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [supabase, volNumber]);

  /* Load next page */
  async function handleLoadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const offset = comments.length;

    const { data } = await supabase
      .from("field_guide_comments")
      .select("id, vol_number, user_id, content, created_at, updated_at")
      .eq("vol_number", volNumber)
      .order("created_at", { ascending: true })
      .range(offset, offset + COMMENTS_LIMIT - 1);

    if (!data || data.length === 0) {
      setHasMore(false);
      setLoadingMore(false);
      return;
    }

    const userIds = [...new Set(data.map((c) => c.user_id))] as string[];
    const profileMap = await fetchProfiles(supabase, userIds);

    setComments((prev) => [
      ...prev,
      ...data.map((c) => ({ ...c, profiles: profileMap[c.user_id] ?? null })),
    ]);
    setHasMore(data.length === COMMENTS_LIMIT);
    setLoadingMore(false);
  }

  /* Submit new comment */
  async function handleSubmit() {
    if (!userId || commentText.trim().length < 3 || submitting) return;
    setSubmitting(true);
    setCommentError(null);

    const { data, error } = await supabase
      .from("field_guide_comments")
      .insert({ vol_number: volNumber, user_id: userId, content: commentText.trim() })
      .select("id, vol_number, user_id, content, created_at, updated_at")
      .single();

    setSubmitting(false);
    if (error || !data) { setCommentError(error?.message ?? "Failed to post."); return; }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, badge, membership_tier")
      .eq("id", userId)
      .single();

    setComments((prev) => [
      ...prev,
      {
        ...data,
        profiles: profile
          ? { ...profile, badge: profile.badge ?? null, membership_tier: profile.membership_tier ?? null }
          : null,
      },
    ]);
    setCommentText("");
  }

  /* Comment tree handlers */
  function handleDelete(id: string) {
    setComments((prev) => prev.filter((c) => c.id !== id));
  }
  function handleEditSave(id: string, text: string) {
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, content: text } : c)));
  }

  return (
    <div id="fg-comments" style={{ marginTop: 48 }}>
      {/* Section header */}
      <div
        style={{
          display:       "flex",
          alignItems:    "center",
          gap:           12,
          marginBottom:  20,
          paddingBottom: 14,
          borderBottom:  "1px solid rgba(212,160,74,0.18)",
        }}
      >
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--muted-foreground)", margin: 0 }}
        >
          Comments {!loading && `(${comments.length}${hasMore ? "+" : ""})`}
        </p>
      </div>

      {/* Compose */}
      {userId && (
        <div style={{ marginBottom: 24 }}>
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
            onClick={handleSubmit}
            disabled={commentText.trim().length < 3 || submitting}
            className="mt-2 px-5 rounded-xl font-semibold text-xs flex items-center gap-1.5"
            style={{
              height:      40,
              background:  commentText.trim().length >= 3
                ? "linear-gradient(135deg, #D4A04A, #C17817)"
                : "rgba(212,160,74,0.3)",
              color:       "#1A1210",
              border:      "none",
              cursor:      commentText.trim().length >= 3 ? "pointer" : "default",
              touchAction: "manipulation",
            }}
          >
            {submitting ? "Posting..." : "Post Comment"}
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <p className="text-xs py-6 text-center" style={{ color: "var(--muted-foreground)" }}>
          Loading comments...
        </p>
      )}

      {/* Empty state */}
      {!loading && comments.length === 0 && (
        <p className="text-xs py-6 text-center" style={{ color: "var(--muted-foreground)" }}>
          No comments yet. Be the first.
        </p>
      )}

      {/* Comment list */}
      {comments.map((comment) => (
        <CommentRow
          key={comment.id}
          comment={comment}
          userId={userId}
          onDelete={handleDelete}
          onEditSave={handleEditSave}
        />
      ))}

      {/* Load more */}
      {hasMore && (
        <div className="py-4 flex justify-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="text-xs font-semibold px-4 py-2 rounded-full"
            style={{
              border:      "1px solid var(--border)",
              color:       "var(--gold, #D4A04A)",
              background:  "transparent",
              cursor:      loadingMore ? "default" : "pointer",
              touchAction: "manipulation",
            }}
          >
            {loadingMore ? "Loading..." : "Load more comments"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Internal helper — fetch profiles for a list of user IDs
   ------------------------------------------------------------------ */

async function fetchProfiles(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<Record<string, Profile>> {
  if (userIds.length === 0) return {};
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, badge, membership_tier")
    .in("id", userIds);
  const map: Record<string, Profile> = {};
  for (const p of data ?? []) {
    map[p.id] = {
      display_name:    p.display_name,
      avatar_url:      p.avatar_url,
      badge:           p.badge ?? null,
      membership_tier: p.membership_tier ?? null,
    };
  }
  return map;
}
