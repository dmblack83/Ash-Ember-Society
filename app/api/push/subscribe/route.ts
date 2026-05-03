/* ------------------------------------------------------------------
   POST /api/push/subscribe

   Persists a Web Push subscription to push_subscriptions. Called
   from the client right after `pushManager.subscribe()` returns a
   PushSubscription object.

   Body shape (matches PushSubscription.toJSON()):
     {
       endpoint: string,
       keys: { p256dh: string, auth: string }
     }
     userAgent?: string

   Idempotent — UPSERT on (user_id, endpoint). Re-subscribing from
   the same browser updates the keys (browsers occasionally rotate
   them) and refreshes created_at, but doesn't create a duplicate
   row.
   ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getServerUser } from "@/lib/auth/server-user";

export const runtime = "edge";

interface SubscribeBody {
  endpoint:   string;
  keys?:      { p256dh?: string; auth?: string };
  userAgent?: string;
}

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const endpoint = body.endpoint?.trim();
  const p256dh   = body.keys?.p256dh?.trim();
  const auth     = body.keys?.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "Missing required fields: endpoint, keys.p256dh, keys.auth" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id:    user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: body.userAgent?.slice(0, 500) ?? null,
      },
      { onConflict: "user_id,endpoint" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
