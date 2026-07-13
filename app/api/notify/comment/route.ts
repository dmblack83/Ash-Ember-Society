/* ------------------------------------------------------------------
   POST /api/notify/comment

   Push-notification trigger for lounge comments and replies. The
   client inserts the forum_comments row directly (RLS-scoped), then
   fires this endpoint with the new comment id; the server re-reads
   everything it needs with the service client, so the notification
   content can never be spoofed:

   - The comment must exist, belong to the CALLER, and be recent
     (anti-replay: an old id can't be used to re-ping people).
   - Recipients, titles, and bodies are derived from the stored row
     via the pure rules in lib/lounge/comment-notify.ts.
   - Per-user category opt-outs (lounge_comment / lounge_reply) are
     enforced inside sendPushToUser.

   Fire-and-forget from the client: a failure here never blocks the
   comment itself.

   Node runtime — lib/push.ts (web-push) needs Node crypto.
   ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/server-user";
import { checkRateLimit } from "@/lib/rate-limit";
import { createServiceClientFor } from "@/utils/supabase/service";
import { sendPushToUser, isVapidConfigured } from "@/lib/push";
import { decideCommentNotifications } from "@/lib/lounge/comment-notify";

export const runtime = "nodejs";

/* Comments older than this can't trigger notifications — the client
   calls immediately after insert, so anything older is a replay. */
const MAX_COMMENT_AGE_MS = 10 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(user.id, { limit: 60, window: "1 h", prefix: "notify-comment" });
  if (!rl.ok) {
    if (rl.reason === "rate_limit_unavailable") {
      return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let commentId: unknown;
  try {
    ({ commentId } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof commentId !== "string" || !UUID_RE.test(commentId)) {
    return NextResponse.json({ error: "Invalid commentId" }, { status: 400 });
  }

  if (!isVapidConfigured()) {
    return NextResponse.json({ sent: 0, skipped: "vapid-unconfigured" });
  }

  const supabase = createServiceClientFor(
    "api:notify-comment",
    "read comment/post/parent authors + commenter display name to fan out comment push notifications",
  );

  /* The comment row is the source of truth for everything sent. */
  const { data: comment } = await supabase
    .from("forum_comments")
    .select("id, user_id, post_id, parent_comment_id, content, created_at")
    .eq("id", commentId)
    .single();

  if (!comment || comment.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (Date.now() - new Date(comment.created_at).getTime() > MAX_COMMENT_AGE_MS) {
    return NextResponse.json({ sent: 0, skipped: "stale" });
  }

  const [{ data: post }, { data: parent }, { data: profile }] = await Promise.all([
    supabase
      .from("forum_posts")
      .select("user_id")
      .eq("id", comment.post_id)
      .single(),
    comment.parent_comment_id
      ? supabase
          .from("forum_comments")
          .select("user_id")
          .eq("id", comment.parent_comment_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single(),
  ]);

  const notifications = decideCommentNotifications({
    postId:         comment.post_id,
    commenterId:    user.id,
    commenterName:  profile?.display_name ?? null,
    content:        comment.content ?? "",
    postAuthorId:   post?.user_id ?? null,
    parentAuthorId: comment.parent_comment_id ? (parent?.user_id ?? null) : null,
  });

  let sent = 0;
  for (const n of notifications) {
    try {
      const result = await sendPushToUser(n.recipientId, n.payload, n.category);
      sent += result.sent;
    } catch (err) {
      /* Delivery problems are logged, never surfaced to the commenter. */
      console.error(`[notify-comment] send to ${n.recipientId} failed:`, (err as Error).message);
    }
  }

  return NextResponse.json({ sent });
}
