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
}

/* Module-level VAPID config. We re-set on every cold start because
   webpush.setVapidDetails() throws if any value is missing — letting
   each call see the latest env (useful for env rotation between
   deploys without a code change). */
let vapidConfigured = false;
function ensureVapidConfigured(): void {
  if (vapidConfigured) return;
  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID env vars missing — set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, " +
      "VAPID_SUBJECT in Vercel project settings.",
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

/* Send one notification to all of `userId`'s registered devices.
   Errors per-subscription don't abort the whole batch — each is
   handled independently so one dead endpoint doesn't break delivery
   to the other browsers/devices the user has the app open in. */
export async function sendPushToUser(
  userId:  string,
  payload: PushPayload,
): Promise<SendResult> {
  ensureVapidConfigured();

  const supabase = createServiceClient();
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`push_subscriptions fetch failed: ${error.message}`);
  }
  if (!subs || subs.length === 0) {
    return { sent: 0, failed: 0, pruned: 0 };
  }

  const json = JSON.stringify(payload);
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

  return { sent: liveIds.length, failed, pruned: deadIds.length };
}
