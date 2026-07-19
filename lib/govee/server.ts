/* Server-only helpers for /api/govee/* routes. */

import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/server-user";
import { createServiceClientFor } from "@/utils/supabase/service";
import { isPaidMember } from "@/lib/membership";

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
