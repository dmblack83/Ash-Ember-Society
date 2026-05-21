/* ------------------------------------------------------------------
   DELETE /api/push/unsubscribe

   Removes a Web Push subscription row. Called from the client right
   after `subscription.unsubscribe()` succeeds in the browser.

   Body: { endpoint: string }

   Returns ok even when no row matched — unsubscribe is idempotent
   from the client's perspective.
   ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getServerUser } from "@/lib/auth/server-user";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "edge";

interface UnsubscribeBody {
  endpoint: string;
}

export async function DELETE(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(user.id, { limit: 20, window: "1 h", prefix: "push-unsubscribe" });
  if (!rl.ok) {
    if (rl.reason === "rate_limit_unavailable") {
      return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Too many unsubscribe requests. Try again later." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit":     String(rl.limit),
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset":     String(rl.reset),
          "Retry-After":           String(Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000))),
        },
      },
    );
  }

  let body: UnsubscribeBody;
  try {
    body = (await request.json()) as UnsubscribeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const endpoint = body.endpoint?.trim();
  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
