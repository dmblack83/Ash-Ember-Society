/* ------------------------------------------------------------------
   GET/POST /api/cron/aging-ready

   Daily Vercel Cron at 13:00 UTC (≈ 9am ET / 6am PT — early enough
   that a US user opens the app with the news ready, late enough that
   European users aren't woken up). Configured in vercel.json; cron
   entries can't carry inline comments per Vercel's strict schema, so
   the schedule rationale lives here.

   Pings each user whose aging cigars hit their target date today.
   Brings users back when they actually have a reason to open the
   app, on a date they personally chose — the trigger most aligned
   with the brand (a lounge that respects your time, only nudges
   when something matters).

   Selection:
     humidor_items where
         aging_target_date = today (UTC)
         is_wishlist        = false
         quantity           > 0
   Cigars whose targets were in the past don't fire — match-exact-
   today only. If a user missed yesterday's cron run for any reason,
   we don't try to make up the alert; that'd feel weird ("your cigar
   was ready 3 days ago").

   Batching per-user:
     1 cigar  → "Your Padron 1964 is ready" → /humidor/{itemId}
     2+ cigars → "3 cigars are ready today"  → /humidor

   Idempotency:
     Uses notification `tag` keyed by date + user. If the cron
     accidentally runs twice the same day, browsers collapse repeats
     under the same tag. (Vercel cron is generally at-most-once but
     this is a cheap safety net.)

   Auth: same pattern as /api/news/sync — Authorization: Bearer
     CRON_SECRET. Manual/staging trigger via x-sync-secret. Vercel-
     cron user-agent fallback if CRON_SECRET isn't set yet.

   Runtime: Node.js. lib/push.ts uses web-push (Node crypto), which
   is not Edge-compatible.
   ------------------------------------------------------------------ */

import { NextRequest, NextResponse }            from "next/server";
import { createServiceClient }                   from "@/utils/supabase/service";
import { sendPushToUser }                        from "@/lib/push";
import { startCronRun, finishCronRun }           from "@/lib/cron-log";

export const runtime = "nodejs";

/* ------------------------------------------------------------------
   Auth — copy of the pattern in /api/news/sync.
   ------------------------------------------------------------------ */

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const syncSecret = process.env.SYNC_SECRET;

  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  const sync = req.headers.get("x-sync-secret");
  if (syncSecret && sync === syncSecret) return true;

  // Dev-only UA fallback: production REQUIRES one of the secrets above.
  // The vercel-cron/* user-agent is trivially spoofable, so honoring it
  // in production would let any caller trigger arbitrary push runs.
  if (process.env.NODE_ENV !== "production") {
    const ua = req.headers.get("user-agent") ?? "";
    if (!cronSecret && ua.startsWith("vercel-cron/")) return true;
  }

  return false;
}

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface HumidorRow {
  id:       string;
  user_id:  string;
  cigar:    { brand: string | null; series: string | null; format: string | null } | null;
}

/* ------------------------------------------------------------------
   Handler
   ------------------------------------------------------------------ */

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await startCronRun("aging-ready");
  try {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD UTC

  const supabase = createServiceClient();
  const { data: rows, error } = await supabase
    .from("humidor_items")
    .select("id, user_id, cigar:cigar_catalog(brand, series, format)")
    .eq("aging_target_date", today)
    .eq("is_wishlist", false)
    .gt("quantity", 0);

  if (error) {
    console.error("[aging-ready] query failed:", error.message);
    await finishCronRun(run, { ok: false, error: `query failed: ${error.message}`.slice(0, 500) });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  /* Group by user so a user with 5 cigars maturing today gets ONE
     notification, not five. The single-cigar case still gets a
     personalized title with the cigar name; the multi-cigar case
     is a count + a link to the humidor list. */
  const byUser = new Map<string, HumidorRow[]>();
  for (const row of (rows ?? []) as unknown as HumidorRow[]) {
    if (!row.user_id) continue;
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  let usersNotified = 0;
  let totalSent     = 0;
  let totalFailed   = 0;
  let totalPruned   = 0;

  await Promise.all(
    Array.from(byUser.entries()).map(async ([userId, items]) => {
      const tag =
        items.length === 1
          ? `aging-ready-${items[0].id}`
          : `aging-ready-batch-${today}-${userId}`;

      const payload =
        items.length === 1
          ? {
              title: "Your cigar is ready",
              body:  cigarLabel(items[0]) + " has hit its aging target today.",
              url:   `/humidor/${items[0].id}`,
              tag,
            }
          : {
              title: `${items.length} cigars are ready`,
              body:  "Your aging shelf has new arrivals today.",
              url:   "/humidor",
              tag,
            };

      try {
        const result = await sendPushToUser(userId, payload, "aging_ready");
        usersNotified += 1;
        totalSent     += result.sent;
        totalFailed   += result.failed;
        totalPruned   += result.pruned;
      } catch (err) {
        // Per-user failures don't abort the cron — log and continue.
        // The most likely cause is missing VAPID env vars; that
        // shows up as "VAPID env vars missing" in the response.
        console.error(`[aging-ready] sendPushToUser(${userId}) failed:`, (err as Error).message);
      }
    }),
  );

    const summary = {
      date:          today,
      matched:       rows?.length ?? 0,
      usersNotified,
      sent:          totalSent,
      failed:        totalFailed,
      pruned:        totalPruned,
    };
    await finishCronRun(run, { ok: true, summary });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    await finishCronRun(run, { ok: false, error: (err as Error).message?.slice(0, 500) ?? "unknown error" });
    throw err;
  }
}

function cigarLabel(row: HumidorRow): string {
  const c = row.cigar;
  return [c?.brand, c?.series ?? c?.format].filter(Boolean).join(" ") || "Your cigar";
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
