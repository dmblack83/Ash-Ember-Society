import { createClient }    from "@/utils/supabase/server";
import { getServerUser }   from "@/lib/auth/server-user";
import { getLatestNews }   from "@/lib/data/news";
import { Masthead }                     from "@/components/dashboard/Masthead";
import { TonightsPairing }              from "@/components/dashboard/TonightsPairing";
import { SmokingConditions }            from "@/components/dashboard/SmokingConditions";
import { AgingAlerts }                  from "@/components/dashboard/AgingAlerts";
import { News }                         from "@/components/dashboard/News";
import { FieldGuide }                   from "@/components/dashboard/FieldGuide";
import { LocalShops }                   from "@/components/dashboard/LocalShops";
import type { AgingItem }               from "@/components/dashboard/AgingAlerts";

// User-specific data — opt out of static rendering
export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const user     = await getServerUser();

  /* ── Profile ──────────────────────────────────────────────────── */
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("display_name, city, is_admin")
        .eq("id", user.id)
        .single()
    : { data: null };

  const displayName = profile?.display_name ?? "there";
  const city        = profile?.city?.trim() || null;

  /* ── Cutoffs ───────────────────────────────────────────────────── */
  const cutoff    = new Date();
  cutoff.setDate(cutoff.getDate() + 31);
  const cutoffStr = cutoff.toISOString().split("T")[0];
  const agingFloor = new Date();
  agingFloor.setDate(agingFloor.getDate() - 7);
  const agingFloorStr = agingFloor.toISOString().split("T")[0];

  /* ── Run all data queries in parallel ─────────────────────────── */
  const [agingRes, shopCountRes, newsItems] = await Promise.all([
    user
      ? supabase
          .from("humidor_items")
          .select(
            "id, aging_start_date, aging_target_date, " +
            "cigar:cigar_catalog(brand, series)"
          )
          .eq("user_id", user.id)
          .eq("is_wishlist", false)
          .not("aging_target_date", "is", null)
          .gte("aging_target_date", agingFloorStr)
          .lte("aging_target_date", cutoffStr)
          .order("aging_target_date", { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
    supabase
      .from("shops")
      .select("id", { count: "exact", head: true }),
    getLatestNews(5),
  ]);

  const agingItems = (agingRes.data ?? []) as unknown as AgingItem[];
  const shopCount  = shopCountRes.count ?? 0;

  return (
    <>
      {/* ── 0. Masthead (sticky, full-width) ─────────────────────── */}
      <Masthead displayName={displayName} isAdmin={!!profile?.is_admin} />

      <div className="px-4 sm:px-6 pt-6 pb-6 flex flex-col gap-6 max-w-2xl mx-auto">

        {/* ── 1. Tonight's Pairing — primary CTAs ───────────────────── */}
        <TonightsPairing />

        {/* ── 2. Smoking conditions strip ───────────────────────────── */}
        <SmokingConditions city={city} />

        {/* ── 3. Aging Shelf ────────────────────────────────────────── */}
        <AgingAlerts initialItems={agingItems} />

        {/* ── 4. The Wire (RSS-driven news) ─────────────────────────── */}
        <News items={newsItems} />

        {/* ── 5. Field Guide — editorial reference library ──────────── */}
        <FieldGuide />

        {/* ── 6. Local Shops ────────────────────────────────────────── */}
        <LocalShops shopCount={shopCount} />

      </div>
    </>
  );
}
