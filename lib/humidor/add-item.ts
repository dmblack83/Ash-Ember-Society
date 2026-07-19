import type { SupabaseClient } from "@supabase/supabase-js";
import { getMembershipTier, FREE_TIER_LIMITS, type MembershipProfile } from "@/lib/membership";

/**
 * Thrown when a free-tier user tries to add a distinct cigar beyond the
 * FREE_TIER_LIMITS.humidor_items cap. Callers should catch this and
 * present the upgrade modal.
 */
export class HumidorLimitError extends Error {
  constructor() {
    super("humidor_free_tier_limit");
    this.name = "HumidorLimitError";
  }
}

export interface HumidorInsertPayload {
  user_id:           string;
  cigar_id:          string;
  quantity?:         number;
  purchase_quantity?: number;
  purchase_date?:    string | null;
  price_paid_cents?: number | null;
  source?:           string | null;
  aging_start_date?: string | null;
  aging_target_date?: string | null;
  notes?:            string | null;
  is_wishlist?:      boolean;
  humidor_id?:       string | null;
}

/**
 * Assert the user is allowed to add `cigarId` to their humidor.
 * Returns silently on pass. Throws HumidorLimitError on block.
 *
 * Rules:
 *  - Paid tier → always pass.
 *  - Wishlist add (is_wishlist=true) → never called from addHumidorItem
 *    on the wishlist path; safe to call here regardless.
 *  - Free tier, cigarId already owned → pass (batch-add is free).
 *  - Free tier, new cigarId, under the cap → pass.
 *  - Free tier, new cigarId, at the cap → throw.
 */
export async function assertCanAddHumidor(
  supabase: SupabaseClient,
  userId:   string,
  cigarId:  string,
): Promise<void> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("membership_tier, badge, assigned_badges")
    .eq("id", userId)
    .single<MembershipProfile>();

  if (profileError) throw profileError;

  if (getMembershipTier(profile) !== "free") return;

  const { data: rows, error } = await supabase
    .from("humidor_items")
    .select("cigar_id")
    .eq("user_id", userId)
    .eq("is_wishlist", false);

  if (error) {
    throw error;
  }

  const distinct = new Set((rows ?? []).map((r) => r.cigar_id));

  if (distinct.has(cigarId)) return;

  if (distinct.size >= FREE_TIER_LIMITS.humidor_items) {
    throw new HumidorLimitError();
  }
}

/**
 * Insert a humidor_items row, gated by the free-tier cap when
 * is_wishlist=false. Wishlist inserts bypass the gate entirely.
 *
 * Maps Postgres errcode P0001 (the trigger's exception) to
 * HumidorLimitError so race-condition rejections show the modal too.
 */
export async function addHumidorItem(
  supabase: SupabaseClient,
  payload:  HumidorInsertPayload,
): Promise<void> {
  if (!payload.is_wishlist) {
    await assertCanAddHumidor(supabase, payload.user_id, payload.cigar_id);
  }

  const { error } = await supabase.from("humidor_items").insert(payload);

  if (error) {
    if (error.code === "P0001" && error.message.includes("humidor_free_tier_limit")) {
      throw new HumidorLimitError();
    }
    throw error;
  }
}
