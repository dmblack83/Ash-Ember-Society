/* ------------------------------------------------------------------
   GET/POST /api/cron/push-retry

   Drains the push_outbox queue for retry-eligible rows. Vercel Cron
   runs this hourly (see vercel.json). Producer is lib/push.ts which
   enqueues a row whenever sendPushToUser hits a transient failure
   (5xx, network) — see audit item 4b for context.

   Backoff schedule, applied via push_outbox.next_attempt_at after
   each retry attempt:
     attempt 1 fails → +1h
     attempt 2 fails → +4h
     attempt 3 fails → status=dead (no further attempts)

   Per-row outcomes:
     anySucceeded            → status=sent
     anyFailed (transient)   → bump attempts + next_attempt_at
     attempts hits MAX       → status=dead, last_error captured
     no live subscriptions   → status=dead (user unsubscribed since
                                enqueue; no point retrying)
     user opted out of category → status=sent (effectively skip;
                                 user changed their mind, honor it)

   Auth: same pattern as /api/cron/aging-ready. CRON_SECRET required
   in production after #292.

   Runtime: Node.js. web-push uses Node crypto (not Edge-compatible).
   ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import webpush                       from "web-push";
import { createServiceClient }       from "@/utils/supabase/service";
import {
  isCategoryEnabled,
  type NotificationCategory,
} from "@/lib/notification-categories";

export const runtime = "nodejs";

const MAX_ATTEMPTS    = 3;
const BACKOFF_MINUTES = [60, 60 * 4, 60 * 12];   // after attempts 1, 2, 3
const BATCH_SIZE      = 100;

/* ------------------------------------------------------------------
   Auth — copied from /api/cron/aging-ready (same fix from #292).
   ------------------------------------------------------------------ */
function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const syncSecret = process.env.SYNC_SECRET;

  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  const sync = req.headers.get("x-sync-secret");
  if (syncSecret && sync === syncSecret) return true;

  /* Dev-only UA fallback. Never honor in production. */
  if (process.env.NODE_ENV !== "production") {
    const ua = req.headers.get("user-agent") ?? "";
    if (!cronSecret && ua.startsWith("vercel-cron/")) return true;
  }

  return false;
}

let vapidConfigured = false;
function ensureVapidConfigured(): void {
  if (vapidConfigured) return;
  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("VAPID env vars missing — set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

interface OutboxRow {
  id:       string;
  user_id:  string;
  category: string;
  payload:  Record<string, unknown>;
  attempts: number;
}

interface Subscription {
  id:       string;
  endpoint: string;
  p256dh:   string;
  auth:     string;
}

async function processRow(
  supabase: ReturnType<typeof createServiceClient>,
  row:      OutboxRow,
): Promise<"sent" | "retried" | "dead"> {
  const now = new Date().toISOString();

  /* 1. Re-check the user's category preference. They may have opted
        out between enqueue and retry — honor the new state. */
  const { data: profile } = await supabase
    .from("profiles")
    .select("notification_preferences")
    .eq("id", row.user_id)
    .single();

  if (!isCategoryEnabled(
    profile?.notification_preferences as Record<string, unknown> | null,
    row.category as NotificationCategory,
  )) {
    await supabase
      .from("push_outbox")
      .update({ status: "sent", last_attempt_at: now, last_error: "category opted out post-enqueue" })
      .eq("id", row.id);
    return "sent";
  }

  /* 2. Pull current subscriptions. */
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", row.user_id);

  if (!subs || subs.length === 0) {
    await supabase
      .from("push_outbox")
      .update({
        status:           "dead",
        attempts:         row.attempts + 1,
        last_attempt_at:  now,
        last_error:       "no active subscriptions",
      })
      .eq("id", row.id);
    return "dead";
  }

  /* 3. Send to each subscription independently. */
  const json     = JSON.stringify(row.payload);
  const deadIds: string[] = [];
  let anySucceeded = false;
  let anyFailed    = false;
  let lastError: string | null = null;

  await Promise.all((subs as Subscription[]).map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        json,
      );
      anySucceeded = true;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        deadIds.push(sub.id);
      } else {
        anyFailed = true;
        lastError = (err as Error).message?.slice(0, 200) ?? "unknown error";
      }
    }
  }));

  /* 4. Prune dead subscriptions. */
  if (deadIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", deadIds);
  }

  /* 5. Update the outbox row based on the outcome. */
  const newAttempts = row.attempts + 1;

  if (anySucceeded) {
    await supabase
      .from("push_outbox")
      .update({ status: "sent", attempts: newAttempts, last_attempt_at: now, last_error: null })
      .eq("id", row.id);
    return "sent";
  }

  if (anyFailed && newAttempts < MAX_ATTEMPTS) {
    /* Schedule another retry. backoff index = current attempt count
       (0-indexed: after 1st retry use BACKOFF_MINUTES[0], etc.). */
    const backoffIdx  = newAttempts - 1;
    const nextAttempt = new Date(Date.now() + BACKOFF_MINUTES[backoffIdx] * 60 * 1000);
    await supabase
      .from("push_outbox")
      .update({
        attempts:        newAttempts,
        next_attempt_at: nextAttempt.toISOString(),
        last_attempt_at: now,
        last_error:      lastError,
      })
      .eq("id", row.id);
    return "retried";
  }

  /* Either no live subs after pruning OR exhausted retries. */
  await supabase
    .from("push_outbox")
    .update({
      status:          "dead",
      attempts:        newAttempts,
      last_attempt_at: now,
      last_error:      lastError ?? "all subscriptions pruned",
    })
    .eq("id", row.id);
  return "dead";
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    ensureVapidConfigured();
  } catch (err) {
    console.error("[push-retry]", (err as Error).message);
    return NextResponse.json({ error: "VAPID not configured" }, { status: 500 });
  }

  const supabase = createServiceClient();
  const now      = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from("push_outbox")
    .select("id, user_id, category, payload, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", now)
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[push-retry] outbox query failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0, retried = 0, dead = 0;

  for (const row of (rows ?? []) as OutboxRow[]) {
    try {
      const outcome = await processRow(supabase, row);
      if (outcome === "sent")    sent++;
      if (outcome === "retried") retried++;
      if (outcome === "dead")    dead++;
    } catch (err) {
      /* Per-row failure shouldn't abort the batch. The row stays
         pending; the next cron run will pick it up if next_attempt_at
         is still in the past. Worst case: a buggy row blocks itself
         until manual investigation. */
      console.error(`[push-retry] row ${row.id} threw:`, (err as Error).message);
    }
  }

  return NextResponse.json({
    ok:        true,
    processed: (rows?.length ?? 0),
    sent,
    retried,
    dead,
  });
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
