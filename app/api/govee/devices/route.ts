/* POST /api/govee/devices — list the account's supported sensors
   using the STORED key, marking which are already assigned to one of
   the user's humidors. 409 when no key is connected yet. */

import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { listSensorDevices, GoveeAuthError } from "@/lib/govee/api";
import { requireMemberUser, goveeServiceClient } from "@/lib/govee/server";

export const runtime = "nodejs";

export async function POST() {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  const rl = await checkRateLimit(gate.userId, { limit: 20, window: "1 h", prefix: "govee-devices" });
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const supabase = goveeServiceClient();
  const { data: conn, error: connErr } = await supabase
    .from("govee_connections").select("api_key")
    .eq("user_id", gate.userId).maybeSingle();
  if (connErr) {
    console.error("[govee/devices] key lookup failed:", connErr.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  if (!conn) {
    return NextResponse.json(
      { error: "Connect your Govee account first in Account settings." },
      { status: 409 },
    );
  }

  const { data: assigned, error: assignedErr } = await supabase
    .from("humidors").select("id, device_id")
    .eq("user_id", gate.userId).not("device_id", "is", null);
  if (assignedErr) {
    console.error("[govee/devices] assigned lookup failed:", assignedErr.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  const byDevice = new Map((assigned ?? []).map((h) => [h.device_id as string, h.id as string]));

  try {
    const devices = await listSensorDevices(conn.api_key);
    return NextResponse.json({
      devices: devices.map((d) => ({ ...d, assignedHumidorId: byDevice.get(d.device) ?? null })),
    });
  } catch (err) {
    if (err instanceof GoveeAuthError) {
      await supabase.from("govee_connections")
        .update({ status: "auth_error" }).eq("user_id", gate.userId);
      return NextResponse.json(
        { error: "Govee rejected your API key. Reconnect it in Account settings." },
        { status: 400 },
      );
    }
    console.error("[govee/devices] list failed:", (err as Error).message);
    return NextResponse.json({ error: "Couldn't reach Govee. Try again in a minute." }, { status: 502 });
  }
}
