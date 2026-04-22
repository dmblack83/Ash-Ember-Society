"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
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
  primary:     "#C17817",
  accent:      "#D4A04A",
  destructive: "#C44536",
  secondary:   "#3D2E23",
  muted:       "#2D221B",
  border:      "#3D2E23",
  foreground:  "#F5E6D3",
  mutedFg:     "#A69080",
  card:        "#241C17",
  sageGreen:   "#3A6B45",
  mutedAmber:  "#8B6020",
};

const BUCKET_COLORS = [T.destructive, "#9A3B2A", T.mutedAmber, T.sageGreen, T.accent];

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

export interface MonthlyBar   { month: string; count: number; isCurrent: boolean }
export interface StrengthSlice { name: string; value: number; color: string }
export interface RatingBucket  { label: string; count: number; color: string }
export interface FlavorPoint   { name: string; count: number }
export interface BrandPoint    { brand: string; count: number }

export interface StatsClientData {
  totalCigars:             number;
  totalReports:            number;
  avgRating:               string | null;
  lifetimeInvestmentCents: number;
  collectionValueCents:    number;
  hasEnough:               boolean;
  monthlyBars:             MonthlyBar[];
  strengthDist:            StrengthSlice[];
  ratingBuckets:           RatingBucket[];
  flavorFreq:              FlavorPoint[];
  topBrands:               BrandPoint[];
}

/* ------------------------------------------------------------------
   Shared chart tooltip
   ------------------------------------------------------------------ */
function ChartTip({
  active,
  payload,
  label,
}: {
  active?:  boolean;
  payload?: { value: number; name?: string }[];
  label?:   string;
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
    <p className="text-center py-10 text-sm" style={{ fontFamily: "var(--font-serif)", color: T.mutedFg }}>
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
      <div className="flex items-baseline gap-1.5 leading-none">
        <p className="text-3xl font-bold" style={{ fontFamily: "var(--font-serif)", color: T.accent }}>
          {value}
        </p>
        {sub && <p className="text-xs" style={{ color: T.accent }}>{sub}</p>}
      </div>
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
   StatsClient
   ------------------------------------------------------------------ */
export function StatsClient({ data }: { data: StatsClientData }) {
  const {
    totalCigars,
    totalReports,
    avgRating,
    lifetimeInvestmentCents,
    collectionValueCents,
    hasEnough,
    monthlyBars,
    strengthDist,
    ratingBuckets,
    flavorFreq,
    topBrands,
  } = data;

  const headerRef                       = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setHeaderHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fmtMoney = (cents: number) =>
    cents > 0
      ? `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
      : "\u2014";

  return (
    <>
      {/* ── Fixed header ─────────────────────────────────────────── */}
      <div
        ref={headerRef}
        style={{
          position:        "fixed",
          top:             0,
          left:            0,
          right:           0,
          zIndex:          30,
          backgroundColor: "var(--background)",
          borderBottom:    "1px solid var(--border)",
          paddingTop:      "env(safe-area-inset-top)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex border-b border-border/50">
            <Link
              href="/humidor"
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors duration-150 mr-6"
            >
              Humidor
            </Link>
            <Link
              href="/humidor/wishlist"
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors duration-150 mr-6"
            >
              Wishlist
            </Link>
            <Link
              href="/humidor/burn-reports"
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors duration-150 mr-6"
            >
              Burn Reports
            </Link>
            <span
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2"
              style={{ borderColor: "var(--ember, #E8642C)", color: "var(--foreground)" }}
            >
              Stats
            </span>
          </div>
        </div>
      </div>

      {/* Spacer */}
      <div style={{ height: headerHeight }} aria-hidden="true" />

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fade-in">

        {/* ── Overview cards ─────────────────────────────────────── */}
        <section>
          <h2 className="sr-only">Overview</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 sm:-mx-6 px-4 sm:px-6 sm:grid sm:grid-cols-5">
            <StatCard label="Cigars in Humidor"    value={totalCigars.toString()} />
            <StatCard label="Burn Reports"         value={totalReports.toString()} />
            <StatCard
              label="Average Rating"
              value={avgRating ?? "\u2014"}
              sub={avgRating ? "/ 100" : undefined}
            />
            <StatCard label="Collection Value"     value={fmtMoney(collectionValueCents)} />
            <StatCard label="Lifetime Investment"  value={fmtMoney(lifetimeInvestmentCents)} />
          </div>
        </section>

        <Divider />

        {/* ── Charts ─────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          <ChartCard title="Burn Reports Over Time">
            {!hasEnough ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyBars} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fill: T.mutedFg, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: T.mutedFg, fontSize: 11 }} axisLine={false} tickLine={false} />
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

          <ChartCard title="Top Brands">
            {topBrands.length === 0 ? <EmptyChart /> : (
              <div className="space-y-3">
                {topBrands.map((b, i) => {
                  const maxCount = topBrands[0].count;
                  const pct      = (b.count / maxCount) * 100;
                  const color    = i === 0 ? T.accent : T.primary;
                  return (
                    <div key={b.brand} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span style={{ color: T.foreground, fontWeight: i === 0 ? 600 : 400 }}>{b.brand}</span>
                        <span style={{ color: T.mutedFg }}>{b.count}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: T.muted }}>
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Strength Distribution">
            {!hasEnough || strengthDist.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={strengthDist}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80}
                    paddingAngle={3}
                    dataKey="value" nameKey="name"
                    stroke="none"
                  >
                    {strengthDist.map((entry, i) => <Cell key={i} fill={entry.color} />)}
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
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: T.mutedFg, paddingTop: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Rating Distribution">
            {!hasEnough ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={ratingBuckets} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fill: T.mutedFg, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: T.mutedFg, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {ratingBuckets.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <div className="sm:col-span-2">
            <ChartCard title="Favorite Flavors">
              {flavorFreq.length === 0 ? <EmptyChart /> : (
                <div className="space-y-3">
                  {flavorFreq.map((f, i) => {
                    const maxCount = flavorFreq[0].count;
                    const pct      = (f.count / maxCount) * 100;
                    const color    = i < 2 ? T.accent : T.primary;
                    return (
                      <div key={f.name} className="flex items-center gap-3">
                        <span className="text-xs font-medium w-28 flex-shrink-0 text-right" style={{ color: i < 2 ? T.accent : T.foreground }}>
                          {f.name}
                        </span>
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: T.muted }}>
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                        <span className="text-xs w-6 text-right flex-shrink-0" style={{ color: T.mutedFg }}>{f.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </ChartCard>
          </div>

        </section>
      </div>
    </>
  );
}
