/* /api/govee/connection — the user's single sensor connection.
     GET    → GoveeStatusResponse (no secrets)
     POST   → save { apiKey, deviceId, sku, deviceName } + take one
              immediate reading so the UI isn't empty until the cron
     PATCH  → update thresholds
     DELETE → disconnect (row delete)
   All methods: auth + Member gate. Table is service-role-only. */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { fetchSensorReading, GoveeAuthError, SUPPORTED_SENSOR_SKUS } from "@/lib/govee/api";
import { validateThresholds } from "@/lib/govee/thresholds";
import { DISCONNECTED_STATUS } from "@/lib/govee/types";
import { requireMemberUser, goveeServiceClient, rowToStatus, CONNECTION_COLUMNS } from "@/lib/govee/server";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  const supabase = goveeServiceClient();
  const { data, error } = await supabase
    .from("govee_connections")
    .select(CONNECTION_COLUMNS)
    .eq("user_id", gate.userId)
    .maybeSingle();

  if (error) {
    console.error("[govee/connection] GET failed:", error.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  return NextResponse.json(data ? rowToStatus(data) : DISCONNECTED_STATUS);
}

export async function POST(request: NextRequest) {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  const rl = await checkRateLimit(gate.userId, { limit: 10, window: "1 h", prefix: "govee-connect" });
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let body: { apiKey?: unknown; deviceId?: unknown; sku?: unknown; deviceName?: unknown };
  try { body = await request.json(); } catch { body = {}; }
  const apiKey     = typeof body.apiKey     === "string" ? body.apiKey.trim()     : "";
  const deviceId   = typeof body.deviceId   === "string" ? body.deviceId.trim()   : "";
  const sku        = typeof body.sku        === "string" ? body.sku.trim()        : "";
  const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim().slice(0, 100) : null;

  if (!apiKey || !deviceId || !SUPPORTED_SENSOR_SKUS.has(sku)) {
    return NextResponse.json({ error: "Pick a supported sensor to connect." }, { status: 400 });
  }

  /* Prove key + device work RIGHT NOW with one reading; also seeds
     the UI so the strip isn't empty until the next cron tick. */
  let reading;
  try {
    reading = await fetchSensorReading(apiKey, sku, deviceId);
  } catch (err) {
    if (err instanceof GoveeAuthError) {
      return NextResponse.json(
        { error: "That key didn't work. Double-check it in the Govee Home app." },
        { status: 400 },
      );
    }
    console.error("[govee/connection] seed reading failed:", (err as Error).message);
    return NextResponse.json({ error: "Couldn't reach Govee. Try again in a minute." }, { status: 502 });
  }

  const supabase = goveeServiceClient();
  const { data, error } = await supabase
    .from("govee_connections")
    .upsert({
      user_id:         gate.userId,
      api_key:         apiKey,
      device_id:       deviceId,
      sku,
      device_name:     deviceName,
      status:          "active",
      alert_state:     {},
      last_temp_f:     reading?.tempF ?? null,
      last_humidity:   reading?.humidity ?? null,
      last_reading_at: reading ? new Date().toISOString() : null,
    }, { onConflict: "user_id" })
    .select(CONNECTION_COLUMNS)
    .single();

  if (error || !data) {
    console.error("[govee/connection] upsert failed:", error?.message);
    return NextResponse.json({ error: "Something went wrong saving the connection." }, { status: 500 });
  }
  return NextResponse.json(rowToStatus(data));
}

export async function PATCH(request: NextRequest) {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const thresholds = validateThresholds(body);
  if (!thresholds) {
    return NextResponse.json(
      { error: "Ranges must be within 30 to 90% RH and 40 to 90°F, with min below max." },
      { status: 400 },
    );
  }

  const supabase = goveeServiceClient();
  const { error } = await supabase
    .from("govee_connections")
    .update({
      humidity_min: thresholds.humidityMin, humidity_max: thresholds.humidityMax,
      temp_min_f:   thresholds.tempMinF,    temp_max_f:   thresholds.tempMaxF,
    })
    .eq("user_id", gate.userId);

  if (error) {
    console.error("[govee/connection] PATCH failed:", error.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  const supabase = goveeServiceClient();
  const { error } = await supabase.from("govee_connections").delete().eq("user_id", gate.userId);
  if (error) {
    console.error("[govee/connection] DELETE failed:", error.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
