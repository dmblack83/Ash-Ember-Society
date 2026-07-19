/* /api/govee/connection — the user's Govee ACCOUNT link (API key).
     GET    -> GoveeKeyStatus
     POST   -> save { apiKey } after proving it lists devices
     DELETE -> forget the key and clear every sensor assignment
   Per-humidor sensor state lives on humidors (own-row RLS); see
   /api/govee/assign for assignment. All methods Member-gated. */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { listSensorDevices, GoveeAuthError } from "@/lib/govee/api";
import { requireMemberUser, goveeServiceClient } from "@/lib/govee/server";
import type { GoveeKeyStatus } from "@/lib/govee/types";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;
  const supabase = goveeServiceClient();
  const { data, error } = await supabase
    .from("govee_connections").select("status")
    .eq("user_id", gate.userId).maybeSingle();
  if (error) {
    console.error("[govee/connection] GET failed:", error.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  const body: GoveeKeyStatus = data
    ? { keyConnected: true, keyStatus: data.status as GoveeKeyStatus["keyStatus"] }
    : { keyConnected: false, keyStatus: null };
  return NextResponse.json(body);
}

export async function POST(request: NextRequest) {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  const rl = await checkRateLimit(gate.userId, { limit: 10, window: "1 h", prefix: "govee-connect" });
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let apiKey = "";
  try {
    const body = await request.json();
    apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  } catch { /* fall through */ }
  if (!apiKey || apiKey.length > 200) {
    return NextResponse.json({ error: "Enter your Govee API key." }, { status: 400 });
  }

  try {
    await listSensorDevices(apiKey); // proves the key works
  } catch (err) {
    if (err instanceof GoveeAuthError) {
      return NextResponse.json(
        { error: "That key didn't work. Double-check it in the Govee Home app." },
        { status: 400 },
      );
    }
    console.error("[govee/connection] key validation failed:", (err as Error).message);
    return NextResponse.json({ error: "Couldn't reach Govee. Try again in a minute." }, { status: 502 });
  }

  const supabase = goveeServiceClient();
  const { error } = await supabase
    .from("govee_connections")
    .upsert({ user_id: gate.userId, api_key: apiKey, status: "active" }, { onConflict: "user_id" });
  if (error) {
    console.error("[govee/connection] upsert failed:", error.message);
    return NextResponse.json({ error: "Something went wrong saving the key." }, { status: 500 });
  }
  return NextResponse.json({ keyConnected: true, keyStatus: "active" } satisfies GoveeKeyStatus);
}

export async function DELETE() {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;
  const supabase = goveeServiceClient();

  const { error: clearErr } = await supabase
    .from("humidors")
    .update({ device_id: null, sku: null, device_name: null, sensor_status: null, alert_state: {} })
    .eq("user_id", gate.userId)
    .not("device_id", "is", null);
  if (clearErr) {
    console.error("[govee/connection] sensor clear failed:", clearErr.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  const { error } = await supabase.from("govee_connections").delete().eq("user_id", gate.userId);
  if (error) {
    console.error("[govee/connection] DELETE failed:", error.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
