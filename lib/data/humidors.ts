"use client";

/* Humidor containers: client-side reads/writes under own-row RLS,
   mirroring lib/data/humidor-fetchers.ts. Free-tier 1-humidor limit
   enforced by DB trigger (humidors_free_tier_limit) + upsell UI.
   Deletion goes through the delete_humidor RPC (atomic move+delete). */

import { createClient } from "@/utils/supabase/client";
import type { SensorLike } from "@/lib/humidor/overview";

export interface Humidor extends SensorLike {
  id: string;
  user_id: string;
  name: string;
  type: "humidor" | "tupperdor" | "cooler" | "travel";
  is_default: boolean;
  created_at: string;
}

export const HUMIDOR_COLUMNS =
  "id, user_id, name, type, is_default, device_id, sku, device_name, " +
  "humidity_min, humidity_max, temp_min_f, temp_max_f, " +
  "last_temp_f, last_humidity, last_reading_at, sensor_status, alert_state, created_at";

export class HumidorLimitReachedError extends Error {
  constructor() {
    super("humidors_free_tier_limit");
  }
}

export function mapHumidorInsertError(
  err: { code?: string; message?: string },
): Error {
  if (err.code === "P0001" && (err.message ?? "").includes("humidors_free_tier_limit")) {
    return new HumidorLimitReachedError();
  }
  return new Error(err.message ?? "Something went wrong.");
}

export async function fetchHumidors(userId: string): Promise<Humidor[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("humidors")
    .select(HUMIDOR_COLUMNS)
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Humidor[];
}

export async function createHumidor(
  userId: string,
  name: string,
  type: Humidor["type"],
): Promise<Humidor> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("humidors")
    .insert({ user_id: userId, name: name.trim().slice(0, 40), type })
    .select(HUMIDOR_COLUMNS)
    .single();
  if (error) throw mapHumidorInsertError(error);
  return data as unknown as Humidor;
}

export async function updateHumidor(
  humidorId: string,
  patch: Partial<
    Pick<
      Humidor,
      "name" | "type" | "humidity_min" | "humidity_max" | "temp_min_f" | "temp_max_f"
    >
  >,
): Promise<void> {
  const supabase = createClient();
  const clean = { ...patch };
  if (clean.name !== undefined) clean.name = clean.name.trim().slice(0, 40);
  const { error } = await supabase.from("humidors").update(clean).eq("id", humidorId);
  if (error) throw new Error(error.message);
}

export async function deleteHumidor(
  humidorId: string,
  destId: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("delete_humidor", {
    p_humidor_id: humidorId,
    p_dest_id: destId,
  });
  if (error) throw new Error(error.message);
}

/* Lazy default for brand-new users (backfill covers existing ones).
   The one-default-per-user partial unique index makes a concurrent
   double-create safe: the loser re-selects. */
export async function ensureDefaultHumidor(userId: string): Promise<Humidor> {
  const supabase = createClient();
  const { data } = await supabase
    .from("humidors")
    .select(HUMIDOR_COLUMNS)
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();
  if (data) return data as unknown as Humidor;

  const { data: created, error } = await supabase
    .from("humidors")
    .insert({ user_id: userId, name: "My Humidor", is_default: true })
    .select(HUMIDOR_COLUMNS)
    .single();
  if (!error && created) return created as unknown as Humidor;

  const { data: retry, error: retryErr } = await supabase
    .from("humidors")
    .select(HUMIDOR_COLUMNS)
    .eq("user_id", userId)
    .eq("is_default", true)
    .single();
  if (retryErr || !retry)
    throw new Error(
      retryErr?.message ?? "Could not create default humidor.",
    );
  return retry as unknown as Humidor;
}
