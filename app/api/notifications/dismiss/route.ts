/*
 * POST /api/notifications/dismiss  { post_id: string }
 *
 * Marks a thread's activity as seen for the current user by upserting
 * notification_views.last_seen_at = now(). Idempotent. Called fire-
 * and-forget by the Home notifications card when a row is tapped; the
 * card has already navigated away by the time this resolves.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/utils/supabase/server";
import { getServerUser }             from "@/lib/auth/server-user";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let postId: unknown;
  try {
    ({ post_id: postId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof postId !== "string" || postId.length === 0) {
    return NextResponse.json({ error: "post_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_views")
    .upsert(
      { user_id: user.id, post_id: postId, last_seen_at: new Date().toISOString() },
      { onConflict: "user_id,post_id" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
