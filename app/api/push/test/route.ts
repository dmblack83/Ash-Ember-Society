/* ------------------------------------------------------------------
   POST /api/push/test

   On-demand test notification triggered from /account. Lets the user
   verify the entire push pipeline (subscription, server delivery,
   client SW handler) without waiting 24h for a real aging-ready
   trigger.

   Auth: getServerUser(). Sends only to the current user — never
   accepts a target user_id from the body.

   Rate limit: 5 per hour per user via the Upstash limiter introduced
   in #293. Stops both accidental fat-finger spam and intentional
   abuse-via-test.

   Runtime: Node.js. Goes through sendPushToUser, which uses web-push
   (Node crypto, not Edge-compatible).
   ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { getServerUser }              from "@/lib/auth/server-user";
import { sendPushToUser, isVapidConfigured } from "@/lib/push";
import { checkRateLimit }             from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isVapidConfigured()) {
    return NextResponse.json(
      { error: "Push notifications aren't configured on this server." },
      { status: 503 },
    );
  }

  /* Per-user rate limit — same Upstash backend as /api/vision/analyze.
     5 per hour is generous for a verification flow; users typically
     click once or twice. */
  const rl = await checkRateLimit(user.id, {
    limit:  5,
    window: "1 h",
    prefix: "push-test",
  });

  if (!rl.ok) {
    if (rl.reason === "rate_limit_unavailable") {
      return NextResponse.json(
        { error: "Service temporarily unavailable" },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Too many test pushes. Try again later." },
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

  const result = await sendPushToUser(
    user.id,
    {
      title: "Test notification",
      body:  "If you're seeing this, push notifications are working on this device.",
      url:   "/account",
      /* Unique tag — multiple test sends within a window each show
         as a fresh notification rather than collapsing under one. */
      tag:   `push-test-${Date.now()}`,
    },
    "test",
  );

  return NextResponse.json({
    ok:      true,
    sent:    result.sent,
    failed:  result.failed,
    pruned:  result.pruned,
    skipped: result.skipped ?? false,
  });
}
