/* Server-only helpers for /api/govee/* routes. */

import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/server-user";
import { createServiceClientFor } from "@/utils/supabase/service";
import { isPaidMember } from "@/lib/membership";
import type { GoveeStatusResponse } from "./types";

export function goveeServiceClient() {
  return createServiceClientFor(
    "api:govee",
    "govee_connections is service-role-only (holds per-user Govee API keys); routes verify auth + tier first",
  );
}

/* Auth + Member-tier gate. Returns userId or a ready-to-return error. */
export async function requireMemberUser(): Promise<
  { userId: string; error: null } | { userId: null; error: NextResponse }
> {
  const user = await getServerUser();
  if (!user) {
    return { userId: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const supabase = goveeServiceClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("membership_tier, badge, assigned_badges")
    .eq("id", user.id)
    .single();
  if (error) {
    console.error("[govee] profiles lookup failed in requireMemberUser:", error.message);
    return { userId: null, error: NextResponse.json({ error: "Something went wrong." }, { status: 500 }) };
  }
  if (!isPaidMember(profile)) {
    return { userId: null, error: NextResponse.json({ error: "Membership required" }, { status: 403 }) };
  }
  return { userId: user.id, error: null };
}

interface ConnectionRow {
  device_name: string | null; sku: string; status: "active" | "auth_error" | "device_missing";
  humidity_min: number; humidity_max: number; temp_min_f: number; temp_max_f: number;
  last_temp_f: number | null; last_humidity: number | null; last_reading_at: string | null;
}

export function rowToStatus(row: ConnectionRow): GoveeStatusResponse {
  return {
    connected:     true,
    deviceName:    row.device_name,
    sku:           row.sku,
    status:        row.status,
    thresholds: {
      humidityMin: row.humidity_min, humidityMax: row.humidity_max,
      tempMinF:    row.temp_min_f,   tempMaxF:    row.temp_max_f,
    },
    lastTempF:     row.last_temp_f,
    lastHumidity:  row.last_humidity,
    lastReadingAt: row.last_reading_at,
  };
}

export const CONNECTION_COLUMNS =
  "device_name, sku, status, humidity_min, humidity_max, temp_min_f, temp_max_f, last_temp_f, last_humidity, last_reading_at";
