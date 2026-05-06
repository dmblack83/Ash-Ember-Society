/* ------------------------------------------------------------------
   Web Push — server-side delivery

   Wraps the `web-push` library and the push_subscriptions table so
   trigger code (cron jobs, webhooks) can call:

     await sendPushToUser(userId, { title, body, url, tag });

   …without thinking about VAPID, encryption, or dead-endpoint
   cleanup. The function loads all of the user's subscriptions
   (one per browser/device), sends to each, and prunes any that
   come back as 404/410 (browser revoked / unsubscribed elsewhere).

   Runtime requirement: web-push uses Node's `crypto` (createHmac,
   createCipheriv, ECDH) and is NOT Edge-runtime compatible. Routes
   that import this module must declare `export const runtime =
   "nodejs"`. The trigger code (PRs that follow this series) is all
   cron / webhook routes that already need Node anyway, so this
   isn't a constraint in practice.

   Env vars (set in Vercel project settings):

     VAPID_PUBLIC_KEY          base64url, generated once
     VAPID_PRIVATE_KEY         base64url, generated once
     VAPID_SUBJECT             "mailto:notifications@ashember.vip"
                               or an https URL identifying the sender
     NEXT_PUBLIC_VAPID_PUBLIC_KEY  same value as VAPID_PUBLIC_KEY,
                               exposed client-side for subscribe()

   Generate the keypair once with the web-push CLI:
     npx web-push generate-vapid-keys
   then paste the two values into Vercel env (preview + production).
   The subject can be any owned mailto: or https: identifier.
   ------------------------------------------------------------------ */

import webpush from "web-push";
import { createServiceClient } from "@/utils/supabase/service";
import { isCategoryEnabled, type NotificationCategory } from "@/lib/notification-categories";

export interface PushPayload {
  /** Notification title — required by the SW handler. */
  title: string;
  /** Notification body line. */
  body:  string;
  /** Where to navigate when the user taps the notification. */
  url?:  string;
  /** Tag groups repeat notifications under one slot in the tray.
      Pair with renotify=true (set by the SW) so updates re-alert. */
  tag?:  string;
  /** Optional override for the icon (defaults handled in sw.js). */
  icon?: string;
}

export interface SendResult {
  /** Number of subscriptions that accepted the push. */
  sent:   number;
  /** Number that errored (network, 5xx, expired, etc.). */
  failed: number;
  /** Number of dead subscriptions pruned (404/410). */
  pruned: number;
  /** True when the user opted out of this category — no sends were
      attempted. Distinguishes "user said no" from "user has no
      subscriptions" (both look like sent: 0 otherwise). */
  skipped?: boolean;
}

/* ------------------------------------------------------------------
   Analytics — per-user-per-attempt log row.

   Best-effort: a logging failure must NEVER break a delivery flow.
   Wrapped in try/catch with a console.warn fallback. See the schema
   comment in supabase/migrations/20260506_push_send_log.sql for
   field semantics + privacy considerations (body is NOT logged).

   Exported so /api/cron/push-retry can call it with source="retry"
   after each row processes.
   ------------------------------------------------------------------ */
export interface PushSendLogParams {
  userId:    string;
  category:  NotificationCategory;
  result:    "sent" | "failed" | "skipped" | "no_subs" | "dead";
  payload:   PushPayload;
  counts?:   { sent: number; failed: number; pruned: number };
  source?:   "direct" | "retry";
  error?:    string | null;
}

export async function logPushSend(
  supabase: ReturnType<typeof createServiceClient>,
  params:   PushSendLogParams,
): Promise<void> {
  try {
    await supabase.from("push_send_log").insert({
      user_id:      params.userId,
      category:     params.category,
      result:       params.result,
      sent_count:   params.counts?.sent   ?? 0,
      failed_count: params.counts?.failed ?? 0,
      pruned_count: params.counts?.pruned ?? 0,
      title:        params.payload.title?.slice(0, 200) ?? null,
      url:          params.payload.url?.slice(0, 500)   ?? null,
      source:       params.source ?? "direct",
      error:        params.error  ?? null,
    });
  } catch (err) {
    console.warn(`[push-log] insert failed for ${params.userId}:`, (err as Error).message);
  }
}

/* Module-load VAPID validation.

   Was: lazy `ensureVapidConfigured()` called inside sendPushToUser.
   Problem: when env was missing, the daily cron iterated 100 users
   and threw 100 identical "VAPID missing" errors — one per user.

   Now: env is checked once at module load, webpush configured once,
   and `isVapidConfigured()` exposes the result so callers (the cron
   handler in particular) can short-circuit with a single error
   instead of N. */
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT;

const VAPID_OK = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);

if (VAPID_OK) {
  webpush.setVapidDetails(VAPID_SUBJECT!, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
} else {
  /* Fire ONCE at module load. Distinct from per-call errors. */
  console.error(
    "[push] VAPID env vars missing at module load. " +
    "Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT in Vercel. " +
    "sendPushToUser() will throw until these are configured.",
  );
}

/** Exposed for callers (e.g., cron handlers) that want to short-
    circuit cleanly when push isn't configured rather than letting
    sendPushToUser throw N times. */
export function isVapidConfigured(): boolean {
  return VAPID_OK;
}

/* Web Push payload size budget. Real protocol limit is ~4KB
   encrypted; encryption adds overhead, so 3500 is a safe ceiling
   for the raw JSON. Larger payloads get a diagnostic warning;
   web-push will reject them at send time anyway. */
const PUSH_PAYLOAD_MAX_BYTES = 3500;

/* Send one notification to all of `userId`'s registered devices.
   Errors per-subscription don't abort the whole batch — each is
   handled independently so one dead endpoint doesn't break delivery
   to the other browsers/devices the user has the app open in.

   `category` gates delivery against the user's per-category opt-out
   in profiles.notification_preferences. Categories are catalogued
   in lib/notification-categories.ts; default (missing key) is
   ENABLED so existing users who haven't seen the new prefs UI keep
   getting notifications. */
export async function sendPushToUser(
  userId:   string,
  payload:  PushPayload,
  category: NotificationCategory,
): Promise<SendResult> {
  if (!VAPID_OK) {
    throw new Error("VAPID env vars missing — see startup log for details.");
  }

  const supabase = createServiceClient();

  /* Gate on the user's category preference BEFORE pulling
     subscriptions — saves the round-trip on opted-out users. */
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("notification_preferences")
    .eq("id", userId)
    .single();

  if (profileError) {
    /* Profile lookup failed — log and proceed (favor delivering over
       silently dropping; the notification_preferences column has a
       NOT NULL DEFAULT '{}' so this should never happen unless the
       row is missing entirely, in which case the user's broader auth
       state is also broken). */
    console.warn(`[push] notification_preferences lookup failed for ${userId}:`, profileError.message);
  } else if (!isCategoryEnabled(
    profile?.notification_preferences as Record<string, unknown> | null,
    category,
  )) {
    await logPushSend(supabase, { userId, category, result: "skipped", payload });
    return { sent: 0, failed: 0, pruned: 0, skipped: true };
  }

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`push_subscriptions fetch failed: ${error.message}`);
  }
  if (!subs || subs.length === 0) {
    await logPushSend(supabase, { userId, category, result: "no_subs", payload });
    return { sent: 0, failed: 0, pruned: 0 };
  }

  const json = JSON.stringify(payload);
  if (json.length > PUSH_PAYLOAD_MAX_BYTES) {
    /* Diagnostic warning — web-push will reject at send time with a
       PayloadTooLargeError. Surfacing the size here makes it easy to
       see in logs which payload was at fault before letting the
       per-subscription error path play out. */
    console.warn(
      `[push] payload size ${json.length}B exceeds recommended ${PUSH_PAYLOAD_MAX_BYTES}B for category=${category} userId=${userId}. ` +
      "Trim payload.body or use a shorter notification.",
    );
  }
  const deadIds: string[] = [];
  const liveIds: string[] = [];
  let failed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          json,
        );
        liveIds.push(sub.id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Endpoint is permanently dead (browser revoked, user
          // uninstalled the PWA, subscription expired). Drop the row.
          deadIds.push(sub.id);
        } else {
          // Transient (5xx, network) — leave the row in place so the
          // next send retries. Real production might want exponential
          // backoff or a dead-letter table; v1 just counts and moves on.
          failed += 1;
        }
      }
    }),
  );

  if (deadIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", deadIds);
  }
  if (liveIds.length > 0) {
    /* Best-effort last_used_at bump. Failure here doesn't affect
       delivery — purely bookkeeping for future GC of stale rows. */
    await supabase
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .in("id", liveIds);
  }

  /* Transient failures (5xx, network, unknown): enqueue for retry.
     /api/cron/push-retry will re-attempt with progressive backoff
     per supabase/migrations/20260506_push_outbox.sql. 404/410 are
     deliberately NOT queued — those subscriptions are gone. */
  if (failed > 0) {
    const { error: enqueueError } = await supabase
      .from("push_outbox")
      .insert({
        user_id:  userId,
        category: category,
        payload:  payload as unknown as Record<string, unknown>,
      });
    if (enqueueError) {
      console.warn(
        `[push] failed to enqueue outbox row for ${userId}:`,
        enqueueError.message,
      );
    }
  }

  /* Analytics: log the attempt outcome. Direct path; if a queued
     retry later succeeds, the retry cron writes its own row with
     source="retry". */
  await logPushSend(supabase, {
    userId,
    category,
    result: liveIds.length > 0 ? "sent" : "failed",
    payload,
    counts: { sent: liveIds.length, failed, pruned: deadIds.length },
  });

  return { sent: liveIds.length, failed, pruned: deadIds.length };
}
