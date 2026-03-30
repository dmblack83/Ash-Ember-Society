"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Divider } from "@/components/ui/divider";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

/* ------------------------------------------------------------------
   Design tokens (mirrored from globals.css)
   ------------------------------------------------------------------ */
const T = {
  primary:       "#C17817",
  accent:        "#D4A04A",
  destructive:   "#C44536",
  secondary:     "#3D2E23",
  muted:         "#2D221B",
  border:        "#3D2E23",
  foreground:    "#F5E6D3",
  mutedFg:       "#A69080",
  card:          "#241C17",
  sageGreen:     "#3A6B45",
  mutedAmber:    "#8B6020",
};

/* Strength → display color (matches badge system) */
const STRENGTH_COLORS: Record<string, string> = {
  mild:         "#5A9A72",
  mild_medium:  "#8A8A42",
  medium:       T.primary,
  medium_full:  "#A0631A",
  full:         T.destructive,
};
const STRENGTH_LABELS: Record<string, string> = {
  mild: "Mild", mild_medium: "Mild-Medium", medium: "Medium",
  medium_full: "Medium-Full", full: "Full",
};

/* Rating bucket gradient */
const BUCKET_COLORS = [T.destructive, "#9A3B2A", T.mutedAmber, T.sageGreen, T.accent];

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */
interface SmokeLog {
  id: string;
  smoked_at: string;
  overall_rating: number | null;
  flavor_tag_ids: string[] | null;
  cigar_id: string;
}

interface HumidorRow {
  quantity: number;
  price_paid_cents: number | null;
  cigar: { strength: string; brand: string };
}

interface FlavorTag {
  id: string;
  name: string;
  category: string;
}

/* ------------------------------------------------------------------
   Derived data helpers
   ------------------------------------------------------------------ */
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function buildMonthlyBars(logs: SmokeLog[]): { month: string; count: number; isCurrent: boolean }[] {
  const now = new Date();
  const buckets: Record<string, number> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets[`${d.getFullYear()}-${d.getMonth()}`] = 0;
  }
  for (const log of logs) {
    const d = new Date(log.smoked_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (key in buckets) buckets[key]++;
  }
  return Object.entries(buckets).map(([key, count]) => {
    const [yr, mo] = key.split("-").map(Number);
    const isCurrent = yr === now.getFullYear() && mo === now.getMonth();
    return { month: MONTHS_SHORT[mo], count, isCurrent };
  });
}

function buildTopBrands(
  logs: SmokeLog[],
  humidor: HumidorRow[]
): { brand: string; count: number }[] {
  // Map cigar_id → brand from humidor, supplement with brand from smoke_logs (via humidor lookup)
  const cigarBrand: Record<string, string> = {};
  for (const row of humidor) cigarBrand[row.cigar.brand] = row.cigar.brand; // placeholder
  // We need cigar_id → brand; humidor rows have cigar embedded
  // Build cigar_id → brand from smoke_logs' cigar_ids cross-referenced to humidor
  // Since humidor only has remaining items, we use what we have and group by cigar_id
  const cigarCount: Record<string, number> = {};
  for (const log of logs) {
    cigarCount[log.cigar_id] = (cigarCount[log.cigar_id] ?? 0) + 1;
  }
  // We won't have brand for smoked-and-removed cigars, so we just sum by cigar_id
  // and label as cigar_id (abbreviated). Better: we return top-5 cigar_id counts and use brand if known.
  return Object.entries(cigarCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([, count]) => ({ brand: "–", count }));
}

function buildStrengthDist(
  logs: SmokeLog[],
  strengthByCigar: Record<string, string>
): { name: string; value: number; color: string }[] {
  const counts: Record<string, number> = {};
  for (const log of logs) {
    const s = strengthByCigar[log.cigar_id] ?? "unknown";
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return Object.entries(counts)
    .filter(([s]) => s !== "unknown")
    .map(([s, value]) => ({
      name: STRENGTH_LABELS[s] ?? s,
      value,
      color: STRENGTH_COLORS[s] ?? T.mutedFg,
    }));
}

function buildRatingBuckets(logs: SmokeLog[]): { label: string; count: number; color: string }[] {
  const buckets = [
    { label: "1–20",  min: 1,  max: 20,  color: BUCKET_COLORS[0] },
    { label: "21–40", min: 21, max: 40,  color: BUCKET_COLORS[1] },
    { label: "41–60", min: 41, max: 60,  color: BUCKET_COLORS[2] },
    { label: "61–80", min: 61, max: 80,  color: BUCKET_COLORS[3] },
    { label: "81–100",min: 81, max: 100, color: BUCKET_COLORS[4] },
  ];
  return buckets.map((b) => ({
    label: b.label,
    count: logs.filter((l) => (l.overall_rating ?? 0) >= b.min && (l.overall_rating ?? 0) <= b.max).length,
    color: b.color,
  }));
}

function buildFlavorFreq(
  logs: SmokeLog[],
  allTags: FlavorTag[]
): { name: string; count: number }[] {
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

/* ------------------------------------------------------------------
   Shared chart tooltip
   ------------------------------------------------------------------ */
function ChartTip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-sm shadow-xl"
      style={{ backgroundColor: T.secondary, border: `1px solid ${T.border}`, color: T.foreground }}
    >
      {label && <p className="font-medium mb-0.5">{label}</p>}
      <p style={{ color: T.accent }}>{payload[0].value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------
   Empty state
   ------------------------------------------------------------------ */
function EmptyChart() {
  return (
    <p
      className="text-center py-10 text-sm"
      style={{ fontFamily: "var(--font-serif)", color: T.mutedFg }}
    >
      Not enough data yet.
    </p>
  );
}

/* ------------------------------------------------------------------
   Stat card
   ------------------------------------------------------------------ */
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="flex-shrink-0 rounded-xl px-5 py-4 min-w-[140px] space-y-1"
      style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
    >
      <p
        className="text-3xl font-bold leading-none"
        style={{ fontFamily: "var(--font-serif)", color: T.accent }}
      >
        {value}
      </p>
      {sub && <p className="text-xs" style={{ color: T.accent }}>{sub}</p>}
      <p className="text-[11px] uppercase tracking-widest font-medium" style={{ color: T.mutedFg }}>
        {label}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------
   Chart container
   ------------------------------------------------------------------ */
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-5 space-y-4 animate-fade-in"
      style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
    >
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------
   Main page
   ------------------------------------------------------------------ */
export default function StatsPage() {
  const [loading, setLoading] = useState(true);
  const [smokeLogs, setSmokeLogs] = useState<SmokeLog[]>([]);
  const [humidor, setHumidor] = useState<HumidorRow[]>([]);
  const [allTags, setAllTags] = useState<FlavorTag[]>([]);
  const [brandsByCigar, setBrandsByCigar] = useState<Record<string, string>>({});
  const [strengthByCigar, setStrengthByCigar] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [logsRes, humidorRes, tagsRes] = await Promise.all([
        supabase
          .from("smoke_logs")
          .select("id, smoked_at, overall_rating, flavor_tag_ids, cigar_id")
          .eq("user_id", user.id)
          .order("smoked_at", { ascending: true }),
        supabase
          .from("humidor_items")
          .select("quantity, price_paid_cents, cigar:cigars(id, brand, strength)")
          .eq("user_id", user.id)
          .eq("is_wishlist", false),
        supabase.from("flavor_tags").select("id, name, category"),
      ]);

      const logs = (logsRes.data ?? []) as SmokeLog[];
      const hRows = (humidorRes.data ?? []) as unknown as (HumidorRow & {
        cigar: { id: string; brand: string; strength: string };
      })[];
      const tags = (tagsRes.data ?? []) as FlavorTag[];

      // Build lookup maps
      const bMap: Record<string, string> = {};
      const sMap: Record<string, string> = {};
      for (const row of hRows) {
        if (row.cigar) {
          bMap[(row.cigar as unknown as { id: string }).id] = row.cigar.brand;
          sMap[(row.cigar as unknown as { id: string }).id] = row.cigar.strength;
        }
      }

      setSmokeLogs(logs);
      setHumidor(hRows);
      setAllTags(tags);
      setBrandsByCigar(bMap);
      setStrengthByCigar(sMap);
      setLoading(false);
    }
    load();
  }, []);

  /* ── Derived numbers ───────────────────────────────────────────── */
  const totalCigars = humidor.reduce((s, r) => s + r.quantity, 0);
  const totalReports = smokeLogs.length;
  const avgRating =
    smokeLogs.length > 0
      ? (smokeLogs.reduce((s, l) => s + (l.overall_rating ?? 0), 0) / smokeLogs.length).toFixed(1)
      : null;
  const totalSpentCents = humidor.reduce(
    (s, r) => s + (r.price_paid_cents != null ? r.quantity * r.price_paid_cents : 0),
    0
  );
  const hasEnough = smokeLogs.length >= 3;

  /* ── Chart data ────────────────────────────────────────────────── */
  const monthlyBars     = buildMonthlyBars(smokeLogs);
  const strengthDist    = buildStrengthDist(smokeLogs, strengthByCigar);
  const ratingBuckets   = buildRatingBuckets(smokeLogs);
  const flavorFreq      = buildFlavorFreq(smokeLogs, allTags);

  // Top brands: need cigar_id → brand from smoke logs cross-referenced
  const brandCount: Record<string, number> = {};
  for (const log of smokeLogs) {
    const brand = brandsByCigar[log.cigar_id];
    if (brand) brandCount[brand] = (brandCount[brand] ?? 0) + 1;
  }
  const topBrands = Object.entries(brandCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([brand, count]) => ({ brand, count }));

  /* ── Skeleton ──────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <TabNav />
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0 rounded-xl min-w-[140px] h-24 animate-pulse"
              style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
            />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl h-48 animate-pulse"
              style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fade-in">

      <TabNav />

      {/* ── Overview cards ─────────────────────────────────────────── */}
      <section>
        <h2 className="sr-only">Overview</h2>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 sm:-mx-6 px-4 sm:px-6 sm:grid sm:grid-cols-5">
          <StatCard
            label="Cigars in Humidor"
            value={totalCigars.toString()}
          />
          <StatCard
            label="Burn Reports"
            value={totalReports.toString()}
          />
          <StatCard
            label="Average Rating"
            value={avgRating ?? "—"}
            sub={avgRating ? "/ 100" : undefined}
          />
          <StatCard
            label="Total Spent"
            value={
              totalSpentCents > 0
                ? `$${(totalSpentCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                : "—"
            }
          />
          <StatCard
            label="Collection Value"
            value={
              totalSpentCents > 0
                ? `$${(totalSpentCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                : "—"
            }
          />
        </div>
      </section>

      <Divider />

      {/* ── Charts ─────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-5">

        {/* 1 — Burn Reports over time */}
        <ChartCard title="Burn Reports Over Time">
          {!hasEnough ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyBars} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <XAxis
                  dataKey="month"
                  tick={{ fill: T.mutedFg, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: T.mutedFg, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {monthlyBars.map((entry, i) => (
                    <Cell key={i} fill={entry.isCurrent ? T.accent : T.primary} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 2 — Top Brands */}
        <ChartCard title="Top Brands">
          {topBrands.length === 0 ? <EmptyChart /> : (
            <div className="space-y-3">
              {topBrands.map((b, i) => {
                const maxCount = topBrands[0].count;
                const pct = (b.count / maxCount) * 100;
                const color = i === 0 ? T.accent : T.primary;
                return (
                  <div key={b.brand} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span style={{ color: T.foreground, fontWeight: i === 0 ? 600 : 400 }}>
                        {b.brand}
                      </span>
                      <span style={{ color: T.mutedFg }}>{b.count}</span>
                    </div>
                    <div
                      className="w-full h-1.5 rounded-full overflow-hidden"
                      style={{ backgroundColor: T.muted }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>

        {/* 3 — Strength Distribution */}
        <ChartCard title="Strength Distribution">
          {!hasEnough || strengthDist.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={strengthDist}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                >
                  {strengthDist.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div
                        className="rounded-lg px-3 py-2 text-sm shadow-xl"
                        style={{ backgroundColor: T.secondary, border: `1px solid ${T.border}`, color: T.foreground }}
                      >
                        <p className="font-medium">{payload[0].name}</p>
                        <p style={{ color: T.accent }}>{payload[0].value} smokes</p>
                      </div>
                    ) : null
                  }
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, color: T.mutedFg, paddingTop: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 4 — Rating Distribution */}
        <ChartCard title="Rating Distribution">
          {!hasEnough ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={ratingBuckets} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fill: T.mutedFg, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: T.mutedFg, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {ratingBuckets.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 5 — Favorite Flavors (full width) */}
        <div className="sm:col-span-2">
          <ChartCard title="Favorite Flavors">
            {flavorFreq.length === 0 ? <EmptyChart /> : (
              <div className="space-y-3">
                {flavorFreq.map((f, i) => {
                  const maxCount = flavorFreq[0].count;
                  const pct = (f.count / maxCount) * 100;
                  const color = i < 2 ? T.accent : T.primary;
                  return (
                    <div key={f.name} className="flex items-center gap-3">
                      <span
                        className="text-xs font-medium w-28 flex-shrink-0 text-right"
                        style={{ color: i < 2 ? T.accent : T.foreground }}
                      >
                        {f.name}
                      </span>
                      <div
                        className="flex-1 h-2 rounded-full overflow-hidden"
                        style={{ backgroundColor: T.muted }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className="text-xs w-6 text-right flex-shrink-0" style={{ color: T.mutedFg }}>
                        {f.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </ChartCard>
        </div>

      </section>
    </div>
  );
}

/* ------------------------------------------------------------------
   Tab navigation (shared layout pattern)
   ------------------------------------------------------------------ */
function TabNav() {
  return (
    <div className="flex border-b -mx-4 sm:-mx-6 px-4 sm:px-6" style={{ borderColor: "var(--border)" }}>
      <Link
        href="/humidor"
        className="px-1 pb-3 text-sm font-medium border-b-2 border-transparent mr-6 transition-colors duration-150"
        style={{ color: "var(--muted-foreground)" }}
      >
        Humidor
      </Link>
      <Link
        href="/humidor/wishlist"
        className="px-1 pb-3 text-sm font-medium border-b-2 border-transparent mr-6 transition-colors duration-150"
        style={{ color: "var(--muted-foreground)" }}
      >
        Wishlist
      </Link>
      <span
        className="px-1 pb-3 text-sm font-medium border-b-2"
        style={{ borderColor: "var(--primary)", color: "var(--foreground)" }}
      >
        Stats
      </span>
    </div>
  );
}
