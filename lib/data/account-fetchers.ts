"use client";

/*
 * Client-side Supabase fetcher for the Account page profile row.
 *
 * Pairs with keyFor.accountProfile(userId). Own-row RLS means this
 * query can only ever return the signed-in user's row — same column
 * set the old server-rendered /account page selected. Returns plain
 * values; errors throw so SWR's error handling kicks in.
 */

import { createClient } from "@/utils/supabase/client";
import type { MembershipTier } from "@/lib/stripe";

export interface AccountProfileRow {
  membership_tier:        MembershipTier | null;
  stripe_customer_id:     string | null;
  stripe_subscription_id: string | null;
  badge:                  string | null;
  assigned_badges:        string[] | null;
  display_name:           string | null;
  first_name:             string | null;
  last_name:              string | null;
  phone:                  string | null;
  city:                   string | null;
  state:                  string | null;
  zip_code:               string | null;
  country:                 string | null;
  avatar_url:             string | null;
  created_at:             string;
}

export async function fetchAccountProfile(
  userId: string,
): Promise<AccountProfileRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "membership_tier, stripe_customer_id, stripe_subscription_id, badge, assigned_badges, " +
      "display_name, first_name, last_name, phone, city, state, zip_code, country, avatar_url, created_at",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as unknown as AccountProfileRow | null;
}
