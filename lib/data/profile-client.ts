"use client";

/*
 * Client-side profile fetch for the static-shell home islands.
 * Mirrors the server `getProfileLite` projection (lib/data/profile.ts) but
 * uses the browser Supabase client. RLS (`profiles` SELECT auth.uid() = id)
 * scopes the read to the current user; the explicit `.eq("id", userId)` keeps
 * the query identical to the server one.
 */

import { createClient } from "@/utils/supabase/client";
import type { ProfileLite } from "@/lib/data/profile";

export async function fetchProfileLite(userId: string): Promise<ProfileLite | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name, first_name, city, zip_code, badge, assigned_badges, membership_tier, is_admin")
    .eq("id", userId)
    .single();
  return data ?? null;
}
