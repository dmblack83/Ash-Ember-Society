/* ------------------------------------------------------------------
   GET/POST /api/cron/govee-poll — every 15 minutes.

   For each active govee_connections row: fetch the current reading
   from Govee's cloud, store it, evaluate thresholds, and push an
   alert on an in-range -> out-of-range transition (6h per-metric
   cooldown lives in lib/govee/thresholds.ts).

   Failure isolation: each user is processed independently.
     - GoveeAuthError  -> status 'auth_error', polling pauses for
       that user until they reconnect (/account shows a prompt).
     - null reading (device gone / no capabilities) -> 'device_missing'.
     - transient error -> row untouched; next tick retries.

   Auth + logging: same isAuthorized / cron-log pattern as
   /api/cron/aging-ready. Node runtime (web-push needs Node crypto).
   ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClientFor }    from "@/utils/supabase/service";
import { sendPushToUser }            from "@/lib/push";
import { startCronRun, finishCronRun } from "@/lib/cron-log";
import { fetchSensorReading, GoveeAuthError } from "@/lib/govee/api";
import { evaluateReading, type AlertState, type ThresholdAlert } from "@/lib/govee/thresholds";

export const runtime = "nodejs";

const BATCH_SIZE = 5;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const syncSecret = process.env.SYNC_SECRET;

  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  const sync = req.headers.get("x-sync-secret");
  if (syncSecret && sync === syncSecret) return true;

  if (process.env.NODE_ENV !== "production") {
    const ua = req.headers.get("user-agent") ?? "";
    if (!cronSecret && ua.startsWith("vercel-cron/")) return true;
  }
  return false;
}

interface ConnectionRow {
  user_id: string; api_key: string; device_id: string; sku: string;
  humidity_min: number; humidity_max: number; temp_min_f: number; temp_max_f: number;
  alert_state: AlertState | null;
}

/* User-facing push copy. NO EM DASHES. */
function alertBody(a: ThresholdAlert, row: ConnectionRow): string {
  const value = Math.round(a.value * 10) / 10;
  if (a.metric === "humidity") {
    const verb = a.direction === "low" ? "dropped" : "rose";
    return `Humidor humidity ${verb} to ${value}%. Your range is ${row.humidity_min} to ${row.humidity_max}%.`;
  }
  const verb = a.direction === "low" ? "dropped" : "rose";
  return `Humidor temperature ${verb} to ${value}°F. Your range is ${row.temp_min_f} to ${row.temp_max_f}°F.`;
}

async function pollOne(
  supabase: ReturnType<typeof createServiceClientFor>,
  row: ConnectionRow,
  nowMs: number,
): Promise<"ok" | "alerted" | "auth_error" | "device_missing" | "transient"> {
  let reading;
  try {
    reading = await fetchSensorReading(row.api_key, row.sku, row.device_id);
  } catch (err) {
    if (err instanceof GoveeAuthError) {
      await supabase.from("govee_connections")
        .update({ status: "auth_error" }).eq("user_id", row.user_id);
      return "auth_error";
    }
    return "transient"; // row untouched; next tick retries
  }

  if (reading === null) {
    await supabase.from("govee_connections")
      .update({ status: "device_missing" }).eq("user_id", row.user_id);
    return "device_missing";
  }

  const config = {
    humidityMin: row.humidity_min, humidityMax: row.humidity_max,
    tempMinF:    row.temp_min_f,   tempMaxF:    row.temp_max_f,
  };
  const { nextState, alerts } = evaluateReading(reading, config, row.alert_state ?? {}, nowMs);

  await supabase.from("govee_connections").update({
    last_temp_f:     reading.tempF,
    last_humidity:   reading.humidity,
    last_reading_at: new Date(nowMs).toISOString(),
    alert_state:     nextState,
    status:          "active",
  }).eq("user_id", row.user_id);

  for (const a of alerts) {
    try {
      await sendPushToUser(row.user_id, {
        title: "Humidor Alert",
        body:  alertBody(a, row),
        url:   "/humidor",
        tag:   `govee-${a.metric}`,
      }, "humidor_sensor");
    } catch (err) {
      console.error(`[govee-poll] push failed for ${row.user_id}:`, (err as Error).message);
    }
  }
  return alerts.length > 0 ? "alerted" : "ok";
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await startCronRun("govee-poll", "*/15 * * * *");
  try {
    const supabase = createServiceClientFor(
      "cron:govee-poll",
      "poll Govee cloud for every connected user's sensor; table is service-role-only",
    );

    const { data: rows, error } = await supabase
      .from("govee_connections")
      .select("user_id, api_key, device_id, sku, humidity_min, humidity_max, temp_min_f, temp_max_f, alert_state")
      .eq("status", "active");

    if (error) {
      await finishCronRun(run, { ok: false, error: `query failed: ${error.message}`.slice(0, 500) });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const summary = { polled: 0, alerted: 0, auth_errors: 0, device_missing: 0, transient: 0 };
    const nowMs = Date.now();
    const list = (rows ?? []) as ConnectionRow[];

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const results = await Promise.allSettled(
        list.slice(i, i + BATCH_SIZE).map((row) => pollOne(supabase, row, nowMs)),
      );
      for (const r of results) {
        if (r.status === "rejected") { summary.transient += 1; continue; }
        summary.polled += 1;
        if (r.value === "alerted")        summary.alerted += 1;
        if (r.value === "auth_error")     summary.auth_errors += 1;
        if (r.value === "device_missing") summary.device_missing += 1;
        if (r.value === "transient")      summary.transient += 1;
      }
    }

    await finishCronRun(run, { ok: true, summary });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    await finishCronRun(run, { ok: false, error: (err as Error).message });
    throw err;
  }
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
