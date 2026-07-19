/* /api/govee/assign — attach/detach a Govee sensor to ONE humidor.
     POST   { humidorId, deviceId, sku, deviceName } -> { ok: true }
     DELETE { humidorId }                            -> { ok: true }
   Server-validated because assignment must check the account's real
   device list and cross-humidor uniqueness. Member-gated. */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { listSensorDevices, fetchSensorReading, GoveeAuthError, SUPPORTED_SENSOR_SKUS } from "@/lib/govee/api";
import { requireMemberUser, goveeServiceClient } from "@/lib/govee/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  const rl = await checkRateLimit(gate.userId, { limit: 20, window: "1 h", prefix: "govee-assign" });
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let body: { humidorId?: unknown; deviceId?: unknown; sku?: unknown; deviceName?: unknown };
  try { body = await request.json(); } catch { body = {}; }
  const humidorId  = typeof body.humidorId  === "string" ? body.humidorId  : "";
  const deviceId   = typeof body.deviceId   === "string" ? body.deviceId.trim() : "";
  const sku        = typeof body.sku        === "string" ? body.sku.trim() : "";
  const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim().slice(0, 100) : null;
  if (!humidorId || !deviceId || !SUPPORTED_SENSOR_SKUS.has(sku)) {
    return NextResponse.json({ error: "Pick a supported sensor." }, { status: 400 });
  }

  const supabase = goveeServiceClient();

  const { data: humidor, error: hErr } = await supabase
    .from("humidors").select("id")
    .eq("id", humidorId).eq("user_id", gate.userId).maybeSingle();
  if (hErr) {
    console.error("[govee/assign] humidor lookup failed:", hErr.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  if (!humidor) return NextResponse.json({ error: "Humidor not found." }, { status: 404 });

  const { data: conn } = await supabase
    .from("govee_connections").select("api_key")
    .eq("user_id", gate.userId).maybeSingle();
  if (!conn) {
    return NextResponse.json(
      { error: "Connect your Govee account first in Account settings." },
      { status: 409 },
    );
  }

  const { data: clash } = await supabase
    .from("humidors").select("id")
    .eq("user_id", gate.userId).eq("device_id", deviceId).neq("id", humidorId).maybeSingle();
  if (clash) {
    return NextResponse.json(
      { error: "That sensor is already assigned to another humidor." },
      { status: 409 },
    );
  }

  let reading;
  try {
    const devices = await listSensorDevices(conn.api_key);
    if (!devices.some((d) => d.device === deviceId && d.sku === sku)) {
      return NextResponse.json({ error: "That sensor isn't on your Govee account." }, { status: 400 });
    }
    reading = await fetchSensorReading(conn.api_key, sku, deviceId);
  } catch (err) {
    if (err instanceof GoveeAuthError) {
      await supabase.from("govee_connections")
        .update({ status: "auth_error" }).eq("user_id", gate.userId);
      return NextResponse.json(
        { error: "Govee rejected your API key. Reconnect it in Account settings." },
        { status: 400 },
      );
    }
    console.error("[govee/assign] validation failed:", (err as Error).message);
    return NextResponse.json({ error: "Couldn't reach Govee. Try again in a minute." }, { status: 502 });
  }

  const { error } = await supabase.from("humidors").update({
    device_id: deviceId, sku, device_name: deviceName,
    sensor_status: "active", alert_state: {},
    last_temp_f: reading?.tempF ?? null,
    last_humidity: reading?.humidity ?? null,
    last_reading_at: reading ? new Date().toISOString() : null,
  }).eq("id", humidorId);
  if (error) {
    console.error("[govee/assign] update failed:", error.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  let humidorId = "";
  try {
    const body = await request.json();
    humidorId = typeof body?.humidorId === "string" ? body.humidorId : "";
  } catch { /* fall through */ }
  if (!humidorId) return NextResponse.json({ error: "Missing humidor." }, { status: 400 });

  const supabase = goveeServiceClient();
  const { error } = await supabase.from("humidors").update({
    device_id: null, sku: null, device_name: null,
    sensor_status: null, alert_state: {},
    last_temp_f: null, last_humidity: null, last_reading_at: null,
  }).eq("id", humidorId).eq("user_id", gate.userId);
  if (error) {
    console.error("[govee/assign] unassign failed:", error.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
