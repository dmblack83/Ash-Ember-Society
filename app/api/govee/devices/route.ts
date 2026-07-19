/* POST /api/govee/devices — validate a Govee API key and list the
   account's SUPPORTED sensors. Persists nothing; the client holds
   the key only during the connect flow. Rate-limited: each call
   fans out to Govee's cloud with user input. */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { listSensorDevices, GoveeAuthError } from "@/lib/govee/api";
import { requireMemberUser } from "@/lib/govee/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  const rl = await checkRateLimit(gate.userId, { limit: 10, window: "1 h", prefix: "govee-devices" });
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let apiKey: string;
  try {
    const body = await request.json();
    apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  } catch { apiKey = ""; }
  if (!apiKey || apiKey.length > 200) {
    return NextResponse.json({ error: "Enter your Govee API key." }, { status: 400 });
  }

  try {
    const devices = await listSensorDevices(apiKey);
    return NextResponse.json({ devices });
  } catch (err) {
    if (err instanceof GoveeAuthError) {
      return NextResponse.json(
        { error: "That key didn't work. Double-check it in the Govee Home app." },
        { status: 400 },
      );
    }
    console.error("[govee/devices] list failed:", (err as Error).message);
    return NextResponse.json({ error: "Couldn't reach Govee. Try again in a minute." }, { status: 502 });
  }
}
