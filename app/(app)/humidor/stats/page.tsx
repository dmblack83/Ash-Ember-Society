import { createClient }     from "@/utils/supabase/server";
import { getServerUser }    from "@/lib/auth/server-user";
import { getFlavorTags }    from "@/lib/data/flavor-tags";
import { StatsClientLazy }  from "@/components/humidor/StatsClientLazy";
import type {
  StatsClientData,
  MonthlyBar,
  StrengthSlice,
  RatingBucket,
  FlavorPoint,
  BrandPoint,
} from "@/components/humidor/StatsClient";

// User-specific data -- opt out of static rendering
export const runtime = "edge";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------
   Strength display maps
   ------------------------------------------------------------------ */
const STRENGTH_COLORS: Record<string, string> = {
  mild:         "#5A9A72",
  mild_medium:  "#8A8A42",
  medium:       "#C17817",
  medium_full:  "#A0631A",
  full:         "#C44536",
};
const STRENGTH_LABELS: Record<string, string> = {
  mild:         "Mild",
  mild_medium:  "Mild-Medium",
  medium:       "Medium",
  medium_full:  "Medium-Full",
  full:         "Full",
};

const BUCKET_COLORS = ["#C44536", "#9A3B2A", "#8B6020", "#3A6B45", "#D4A04A"];

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface SmokeLog {
  id:             string;
  smoked_at:      string;
  overall_rating: number | null;
  flavor_tag_ids: string[] | null;
  cigar_id:       string;
}
interface HumidorRow {
  quantity:          number;
  purchase_quantity: number | null;
  price_paid_cents:  number | null;
  cigar:             { id: string; brand: string; strength: string | null } | null;
}

const STRENGTH_ORDER: readonly string[] = ["mild", "mild_medium", "medium", "medium_full", "full"];
interface FlavorTag {
  id:       string;
  name:     string;
  category: string;
}

function buildMonthlyBars(logs: SmokeLog[]): MonthlyBar[] {
  const now = new Date();
  const buckets: Record<string, number> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets[`${d.getFullYear()}-${d.getMonth()}`] = 0;
  }
  for (const log of logs) {
    const d   = new Date(log.smoked_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (key in buckets) buckets[key]++;
  }
  return Object.entries(buckets).map(([key, count]) => {
    const [yr, mo] = key.split("-").map(Number);
    const isCurrent = yr === now.getFullYear() && mo === now.getMonth();
    return { month: MONTHS_SHORT[mo], count, isCurrent };
  });
}

function buildStrengthDist(
  logs:            SmokeLog[],
  strengthByCigar: Record<string, string>
): StrengthSlice[] {
  const counts: Record<string, number> = {};
  for (const log of logs) {
    const s = strengthByCigar[log.cigar_id];
    if (!s) continue;
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return STRENGTH_ORDER
    .filter((s) => (counts[s] ?? 0) > 0)
    .map((s) => ({
      name:  STRENGTH_LABELS[s] ?? s,
      value: counts[s],
      color: STRENGTH_COLORS[s] ?? "#888888",
    }));
}

function buildRatingBuckets(logs: SmokeLog[]): RatingBucket[] {
  const buckets = [
    { label: "1-20",   min: 1,  max: 20,  color: BUCKET_COLORS[0] },
    { label: "21-40",  min: 21, max: 40,  color: BUCKET_COLORS[1] },
    { label: "41-60",  min: 41, max: 60,  color: BUCKET_COLORS[2] },
    { label: "61-80",  min: 61, max: 80,  color: BUCKET_COLORS[3] },
    { label: "81-100", min: 81, max: 100, color: BUCKET_COLORS[4] },
  ];
  return buckets.map((b) => ({
    label: b.label,
    count: logs.filter(
      (l) => (l.overall_rating ?? 0) >= b.min && (l.overall_rating ?? 0) <= b.max
    ).length,
    color: b.color,
  }));
}

function buildFlavorFreq(logs: SmokeLog[], allTags: FlavorTag[]): FlavorPoint[] {
  const freq: Record<string, number> = {};
  for (const log of logs) {
    for (const tid of log.flavor_tag_ids ?? []) {
      freq[tid] = (freq[tid] ?? 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => ({
      name: allTags.find((t) => t.id === id)?.name ?? id,
      count,
    }));
}

function buildTopBrands(
  logs:          SmokeLog[],
  brandsByCigar: Record<string, string>
): BrandPoint[] {
  const brandCount: Record<string, number> = {};
  for (const log of logs) {
    const brand = brandsByCigar[log.cigar_id];
    if (brand) brandCount[brand] = (brandCount[brand] ?? 0) + 1;
  }
  return Object.entries(brandCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([brand, count]) => ({ brand, count }));
}

/* ------------------------------------------------------------------
   Page
   ------------------------------------------------------------------ */
export default async function StatsPage() {
  const supabase = await createClient();
  const user     = await getServerUser();

  if (!user) return null;

  const [logsRes, humidorRes, tags] = await Promise.all([
    supabase
      .from("smoke_logs")
      .select("id, smoked_at, overall_rating, flavor_tag_ids, cigar_id")
      .eq("user_id", user.id)
      .order("smoked_at", { ascending: true }),
    supabase
      .from("humidor_items")
      .select("quantity, purchase_quantity, price_paid_cents, cigar:cigar_catalog(id, brand, strength)")
      .eq("user_id", user.id)
      .eq("is_wishlist", false),
    /* Cached cross-request — see lib/data/flavor-tags.ts. */
    getFlavorTags() as Promise<FlavorTag[]>,
  ]);

  const logs  = (logsRes.data   ?? []) as SmokeLog[];
  const hRows = (humidorRes.data ?? []) as unknown as HumidorRow[];

  const brandsByCigar:   Record<string, string> = {};
  const strengthByCigar: Record<string, string> = {};
  for (const row of hRows) {
    if (!row.cigar) continue;
    brandsByCigar[row.cigar.id] = row.cigar.brand;
    if (row.cigar.strength) strengthByCigar[row.cigar.id] = row.cigar.strength;
  }

  // Cigars currently in humidor (sum of quantities)
  const totalCigars = hRows.reduce((s, r) => s + r.quantity, 0);

  const totalReports = logs.length;

  const avgRating =
    logs.length > 0
      ? (logs.reduce((s, l) => s + (l.overall_rating ?? 0), 0) / logs.length).toFixed(1)
      : null;

  // Lifetime investment = every cigar ever purchased at original purchase quantity
  const lifetimeInvestmentCents = hRows.reduce(
    (s, r) => s + ((r.purchase_quantity ?? r.quantity) * (r.price_paid_cents ?? 0)),
    0
  );

  // Collection value = current quantity remaining * price per stick
  const collectionValueCents = hRows.reduce(
    (s, r) => r.quantity > 0 ? s + (r.quantity * (r.price_paid_cents ?? 0)) : s,
    0
  );

  const hasEnough = logs.length >= 3;

  const statsData: StatsClientData = {
    totalCigars,
    totalReports,
    avgRating,
    lifetimeInvestmentCents,
    collectionValueCents,
    hasEnough,
    monthlyBars:   buildMonthlyBars(logs),
    strengthDist:  buildStrengthDist(logs, strengthByCigar),
    ratingBuckets: buildRatingBuckets(logs),
    flavorFreq:    buildFlavorFreq(logs, tags),
    topBrands:     buildTopBrands(logs, brandsByCigar),
  };

  return <StatsClientLazy data={statsData} />;
}
