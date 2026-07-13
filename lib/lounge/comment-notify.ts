/* ------------------------------------------------------------------
   Comment / reply push notifications — pure decision logic.

   Given who commented, on whose post, and (for replies) whose comment
   was replied to, decide who gets which push notification. Pure so
   the recipient rules are unit-testable; the delivery wiring lives in
   app/api/notify/comment/route.ts.

   Rules:
   - Nobody is ever notified about their own activity.
   - Top-level comment  -> post author gets "commented on your post".
   - Reply              -> parent comment author gets "replied to your
                           comment"; the post author ALSO gets the
                           comment notification unless they are the
                           commenter or already receiving the reply
                           notification (reply beats comment).
   ------------------------------------------------------------------ */

import type { PushPayload } from "@/lib/push";

export interface CommentNotifyContext {
  postId:        string;
  commenterId:   string;
  /** Commenter's display name; null/empty falls back to "A member". */
  commenterName: string | null;
  content:       string;
  /** Post author, null if the account is gone. */
  postAuthorId:  string | null;
  /** Author of the comment being replied to; null for a top-level
      comment. */
  parentAuthorId: string | null;
}

export interface CommentNotification {
  recipientId: string;
  category:    "lounge_comment" | "lounge_reply";
  payload:     PushPayload;
}

const MAX_BODY_CHARS = 100;

/** One-line preview of the comment for the notification body. */
export function truncateComment(text: string, max = MAX_BODY_CHARS): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 1).trimEnd() + "…";
}

export function decideCommentNotifications(
  ctx: CommentNotifyContext,
): CommentNotification[] {
  const name = ctx.commenterName?.trim() || "A member";
  const body = `"${truncateComment(ctx.content)}"`;
  const url  = `/lounge/${ctx.postId}`;
  /* One tag per post: repeat activity on the same post collapses into
     a single tray slot that re-alerts (SW sets renotify). */
  const tag  = `lounge-post-${ctx.postId}`;

  const out: CommentNotification[] = [];

  const replyRecipient =
    ctx.parentAuthorId && ctx.parentAuthorId !== ctx.commenterId
      ? ctx.parentAuthorId
      : null;

  if (replyRecipient) {
    out.push({
      recipientId: replyRecipient,
      category:    "lounge_reply",
      payload:     { title: `${name} replied to your comment`, body, url, tag },
    });
  }

  if (
    ctx.postAuthorId &&
    ctx.postAuthorId !== ctx.commenterId &&
    ctx.postAuthorId !== replyRecipient
  ) {
    out.push({
      recipientId: ctx.postAuthorId,
      category:    "lounge_comment",
      payload:     { title: `${name} commented on your post`, body, url, tag },
    });
  }

  return out;
}
