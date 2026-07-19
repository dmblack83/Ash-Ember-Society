/* ------------------------------------------------------------------
   GET/POST /api/cron/govee-poll — every 15 minutes.

   For each humidor with a sensor assigned (device_id set,
   sensor_status='active') whose owner has an active Govee API key:
   fetch the current reading from Govee's cloud, store it, evaluate
   thresholds, and push an alert on an in-range -> out-of-range
   transition (6h per-metric cooldown lives in lib/govee/thresholds.ts).

   Poll unit is the HUMIDOR, not the user connection — a user can have
   several sensored humidors sharing one Govee API key.

   Failure isolation: each humidor is processed independently.
     - GoveeAuthError  -> govee_connections.status='auth_error' for the
       user, AND humidors.sensor_status='auth_error' on every one of
       that user's sensored humidors (pauses all of them until they
       reconnect; /account shows a prompt).
     - null reading (device gone / no capabilities) -> that humidor's
       sensor_status='device_missing'.
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

interface SensoredHumidor {
  id: string; user_id: string; name: string;
  device_id: string; sku: string;
  humidity_min: number; humidity_max: number;
  temp_min_f: number; temp_max_f: number;
  alert_state: AlertState | null;
  api_key: string;                    // joined from govee_connections
}

/* User-facing push copy. NO EM DASHES. */
function alertBody(a: ThresholdAlert, h: SensoredHumidor): string {
  const value = Math.round(a.value * 10) / 10;
  const verb = a.direction === "low" ? "dropped" : "rose";
  if (a.metric === "humidity") {
    return `${h.name} humidity ${verb} to ${value}%. Your range is ${h.humidity_min} to ${h.humidity_max}%.`;
  }
  return `${h.name} temperature ${verb} to ${value}°F. Your range is ${h.temp_min_f} to ${h.temp_max_f}°F.`;
}

async function pollOne(
  supabase: ReturnType<typeof createServiceClientFor>,
  h: SensoredHumidor,
  nowMs: number,
): Promise<"ok" | "alerted" | "auth_error" | "device_missing" | "transient"> {
  let reading;
  try {
    reading = await fetchSensorReading(h.api_key, h.sku, h.device_id);
  } catch (err) {
    if (err instanceof GoveeAuthError) {
      const { error: connError } = await supabase.from("govee_connections")
        .update({ status: "auth_error" }).eq("user_id", h.user_id);
      if (connError) console.error(`[govee-poll] auth_error connection mark failed for ${h.user_id}:`, connError.message);

      const { error: humError } = await supabase.from("humidors")
        .update({ sensor_status: "auth_error" })
        .eq("user_id", h.user_id)
        .not("device_id", "is", null);
      if (humError) console.error(`[govee-poll] auth_error humidor mark failed for ${h.user_id}:`, humError.message);

      return "auth_error";
    }
    console.error(`[govee-poll] fetch failed for ${h.user_id}:`, (err as Error).message);
    return "transient"; // row untouched; next tick retries
  }

  if (reading === null) {
    const { error: markError } = await supabase.from("humidors")
      .update({ sensor_status: "device_missing" }).eq("id", h.id);
    if (markError) console.error(`[govee-poll] device_missing mark failed for humidor ${h.id}:`, markError.message);
    return "device_missing";
  }

  const config = {
    humidityMin: h.humidity_min, humidityMax: h.humidity_max,
    tempMinF:    h.temp_min_f,   tempMaxF:    h.temp_max_f,
  };
  const { nextState, alerts } = evaluateReading(reading, config, h.alert_state ?? {}, nowMs);

  const { error: writeError } = await supabase.from("humidors").update({
    last_temp_f:     reading.tempF,
    last_humidity:   reading.humidity,
    last_reading_at: new Date(nowMs).toISOString(),
    alert_state:     nextState,
    sensor_status:   "active",
  }).eq("id", h.id);

  if (writeError) {
    /* Cooldown state failed to persist. Sending the alerts anyway
       would re-fire them every 15 minutes until the write succeeds,
       so skip them and retry the whole poll next tick. */
    console.error(`[govee-poll] state write failed for humidor ${h.id}:`, writeError.message);
    return "transient";
  }

  for (const a of alerts) {
    try {
      await sendPushToUser(h.user_id, {
        title: "Humidor Alert",
        body:  alertBody(a, h),
        url:   "/humidor",
        tag:   `govee-${h.id}-${a.metric}`,
      }, "humidor_sensor");
    } catch (err) {
      console.error(`[govee-poll] push failed for ${h.user_id}:`, (err as Error).message);
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
      "poll Govee cloud for every sensored humidor; tables are service-role-only",
    );

    const { data: conns, error: connErr } = await supabase
      .from("govee_connections")
      .select("user_id, api_key")
      .eq("status", "active");

    if (connErr) {
      await finishCronRun(run, { ok: false, error: `query failed: ${connErr.message}`.slice(0, 500) });
      return NextResponse.json({ error: connErr.message }, { status: 500 });
    }

    const keyByUser = new Map((conns ?? []).map((c) => [c.user_id as string, c.api_key as string]));
    const userIds = [...keyByUser.keys()];

    let list: SensoredHumidor[] = [];
    if (userIds.length > 0) {
      const { data: hums, error: humErr } = await supabase
        .from("humidors")
        .select("id, user_id, name, device_id, sku, humidity_min, humidity_max, temp_min_f, temp_max_f, alert_state")
        .in("user_id", userIds)
        .not("device_id", "is", null)
        .eq("sensor_status", "active");

      if (humErr) {
        await finishCronRun(run, { ok: false, error: `query failed: ${humErr.message}`.slice(0, 500) });
        return NextResponse.json({ error: humErr.message }, { status: 500 });
      }

      list = (hums ?? []).map((h) => ({ ...h, api_key: keyByUser.get(h.user_id as string) as string })) as SensoredHumidor[];
    }

    const summary = { polled: 0, alerted: 0, auth_errors: 0, device_missing: 0, transient: 0 };
    const nowMs = Date.now();

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const results = await Promise.allSettled(
        list.slice(i, i + BATCH_SIZE).map((h) => pollOne(supabase, h, nowMs)),
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
