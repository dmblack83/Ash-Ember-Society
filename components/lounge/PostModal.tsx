"use client";

import { useState, useEffect, useMemo, memo } from "react";
import { createPortal }                         from "react-dom";
import { createClient }                         from "@/utils/supabase/client";
import { formatDistanceToNow }                  from "date-fns";
import type { SmokeLogData }                    from "./PostDetailClient";
import { AvatarFrame }                          from "@/components/ui/AvatarFrame";
import { resolveBadge }                         from "@/lib/badge";
import { VerdictCard }                          from "@/components/humidor/VerdictCard";
import { unwrapBurnReport }                     from "./PostDetailClient";

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

const HEADER_H       = 56;
const COMMENTS_LIMIT = 20;

/* ------------------------------------------------------------------ */
/* Interfaces                                                           */
/* ------------------------------------------------------------------ */

interface PostData {
  id:         string;
  title:      string;
  content:    string;
  created_at: string;
  is_system:  boolean;
  is_locked:  boolean;
  user_id:    string | null;
  category:   { name: string; slug: string };
  author:     { display_name: string | null; avatar_url: string | null; badge: string | null; membership_tier: string | null } | null;
  like_count: number;
  image_url:  string | null;
}

interface Comment {
  id:                string;
  content:           string;
  created_at:        string;
  updated_at:        string;
  user_id:           string;
  parent_comment_id: string | null;
  profiles:          { display_name: string | null; avatar_url: string | null; badge: string | null; membership_tier: string | null } | null;
}

interface Props {
  postId:  string;
  userId:  string;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function initials(name: string | null | undefined): string {
  if (!name) return "A";
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
  size = 32,
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

function FlameIcon({ size = 20, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"} stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* BurnReportCard — wraps the shared <VerdictCard /> + photo lightbox   */
/* + an optional partner-channel video link below the card.             */
/* ------------------------------------------------------------------ */

const BurnReportCard = memo(function BurnReportCard({ log }: { log: SmokeLogData }) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [mounted,     setMounted]     = useState(false);
  const [linkedVideo, setLinkedVideo] = useState<{ ytId: string; title: string; thumb: string | null } | null>(null);
  const thirds = unwrapBurnReport(log.burn_report);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!log.content_video_id) return;
    createClient()
      .from("content_videos")
      .select("youtube_video_id, title, thumbnail_url")
      .eq("id", log.content_video_id)
      .single()
      .then(({ data }) => {
        if (data) setLinkedVideo({ ytId: data.youtube_video_id, title: data.title, thumb: data.thumbnail_url });
      });
  }, [log.content_video_id]);

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

      {linkedVideo && (
        <a
          href={`https://www.youtube.com/watch?v=${linkedVideo.ytId}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display:         "flex",
            gap:             12,
            alignItems:      "flex-start",
            padding:         "10px 12px",
            marginTop:       16,
            borderRadius:    10,
            backgroundColor: "var(--card)",
            border:          "1px solid rgba(255,255,255,0.06)",
            textDecoration:  "none",
          }}
        >
          {linkedVideo.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={linkedVideo.thumb} alt="" style={{ width: 112, height: 63, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
          ) : (
            <div style={{ width: 112, height: 63, backgroundColor: "var(--secondary)", borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="rgba(193,120,23,0.15)" stroke="rgba(193,120,23,0.3)" strokeWidth="1.2"/>
                <path d="M10 8l6 4-6 4V8z" fill="var(--primary)"/>
              </svg>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
              {linkedVideo.title}
            </p>
            <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 3 }}>Watch on YouTube</p>
          </div>
        </a>
      )}

      {lightbox}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* CommentNode                                                          */
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
  comment, isReply = false, userId, postId, onDelete, onEditSave, onReplyCreated,
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
    const { error } = await supabase.from("forum_comments").update({ content: editText.trim(), updated_at: new Date().toISOString() }).eq("id", comment.id);
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
    const { data: profileData } = await supabase.from("profiles").select("display_name, avatar_url, badge, membership_tier").eq("id", userId).single();
    onReplyCreated({ ...data, profiles: profileData ? { ...profileData, badge: profileData.badge ?? null, membership_tier: profileData.membership_tier ?? null } : null });
    setReplyText(""); setReplyMode(false); setSubmitting(false);
  }

  return (
    <div style={{ marginLeft: isReply ? 24 : 0, paddingTop: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Avatar name={comment.profiles?.display_name} avatarUrl={comment.profiles?.avatar_url} badge={comment.profiles?.badge} tier={comment.profiles?.membership_tier} size={28} />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>{comment.profiles?.display_name ?? "Member"}</span>
          <span className="text-xs ml-2" style={{ color: "var(--muted-foreground)" }}>{relativeTime(comment.created_at)}</span>
        </div>
      </div>

      {editMode ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={editText} onChange={(e) => setEditText(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm resize-none"
            style={{ minHeight: 80, backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--foreground)", fontSize: 14, outline: "none" }}
          />
          <div className="flex gap-2">
            <button type="button" onClick={handleSaveEdit} className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: "var(--gold, #D4A04A)", color: "#1A1210", border: "none", cursor: "pointer", touchAction: "manipulation" }}>Save</button>
            <button type="button" onClick={() => { setEditMode(false); setEditText(comment.content); }} className="text-xs font-semibold px-3 py-1.5 rounded-full"
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
              style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", touchAction: "manipulation", padding: 0 }}>
              Reply
            </button>
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
          <button type="button" onClick={handleDelete} style={{ color: "#E8642C", background: "none", border: "none", cursor: "pointer", touchAction: "manipulation", padding: 0, fontWeight: 600 }}>Yes, delete</button>
          <button type="button" onClick={() => setConfirmDelete(false)} style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", touchAction: "manipulation", padding: 0 }}>Cancel</button>
        </div>
      )}

      {replyMode && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={replyText} onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a reply..." autoFocus
            className="w-full rounded-xl px-3 py-2 text-sm resize-none"
            style={{ minHeight: 72, backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--foreground)", fontSize: 14, outline: "none" }}
          />
          <div className="flex gap-2">
            <button type="button" onClick={handleReply}
              onMouseDown={(e) => e.preventDefault()}
              disabled={replyText.trim().length < 3 || submitting} className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: replyText.trim().length >= 3 ? "var(--gold, #D4A04A)" : "rgba(212,160,74,0.3)", color: "#1A1210", border: "none", cursor: replyText.trim().length >= 3 ? "pointer" : "default", touchAction: "manipulation" }}>
              {submitting ? "Sending..." : "Send Reply"}
            </button>
            <button type="button" onClick={() => { setReplyMode(false); setReplyText(""); }} className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: "transparent", color: "var(--muted-foreground)", border: "1px solid var(--border)", cursor: "pointer", touchAction: "manipulation" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* PostModal                                                            */
/* ------------------------------------------------------------------ */

export function PostModal({ postId, userId, onClose }: Props) {
  const [mounted,          setMounted]          = useState(false);
  const [loading,          setLoading]          = useState(true);
  const [post,             setPost]             = useState<PostData | null>(null);
  const [smokeLog,         setSmokeLog]         = useState<SmokeLogData | null>(null);
  const [smokeLogCigarId,  setSmokeLogCigarId]  = useState<string | null>(null);
  const [localComments,    setLocalComments]    = useState<Comment[]>([]);
  const [hasMoreComments,  setHasMoreComments]  = useState(false);
  const [loadingMore,      setLoadingMore]      = useState(false);
  const [liked,            setLiked]            = useState(false);
  const [likeCount,        setLikeCount]        = useState(0);
  const [liking,           setLiking]           = useState(false);
  const [upvotes,          setUpvotes]          = useState(0);
  const [downvotes,        setDownvotes]        = useState(0);
  const [userVote,         setUserVote]         = useState<0 | 1 | -1>(0);
  const [voting,           setVoting]           = useState(false);
  const [commentText,      setCommentText]      = useState("");
  const [submitting,       setSubmitting]       = useState(false);
  const [commentError,     setCommentError]     = useState<string | null>(null);
  const [showDeletePost,   setShowDeletePost]   = useState(false);
  const [deletingPost,     setDeletingPost]     = useState(false);
  const [lightboxOpen,     setLightboxOpen]     = useState(false);
  const [wishlistAdded,    setWishlistAdded]    = useState(false);
  const [addingWishlist,   setAddingWishlist]   = useState(false);
  const [modalToast,       setModalToast]       = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  /* ---- Mount + body lock (iOS-safe: position:fixed approach) ------- */

  useEffect(() => {
    setMounted(true);
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top      = `-${scrollY}px`;
    document.body.style.width    = "100%";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.position = "";
      document.body.style.top      = "";
      document.body.style.width    = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, []);

  /* ---- Escape key -------------------------------------------------- */

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* ---- Fetch data -------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);

      const [postRes, commentsRes, likeRes, votesRes] = await Promise.all([
        supabase
          .from("forum_posts")
          .select("id, title, content, created_at, is_system, is_locked, user_id, image_url, smoke_log_id, forum_post_likes(count), forum_categories(name, slug)")
          .eq("id", postId)
          .single(),
        supabase
          .from("forum_comments")
          .select("id, content, created_at, updated_at, user_id, parent_comment_id")
          .eq("post_id", postId)
          .order("created_at", { ascending: true })
          .limit(COMMENTS_LIMIT),
        supabase
          .from("forum_post_likes")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("post_id", postId),
        supabase
          .from("forum_post_votes")
          .select("user_id, value")
          .eq("post_id", postId),
      ]);

      if (cancelled || !postRes.data) { setLoading(false); return; }

      const raw         = postRes.data as any;
      const commentRows = (commentsRes.data ?? []) as any[];

      // Profiles
      const allUserIds = [
        ...new Set([raw.user_id, ...commentRows.map((c: any) => c.user_id)].filter(Boolean)),
      ] as string[];

      // Profiles include `city` so the verdict-card byline on burn-
      // report posts uses the post author's city.
      let nameMap: Record<string, { display_name: string | null; avatar_url: string | null; badge: string | null; membership_tier: string | null; city: string | null }> = {};
      if (allUserIds.length > 0) {
        const { data: profileRows } = await supabase.from("profiles").select("id, display_name, avatar_url, badge, membership_tier, city").in("id", allUserIds);
        for (const p of profileRows ?? []) {
          nameMap[p.id] = {
            display_name:    p.display_name,
            avatar_url:      p.avatar_url,
            badge:           p.badge           ?? null,
            membership_tier: p.membership_tier ?? null,
            city:            p.city            ?? null,
          };
        }
      }

      // Smoke log — include cigar_id for wishlist, plus the burn_reports
      // join (thirds) and resolved flavor names for the verdict card.
      let sl: SmokeLogData | null = null;
      let cigarId: string | null  = null;
      if (raw.smoke_log_id) {
        const { data: logData } = await supabase
          .from("smoke_logs")
          .select(`
            id, cigar_id, smoked_at, overall_rating, draw_rating, burn_rating,
            construction_rating, flavor_rating, pairing_drink, pairing_food,
            location, occasion, smoke_duration_minutes, review_text, photo_urls,
            content_video_id, flavor_tag_ids, user_id,
            cigar:cigar_catalog(brand, series, format),
            burn_report:burn_reports(thirds_enabled, third_beginning, third_middle, third_end)
          `)
          .eq("id", raw.smoke_log_id as string)
          .single();
        if (logData) {
          const { cigar_id: cid, flavor_tag_ids, burn_report, user_id: logAuthorId, ...rest } = logData as any;
          cigarId = cid ?? null;

          // Resolve flavor tag IDs → names.
          let flavor_tag_names: string[] = [];
          if (flavor_tag_ids && flavor_tag_ids.length > 0) {
            const { data: tags } = await supabase
              .from("flavor_tags")
              .select("id, name")
              .in("id", flavor_tag_ids);
            const tagMap = Object.fromEntries((tags ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));
            flavor_tag_names = (flavor_tag_ids as string[]).map((id) => tagMap[id]).filter(Boolean);
          }

          const author = logAuthorId ? nameMap[logAuthorId] : null;
          // Pass burn_report through as-is (array OR object); the
          // SmokeLogData type accepts both shapes and the render side
          // calls unwrapBurnReport() to flatten.
          sl = {
            ...(rest as SmokeLogData),
            burn_report,
            flavor_tag_names,
            author_display_name: author?.display_name ?? null,
            author_city:         author?.city         ?? null,
          };
        }
      }

      if (cancelled) return;

      const likeCountVal = (raw.forum_post_likes as { count: number }[])[0]?.count ?? 0;

      setPost({
        id:         raw.id,
        title:      raw.title,
        content:    raw.content,
        created_at: raw.created_at,
        is_system:  raw.is_system,
        is_locked:  raw.is_locked,
        user_id:    raw.user_id ?? null,
        category:   raw.forum_categories as { name: string; slug: string },
        author:     raw.user_id ? { display_name: nameMap[raw.user_id]?.display_name ?? null, avatar_url: nameMap[raw.user_id]?.avatar_url ?? null, badge: nameMap[raw.user_id]?.badge ?? null, membership_tier: nameMap[raw.user_id]?.membership_tier ?? null } : null,
        like_count: likeCountVal,
        image_url:  raw.image_url ?? null,
      });
      setLikeCount(likeCountVal);
      setLiked((likeRes.count ?? 0) > 0);

      // Votes (for feedback posts)
      const voteRows = (votesRes.data ?? []) as { user_id: string; value: number }[];
      setUpvotes(voteRows.filter((v) => v.value === 1).length);
      setDownvotes(voteRows.filter((v) => v.value === -1).length);
      setUserVote((voteRows.find((v) => v.user_id === userId)?.value ?? 0) as 0 | 1 | -1);
      setLocalComments(
        commentRows.map((c: any) => ({
          ...c,
          profiles: c.user_id ? { display_name: nameMap[c.user_id]?.display_name ?? null, avatar_url: nameMap[c.user_id]?.avatar_url ?? null, badge: nameMap[c.user_id]?.badge ?? null, membership_tier: nameMap[c.user_id]?.membership_tier ?? null } : null,
        }))
      );
      setHasMoreComments(commentRows.length === COMMENTS_LIMIT);
      setSmokeLog(sl);
      setSmokeLogCigarId(cigarId);
      setLoading(false);
    }

    fetchData();
    return () => { cancelled = true; };
  }, [postId, userId, supabase]);

  /* ---- Load more comments ----------------------------------------- */

  async function handleLoadMoreComments() {
    if (loadingMore || !hasMoreComments) return;
    setLoadingMore(true);
    const offset = localComments.length;

    const { data } = await supabase
      .from("forum_comments")
      .select("id, content, created_at, updated_at, user_id, parent_comment_id")
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .range(offset, offset + COMMENTS_LIMIT - 1);

    if (!data || data.length === 0) {
      setHasMoreComments(false);
      setLoadingMore(false);
      return;
    }

    const newUserIds = [...new Set(data.map((c: any) => c.user_id).filter(Boolean))] as string[];
    let newNameMap: Record<string, { display_name: string | null; avatar_url: string | null; badge: string | null; membership_tier: string | null }> = {};
    if (newUserIds.length > 0) {
      const { data: profileRows } = await supabase.from("profiles").select("id, display_name, avatar_url, badge, membership_tier").in("id", newUserIds);
      for (const p of profileRows ?? []) { newNameMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url, badge: p.badge ?? null, membership_tier: p.membership_tier ?? null }; }
    }

    setLocalComments((prev) => [
      ...prev,
      ...data.map((c: any) => ({
        ...c,
        profiles: c.user_id ? { display_name: newNameMap[c.user_id]?.display_name ?? null, avatar_url: newNameMap[c.user_id]?.avatar_url ?? null, badge: newNameMap[c.user_id]?.badge ?? null, membership_tier: newNameMap[c.user_id]?.membership_tier ?? null } : null,
      })),
    ]);
    setHasMoreComments(data.length === COMMENTS_LIMIT);
    setLoadingMore(false);
  }

  /* ---- Like toggle ------------------------------------------------- */

  async function handleLike() {
    if (liking || !post) return;
    setLiking(true);
    if (liked) {
      setLiked(false); setLikeCount((n) => Math.max(0, n - 1));
      await supabase.from("forum_post_likes").delete().eq("user_id", userId).eq("post_id", post.id);
    } else {
      setLiked(true); setLikeCount((n) => n + 1);
      const { error } = await supabase.from("forum_post_likes").insert({ user_id: userId, post_id: post.id });
      if (error && error.code !== "23505") { setLiked(false); setLikeCount((n) => Math.max(0, n - 1)); }
    }
    setLiking(false);
  }

  /* ---- Vote (feedback posts only) --------------------------------- */

  async function handleVote(direction: 1 | -1) {
    if (!post || voting) return;
    setVoting(true);

    const prev    = userVote;
    const newVote = prev === direction ? 0 : direction;

    // Optimistic
    let up   = upvotes;
    let down = downvotes;
    if (prev === 1)  up   -= 1;
    if (prev === -1) down -= 1;
    if (newVote === 1)  up   += 1;
    if (newVote === -1) down += 1;
    setUpvotes(up);
    setDownvotes(down);
    setUserVote(newVote as 0 | 1 | -1);

    if (newVote === 0) {
      await supabase.from("forum_post_votes").delete().eq("user_id", userId).eq("post_id", post.id);
    } else if (prev === 0) {
      await supabase.from("forum_post_votes").insert({ user_id: userId, post_id: post.id, value: newVote });
    } else {
      await supabase.from("forum_post_votes").update({ value: newVote }).eq("user_id", userId).eq("post_id", post.id);
    }
    setVoting(false);
  }

  /* ---- Submit comment --------------------------------------------- */

  async function handleComment() {
    if (!post || commentText.trim().length < 3 || submitting) return;
    setSubmitting(true);
    setCommentError(null);

    const { data, error } = await supabase
      .from("forum_comments")
      .insert({ user_id: userId, post_id: post.id, content: commentText.trim(), parent_comment_id: null })
      .select("id, content, created_at, updated_at, user_id, parent_comment_id")
      .single();

    setSubmitting(false);
    if (error || !data) { setCommentError(error?.message ?? "Failed to post."); return; }

    const { data: profileData } = await supabase.from("profiles").select("display_name, avatar_url, badge, membership_tier").eq("id", userId).single();
    setLocalComments((prev) => [...prev, { ...data, profiles: profileData ? { ...profileData, badge: profileData.badge ?? null, membership_tier: profileData.membership_tier ?? null } : null }]);
    setCommentText("");
  }

  /* ---- Delete post ------------------------------------------------- */

  async function handleDeletePost() {
    if (!post) return;
    setDeletingPost(true);
    await supabase.from("forum_posts").delete().eq("id", post.id);
    onClose();
  }

  /* ---- Add to Wishlist -------------------------------------------- */

  async function handleAddToWishlist() {
    if (!smokeLogCigarId || addingWishlist || wishlistAdded) return;
    setAddingWishlist(true);
    const { error } = await supabase.from("humidor_items").insert({
      user_id:     userId,
      cigar_id:    smokeLogCigarId,
      quantity:    1,
      is_wishlist: true,
    });
    setAddingWishlist(false);
    if (!error || error.code === "23505") {
      setWishlistAdded(true);
      setModalToast("Added to wishlist");
      setTimeout(() => setModalToast(null), 3000);
    }
  }

  /* ---- Comment tree handlers -------------------------------------- */

  function handleDeleteComment(id: string) {
    setLocalComments((prev) => prev.filter((c) => c.id !== id && c.parent_comment_id !== id));
  }
  function handleEditSave(id: string, text: string) {
    setLocalComments((prev) => prev.map((c) => (c.id === id ? { ...c, content: text } : c)));
  }
  function handleReplyCreated(reply: Comment) {
    setLocalComments((prev) => [...prev, reply]);
  }

  const topLevel  = localComments.filter((c) => c.parent_comment_id === null);
  const repliesOf = (parentId: string) => localComments.filter((c) => c.parent_comment_id === parentId);

  if (!mounted) return null;

  return createPortal(
    <div
      style={{
        position:        "fixed",
        inset:           0,
        zIndex:          9981,
        backgroundColor: "var(--background)",
        display:         "flex",
        flexDirection:   "column",
        overflow:        "hidden",
      }}
    >
      {/* ---- Fixed header ----------------------------------------- */}
      <div
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          height:               HEADER_H,
          backgroundColor:      "rgba(26,18,16,0.97)",
          backdropFilter:       "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom:         "1px solid var(--border)",
        }}
      >
        {/* Inner constrained to card width */}
        <div className="relative flex items-center w-full px-4 md:max-w-[50%]">
          {/* Back */}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm shrink-0"
            style={{
              color:                   "var(--gold, #D4A04A)",
              background:              "none",
              border:                  "none",
              cursor:                  "pointer",
              touchAction:             "manipulation",
              WebkitTapHighlightColor: "transparent",
              minHeight:               44,
              padding:                 "0 4px",
              zIndex:                  1,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>

          {/* Category name — absolutely centered */}
          {post && (
            <p
              className="absolute left-0 right-0 text-center font-serif font-semibold text-xl pointer-events-none px-16 truncate"
              style={{ color: "var(--foreground)" }}
            >
              {post.category.name}
            </p>
          )}

          {/* Delete / spacer */}
          <div className="ml-auto shrink-0" style={{ zIndex: 1 }}>
            {post && !post.is_system && post.user_id === userId ? (
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
            ) : (
              <div style={{ width: 36 }} />
            )}
          </div>
        </div>
      </div>

      {/* ---- Loading ------------------------------------------------ */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <span
            className="inline-block rounded-full border-2 animate-spin"
            style={{ width: 24, height: 24, borderColor: "var(--gold, #D4A04A)", borderTopColor: "transparent" }}
          />
        </div>
      )}

      {/* ---- Scrollable body ---------------------------------------- */}
      {!loading && post && (
        <div
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          {/* Content constrained to match category cards on tablet+ */}
          <div className="w-full md:max-w-[50%] md:mx-auto">

            {/* Post content */}
            <div className="px-4 pt-5 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <h1 className="font-serif font-semibold text-xl leading-snug mb-3" style={{ color: "var(--foreground)" }}>
                {post.title}
              </h1>

              <div className="flex items-center gap-2 mb-4">
                <Avatar
                  name={post.is_system ? "Ash & Ember Society" : post.author?.display_name}
                  avatarUrl={post.is_system ? null : post.author?.avatar_url}
                  badge={post.is_system ? null : post.author?.badge}
                  tier={post.is_system ? null : post.author?.membership_tier}
                  size={32}
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

              {/* Body: burn report OR text + optional image thumbnail */}
              {smokeLog ? (
                <BurnReportCard log={smokeLog} />
              ) : (
                <>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)", whiteSpace: "pre-line" }}>
                    {post.content}
                  </p>

                  {/* Image thumbnail */}
                  {post.image_url && (
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      className="mt-4 rounded-xl overflow-hidden"
                      style={{
                        display:     "block",
                        width:       80,
                        height:      80,
                        border:      "1px solid var(--border)",
                        padding:     0,
                        cursor:      "pointer",
                        touchAction: "manipulation",
                        flexShrink:  0,
                      }}
                      aria-label="View attached image"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={post.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </button>
                  )}
                </>
              )}

              {/* Action row — Add to Wishlist centered, like pinned right, same vertical level */}
              <div className="relative flex items-center justify-center mt-5" style={{ minHeight: 44 }}>
                {/* Add to Wishlist — centered, no border, only for other users' burn reports */}
                {smokeLog && post.user_id !== userId && smokeLogCigarId && (
                  <button
                    type="button"
                    onClick={handleAddToWishlist}
                    disabled={addingWishlist || wishlistAdded}
                    className="flex items-center gap-2 text-xs font-semibold"
                    style={{
                      border:                  "none",
                      color:                   wishlistAdded ? "rgba(212,160,74,0.5)" : "var(--gold, #D4A04A)",
                      background:              "none",
                      cursor:                  wishlistAdded || addingWishlist ? "default" : "pointer",
                      touchAction:             "manipulation",
                      WebkitTapHighlightColor: "transparent",
                      padding:                 0,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24"
                      fill={wishlistAdded ? "currentColor" : "none"}
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    {wishlistAdded ? "In Wishlist" : addingWishlist ? "Adding..." : "Add to Wishlist"}
                  </button>
                )}

                {post.category.slug === "product-feedback" ? (
                  /* Vote buttons — feedback posts */
                  <div className="absolute right-0 flex items-center gap-2">
                    {/* Upvote */}
                    <button
                      type="button"
                      onClick={() => handleVote(1)}
                      disabled={voting}
                      aria-label="Upvote"
                      className="flex items-center gap-1"
                      style={{
                        background:              userVote === 1 ? "rgba(232,100,44,0.12)" : "none",
                        border:                  userVote === 1 ? "1px solid rgba(232,100,44,0.35)" : "1px solid transparent",
                        borderRadius:            8,
                        padding:                 "4px 8px",
                        color:                   userVote === 1 ? "var(--ember, #E8642C)" : "var(--muted-foreground)",
                        cursor:                  voting ? "default" : "pointer",
                        touchAction:             "manipulation",
                        WebkitTapHighlightColor: "transparent",
                      } as React.CSSProperties}
                    >
                      <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M6 2L10 8H2L6 2Z" fill={userVote === 1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                      </svg>
                      <span className="text-sm font-medium">{upvotes}</span>
                    </button>
                    {/* Downvote */}
                    <button
                      type="button"
                      onClick={() => handleVote(-1)}
                      disabled={voting}
                      aria-label="Downvote"
                      className="flex items-center gap-1"
                      style={{
                        background:              userVote === -1 ? "rgba(196,69,54,0.12)" : "none",
                        border:                  userVote === -1 ? "1px solid rgba(196,69,54,0.35)" : "1px solid transparent",
                        borderRadius:            8,
                        padding:                 "4px 8px",
                        color:                   userVote === -1 ? "#C44536" : "var(--muted-foreground)",
                        cursor:                  voting ? "default" : "pointer",
                        touchAction:             "manipulation",
                        WebkitTapHighlightColor: "transparent",
                      } as React.CSSProperties}
                    >
                      <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ transform: "rotate(180deg)" }}>
                        <path d="M6 2L10 8H2L6 2Z" fill={userVote === -1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                      </svg>
                      <span className="text-sm font-medium">{downvotes}</span>
                    </button>
                  </div>
                ) : (
                  /* Like — standard posts */
                  <button
                    type="button"
                    onClick={handleLike}
                    disabled={liking}
                    className="absolute right-0 flex items-center gap-1.5"
                    style={{
                      background:              "none",
                      border:                  "none",
                      cursor:                  liking ? "default" : "pointer",
                      touchAction:             "manipulation",
                      WebkitTapHighlightColor: "transparent",
                      color:                   liked ? "var(--gold, #D4A04A)" : "var(--muted-foreground)",
                      padding:                 0,
                    }}
                  >
                    <FlameIcon size={20} filled={liked} />
                    <span className="text-sm font-medium">{likeCount}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Comments */}
            <div className="px-4 pt-4">
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>
                Comments ({topLevel.length}{hasMoreComments ? "+" : ""})
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
                  {commentError && <p className="text-xs mt-1" style={{ color: "#E8642C" }}>{commentError}</p>}
                  <button
                    type="button"
                    onClick={handleComment}
                    onMouseDown={(e) => e.preventDefault()}
                    disabled={commentText.trim().length < 3 || submitting}
                    className="mt-3 w-full px-5 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5"
                    style={{
                      height:      44,
                      background:  commentText.trim().length >= 3 ? "linear-gradient(135deg, #D4A04A, #C17817)" : "rgba(212,160,74,0.3)",
                      color:       "#1A1210",
                      border:      "none",
                      cursor:      commentText.trim().length >= 3 ? "pointer" : "default",
                      touchAction: "manipulation",
                      position:    "relative",
                      zIndex:      1,
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
                    postId={postId}
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
                      postId={postId}
                      onDelete={handleDeleteComment}
                      onEditSave={handleEditSave}
                      onReplyCreated={handleReplyCreated}
                    />
                  ))}
                </div>
              ))}

              {/* Load more comments */}
              {hasMoreComments && (
                <div className="py-4 flex justify-center">
                  <button
                    type="button"
                    onClick={handleLoadMoreComments}
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

          </div>{/* end max-width wrapper */}
        </div>
      )}

      {/* ---- Toast -------------------------------------------------- */}
      {modalToast && (
        <div
          style={{
            position:      "fixed",
            bottom:        "calc(24px + env(safe-area-inset-bottom))",
            left:          "50%",
            transform:     "translateX(-50%)",
            zIndex:        9985,
            width:         "calc(100% - 32px)",
            maxWidth:      360,
            background:    "rgba(212,160,74,0.15)",
            border:        "1px solid var(--gold, #D4A04A)",
            color:         "var(--foreground)",
            borderRadius:  12,
            padding:       "12px 16px",
            fontSize:      14,
            textAlign:     "center",
            fontWeight:    500,
            pointerEvents: "none",
          }}
        >
          {modalToast}
        </div>
      )}

      {/* ---- Delete post confirm ------------------------------------ */}
      {showDeletePost &&
        createPortal(
          <>
            <div
              onClick={() => setShowDeletePost(false)}
              style={{ position: "fixed", inset: 0, zIndex: 10990, backgroundColor: "rgba(0,0,0,0.6)" }}
            />
            <div
              style={{
                position:        "fixed",
                top:             "50%",
                left:            "50%",
                transform:       "translate(-50%,-50%)",
                zIndex:          10991,
                backgroundColor: "var(--card)",
                borderRadius:    16,
                padding:         24,
                width:           "calc(100% - 48px)",
                maxWidth:        320,
                border:          "1px solid var(--border)",
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
        )}

      {/* ---- Image lightbox ----------------------------------------- */}
      {lightboxOpen && post?.image_url &&
        createPortal(
          <>
            <div onClick={() => setLightboxOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 10990, backgroundColor: "rgba(0,0,0,0.92)" }} />
            <div style={{ position: "fixed", inset: 0, zIndex: 10991, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.image_url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} />
              <button type="button" onClick={() => setLightboxOpen(false)} aria-label="Close"
                style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%",
                  background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </>,
          document.body
        )}
    </div>,
    document.body
  );
}
