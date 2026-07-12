"use client";

import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { createPortal }                        from "react-dom";
import Image                                   from "next/image";
import Link                                    from "next/link";
import { createClient }                        from "@/utils/supabase/client";
import { formatDistanceToNow }                 from "date-fns";
import { AvatarFrame }                         from "@/components/ui/AvatarFrame";
import { resolveBadge }                        from "@/lib/badge";
import { BurnReportPreviewCard }               from "@/components/humidor/BurnReportPreviewCard";
import { BurnReportModal }                     from "@/components/humidor/BurnReportModal";
import { usePhotoLightbox }                    from "@/components/ui/PhotoLightbox";
import { tapHaptic }                           from "@/lib/haptics";
import { useEscapeKey }                        from "@/lib/hooks/use-escape-key";
import { AddCigarToWishlistButton }            from "./AddCigarToWishlistButton";
import { PostComments }                        from "./PostComments";
import { unwrapBurnReport }                    from "./PostDetailClient";
import type { SmokeLogData }                   from "./PostDetailClient";

/* ------------------------------------------------------------------ */
/* Exported types                                                        */
/* ------------------------------------------------------------------ */

export interface PostItem {
  id:            string;
  /* Source category. Optional during the room→feed transition; the
     unified fetcher always sets it. */
  category_id?:  string | null;
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
  status:        "open" | "closed";
}

interface Props {
  post:             PostItem;
  initialLiked:     boolean;
  userId:           string;
  isFeedback:       boolean;
  isFounder?:       boolean;
  onDelete:         (postId: string) => void;
  onClose?:         (postId: string) => void;
  /* Category tag chip (All view only). Rendered in the author row;
     tapping it activates that category's chip in the feed. */
  categoryTag?:     string | null;
  onCategoryTagTap?: () => void;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                               */
/* ------------------------------------------------------------------ */

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

function FlameIcon({ size = 18, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"} stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
    </svg>
  );
}

/* Photo lightbox moved to components/ui/PhotoLightbox.tsx — shared
   with the humidor burn-reports list. The shared version supports
   prev/next navigation through multiple photos. */

interface BurnReportCardProps {
  log:          SmokeLogData;
  /* The lounge post author. We only show the wishlist CTA on
     reports authored by someone OTHER than the viewer — adding your
     own cigar to your own wishlist is a no-op. */
  postAuthorId: string | null;
  viewerId:     string;
  /* Post identity for the comments section inside the fullscreen view. */
  postId:       string;
  postLocked:   boolean;
  /* Bubbles comment add/delete deltas up so the card's count badge
     stays in sync with comments made in the fullscreen view. */
  onCommentCountChange?: (delta: number) => void;
  /* Like state shared with the card's action bar so liking from the
     fullscreen view and from the feed stay in sync. */
  liked:        boolean;
  likeCount:    number;
  likeBusy:     boolean;
  onToggleLike: () => void;
}

const BurnReportCard = memo(function BurnReportCard({
  log,
  postAuthorId,
  viewerId,
  postId,
  postLocked,
  onCommentCountChange,
  liked,
  likeCount,
  likeBusy,
  onToggleLike,
}: BurnReportCardProps) {
  /* Photo URLs flow into the lightbox so prev/next can tab through
     all of them, not just the one tapped. Filter out null/empty
     entries the way the modal already does — the array passed here
     must match what BurnReportModal renders. */
  const photoUrls = (log.photo_urls ?? []).filter(Boolean);
  const lightbox  = usePhotoLightbox(photoUrls);
  const thirds    = unwrapBurnReport(log.burn_report);
  const [expanded, setExpanded] = useState(false);

  /* "Add to Wishlist" — surfaced inside the modal via belowCard.
     Only shown for OTHER users' reports where we know the cigar id
     (legacy logs may not have one). */
  const canWishlist =
    !!log.cigar_id && postAuthorId !== null && postAuthorId !== viewerId;

  return (
    <div style={{ marginTop: 4 }}>
      <BurnReportPreviewCard
        cigar={log.cigar}
        reportNumber={log.report_number ?? null}
        smokedAt={log.smoked_at}
        overallRating={log.overall_rating}
        drawRating={log.draw_rating}
        burnRating={log.burn_rating}
        constructionRating={log.construction_rating}
        flavorRating={log.flavor_rating}
        smokeDurationMinutes={log.smoke_duration_minutes}
        photoUrl={photoUrls[0] ?? null}
        onTap={() => setExpanded(true)}
      />

      <BurnReportModal
        open={expanded}
        onClose={() => setExpanded(false)}
        cigar={log.cigar}
        reportNumber={log.report_number ?? null}
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
        photoUrls={photoUrls}
        thirdsEnabled={thirds?.thirds_enabled ?? false}
        thirdBeginning={thirds?.third_beginning ?? null}
        thirdMiddle={thirds?.third_middle ?? null}
        thirdEnd={thirds?.third_end ?? null}
        thirdsTaggedRows={thirds?.thirds_tagged_rows ?? []}
        displayName={log.author_display_name ?? null}
        city={log.author_city ?? null}
        onPhotoClick={lightbox.open}
        belowCard={
          <>
            {/* Like — same state as the card's action bar, so liking
                here is reflected on the feed card and vice versa. */}
            <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
              <button
                type="button"
                onClick={onToggleLike}
                disabled={likeBusy}
                className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold"
                style={{
                  background:              liked ? "rgba(212,160,74,0.12)" : "rgba(255,255,255,0.04)",
                  border:                  liked ? "1px solid rgba(212,160,74,0.4)" : "1px solid var(--line)",
                  color:                   liked ? "var(--gold,#D4A04A)" : "var(--paper-mute)",
                  cursor:                  likeBusy ? "default" : "pointer",
                  touchAction:             "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  minHeight:               44,
                }}
              >
                <FlameIcon size={16} filled={liked} />
                {likeCount} {likeCount === 1 ? "like" : "likes"}
              </button>
            </div>
            {canWishlist && (
              <AddCigarToWishlistButton
                cigarId={log.cigar_id as string}
                userId={viewerId}
              />
            )}
            <div style={{ marginTop: 24, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
              <h3
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color:         "var(--paper-dim)",
                  margin:        "0 0 12px",
                }}
              >
                Comments
              </h3>
              <PostComments postId={postId} userId={viewerId} isLocked={postLocked} onCountChange={onCommentCountChange} />
            </div>
          </>
        }
      />

      {lightbox.node}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* InlinePost                                                            */
/* ------------------------------------------------------------------ */

export function InlinePost({ post, initialLiked, userId, isFeedback, isFounder = false, onDelete, onClose, categoryTag, onCategoryTagTap }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [liked,              setLiked]              = useState(initialLiked);
  const [likeCount,          setLikeCount]          = useState(post.like_count);
  const [liking,             setLiking]             = useState(false);
  const [upvotes,            setUpvotes]            = useState(post.upvotes);
  const [downvotes,          setDownvotes]          = useState(post.downvotes);
  const [userVote,           setUserVote]           = useState<0 | 1 | -1>(post.user_vote);
  const [voting,             setVoting]             = useState(false);
  const [commentsOpen,       setCommentsOpen]       = useState(false);
  const [commentsEverOpened, setCommentsEverOpened] = useState(false);
  const [commentCount,       setCommentCount]       = useState(post.comment_count);
  const [showDeletePost,     setShowDeletePost]     = useState(false);
  const [deletingPost,       setDeletingPost]       = useState(false);
  const [postStatus,         setPostStatus]         = useState<"open" | "closed">(post.status);
  const [closingPost,        setClosingPost]        = useState(false);
  const [mounted,            setMounted]            = useState(false);

  /* Server-truth resync. The useState initializers above snapshot the
     post ONCE at mount (local state exists for optimistic updates) —
     without this block a feed refetch (pull-to-refresh, resume,
     background revalidation) updates the props and the rendered
     numbers silently ignore it; counts only ever changed on a full
     remount, one navigation behind reality. Standard adjust-state-
     during-render pattern (react.dev "You Might Not Need an Effect"):
     each field resyncs only when its SERVER value changes, so an
     optimistic update the server has not yet confirmed is NOT
     clobbered by a refetch returning the old number. */
  const [seenServer, setSeenServer] = useState({
    liked:        initialLiked,
    likeCount:    post.like_count,
    commentCount: post.comment_count,
    upvotes:      post.upvotes,
    downvotes:    post.downvotes,
    userVote:     post.user_vote,
    status:       post.status,
  });
  if (
    seenServer.liked        !== initialLiked       ||
    seenServer.likeCount    !== post.like_count    ||
    seenServer.commentCount !== post.comment_count ||
    seenServer.upvotes      !== post.upvotes       ||
    seenServer.downvotes    !== post.downvotes     ||
    seenServer.userVote     !== post.user_vote     ||
    seenServer.status       !== post.status
  ) {
    if (seenServer.liked        !== initialLiked)       setLiked(initialLiked);
    if (seenServer.likeCount    !== post.like_count)    setLikeCount(post.like_count);
    if (seenServer.commentCount !== post.comment_count) setCommentCount(post.comment_count);
    if (seenServer.upvotes      !== post.upvotes)       setUpvotes(post.upvotes);
    if (seenServer.downvotes    !== post.downvotes)     setDownvotes(post.downvotes);
    if (seenServer.userVote     !== post.user_vote)     setUserVote(post.user_vote);
    if (seenServer.status       !== post.status)        setPostStatus(post.status);
    setSeenServer({
      liked:        initialLiked,
      likeCount:    post.like_count,
      commentCount: post.comment_count,
      upvotes:      post.upvotes,
      downvotes:    post.downvotes,
      userVote:     post.user_vote,
      status:       post.status,
    });
  }

  /* Escape-key dismissal for the inline delete-post confirmation.
     Tied to showDeletePost so the listener only attaches while the
     modal is open. */
  useEscapeKey(showDeletePost, () => setShowDeletePost(false));

  /* Stable identity so the memoized BurnReportCard doesn't re-render
     on every parent render (e.g. each like tap). setCommentCount is
     a stable setState, so empty deps are correct. Reused for the
     inline comments panel below for consistency, even though
     PostComments isn't memoized. */
  const handleModalCommentCountChange = useCallback(
    (delta: number) => setCommentCount((n) => Math.max(0, n + delta)),
    [],
  );

  /* Image lightbox for inline post images (non-burn-report). Uses
     the shared PhotoLightbox via usePhotoLightbox so close UX +
     [Close] button placement matches every other photo viewer in
     the app. Single-image case keeps the chrome minimal (no prev/
     next/counter). */
  const postImageLightbox = usePhotoLightbox(
    post.image_url ? [post.image_url] : []
  );

  useEffect(() => { setMounted(true); }, []);

  /* Like — useCallback so the memoized BurnReportCard (which surfaces
     the same like control inside the fullscreen view) only re-renders
     when like state actually changes. */
  const handleLike = useCallback(async () => {
    if (liking) return;
    /* Tap haptic on every like/unlike — these are the highest-frequency
       interactions in the lounge feed. */
    tapHaptic();
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
  }, [liked, liking, post.id, supabase, userId]);

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

  async function handleDeletePost() {
    setDeletingPost(true);
    await supabase.from("forum_posts").delete().eq("id", post.id);
    onDelete(post.id);
  }

  async function handleClosePost() {
    if (closingPost) return;
    setClosingPost(true);
    const res = await fetch(`/api/lounge/posts/${post.id}/close`, { method: "PATCH" });
    setClosingPost(false);
    if (res.ok) {
      setPostStatus("closed");
      onClose?.(post.id);
    }
  }

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

  /* imageLightbox node is now provided by postImageLightbox.node
     (shared PhotoLightbox). Inline portal removed. */

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
            {/* Category tag is redundant next to the Burn Report pill —
                burn posts show only the pill (chips row still filters). */}
            {categoryTag && !post.smoke_log && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCategoryTagTap?.(); }}
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background:              "rgba(212,160,74,0.1)",
                  color:                   "var(--gold,#D4A04A)",
                  border:                  "1px solid rgba(212,160,74,0.22)",
                  cursor:                  onCategoryTagTap ? "pointer" : "default",
                  touchAction:             "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  whiteSpace:              "nowrap",
                }}
              >
                {categoryTag}
              </button>
            )}
            {isFeedback && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={postStatus === "closed"
                  ? { background: "rgba(160,160,160,0.12)", color: "var(--muted-foreground)", border: "1px solid rgba(160,160,160,0.25)" }
                  : { background: "rgba(74,222,128,0.12)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.25)" }}>
                {postStatus === "closed" ? "Closed" : "Open"}
              </span>
            )}
            {isFeedback && isFounder && postStatus === "open" && (
              <button type="button" onClick={handleClosePost} disabled={closingPost}
                aria-label="Close post"
                className="flex items-center justify-center"
                style={{ width: 32, height: 32, background: "none", border: "none", color: "var(--muted-foreground)", cursor: closingPost ? "default" : "pointer", touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}>
                {closingPost
                  ? <span className="inline-block rounded-full border-2 border-current border-t-transparent animate-spin" style={{ width: 12, height: 12 }} />
                  : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
                      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
              </button>
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

        {/* Title + body
            - Burn-report posts: BurnReportCard (fullscreen modal on tap)
            - Default: title (links to detail page) + full pre-line body
              + optional image */}
        {post.smoke_log ? (
          <>
            <h2 className="font-serif font-semibold text-base leading-snug mb-2" style={{ color: "var(--foreground)" }}>
              {post.title}
            </h2>
            <BurnReportCard
              log={post.smoke_log}
              postAuthorId={post.user_id}
              viewerId={userId}
              postId={post.id}
              postLocked={post.is_locked}
              onCommentCountChange={handleModalCommentCountChange}
              liked={liked}
              likeCount={likeCount}
              likeBusy={liking}
              onToggleLike={handleLike}
            />
          </>
        ) : (
          <>
            <Link
              href={`/lounge/${post.id}`}
              prefetch={false}
              style={{ display: "block", textDecoration: "none", color: "inherit" }}
            >
              <h2 className="font-serif font-semibold text-base leading-snug mb-2" style={{ color: "var(--foreground)" }}>
                {post.title}
              </h2>
            </Link>
            <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)", whiteSpace: "pre-line", opacity: 0.9 }}>
              {post.content}
            </p>

            {post.image_url && (
              /* Whole image scaled to the card width (no crop). The
                 1200x900 props only reserve a pre-load aspect ratio;
                 height:auto takes the real ratio once loaded. Tap
                 opens the lightbox at full size. */
              <button type="button" onClick={() => post.image_url && postImageLightbox.open(post.image_url)}
                className="mt-3 rounded-xl overflow-hidden block"
                style={{ width: "100%", border: "none", padding: 0, cursor: "pointer", touchAction: "manipulation" }}
                aria-label="View image">
                <Image
                  src={post.image_url}
                  alt=""
                  width={1200}
                  height={900}
                  sizes="(max-width: 768px) 100vw, 600px"
                  quality={78}
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              </button>
            )}
          </>
        )}

        {/* Action bar */}
        <div className="flex items-center justify-end gap-4 mt-4">
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
          <button type="button" onClick={() => {
            setCommentsOpen((v) => !v);
            setCommentsEverOpened(true);
          }}
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
      {commentsEverOpened && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px 16px", display: commentsOpen ? undefined : "none" }}>
          {/* Mounted once and kept alive across open/close; display toggle preserves loaded comments
              (no re-fetch on reopen). */}
          <PostComments
            postId={post.id}
            userId={userId}
            isLocked={post.is_locked}
            onCountChange={handleModalCommentCountChange}
          />
        </div>
      )}

      {deleteModal}
      {postImageLightbox.node}
    </div>
  );
}
