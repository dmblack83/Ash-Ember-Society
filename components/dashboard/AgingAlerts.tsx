"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { DashboardSection, DashboardSkeleton } from "@/components/dashboard/dashboard-section";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface AgingItem {
  id:                string;
  aging_start_date:  string | null;
  aging_target_date: string;          // guaranteed non-null by query
  cigar: {
    brand:  string | null;
    series: string | null;
    name:   string;
  };
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

/** Days between today (00:00 local) and a YYYY-MM-DD date string. */
function daysUntil(dateStr: string): number {
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** How long a cigar has been aging, expressed as a readable string. */
function agingDuration(startDate: string | null): string | null {
  if (!startDate) return null;
  const days = Math.floor(
    (Date.now() - new Date(startDate).getTime()) / 86_400_000
  );
  if (days < 1)   return "Started today";
  if (days < 31)  return `Aging ${days} day${days !== 1 ? "s" : ""}`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `Aging ${months} month${months !== 1 ? "s" : ""}`;
  const years  = Math.floor(months / 12);
  const rem    = months % 12;
  return rem > 0
    ? `Aging ${years}y ${rem}mo`
    : `Aging ${years} year${years !== 1 ? "s" : ""}`;
}

/* ------------------------------------------------------------------
   Status label
   ------------------------------------------------------------------ */

function StatusLabel({ days }: { days: number }) {
  if (days < 0) {
    return (
      <span
        className="text-xs font-semibold flex-shrink-0"
        style={{ color: "rgba(239,68,68,0.85)" }}
      >
        Past Peak
      </span>
    );
  }
  if (days === 0) {
    return (
      <span
        className="text-xs font-semibold flex-shrink-0"
        style={{ color: "#4ade80" }}
      >
        Ready Today
      </span>
    );
  }
  return (
    <span
      className="text-xs font-semibold flex-shrink-0"
      style={{ color: "var(--gold)" }}
    >
      Ready in {days}d
    </span>
  );
}

/* ------------------------------------------------------------------
   Single aging row
   ------------------------------------------------------------------ */

function AgingRow({ item }: { item: AgingItem }) {
  const router   = useRouter();
  const days     = daysUntil(item.aging_target_date);
  const duration = agingDuration(item.aging_start_date);
  const display  = item.cigar.series ?? item.cigar.name;

  return (
    <button
      type="button"
      onClick={() => router.push(`/humidor/${item.id}`, { scroll: false })}
      className="w-full flex items-center justify-between gap-3 text-left transition-opacity active:opacity-70"
      style={{
        minHeight: 44,
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
        background: "none",
        border: "none",
        padding: "10px 0",
        cursor: "pointer",
      } as React.CSSProperties}
      aria-label={`${display} — ${days < 0 ? "past peak" : days === 0 ? "ready today" : `ready in ${days} days`}`}
    >
      {/* Left: name + aging duration */}
      <div className="flex flex-col gap-0.5 min-w-0">
        {item.cigar.brand && (
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground truncate">
            {item.cigar.brand}
          </p>
        )}
        <p className="text-sm font-semibold text-foreground truncate leading-snug">
          {display}
        </p>
        {duration && (
          <p className="text-xs text-muted-foreground">{duration}</p>
        )}
      </div>

      {/* Right: status */}
      <StatusLabel days={days} />
    </button>
  );
}

/* ------------------------------------------------------------------
   AgingAlerts — main export
   ------------------------------------------------------------------ */

export function AgingAlerts() {
  const [items,   setItems]   = useState<AgingItem[] | null>(null); // null = loading
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setItems([]); setLoading(false); return; }

        // today + 14 days, formatted as YYYY-MM-DD
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + 14);
        const cutoffStr = cutoff.toISOString().split("T")[0];

        const { data, error } = await supabase
          .from("humidor_items")
          .select(
            "id, aging_start_date, aging_target_date, " +
            "cigar:cigar_catalog(brand, series, name)"
          )
          .eq("user_id", user.id)
          .eq("is_wishlist", false)
          .not("aging_target_date", "is", null)
          .lte("aging_target_date", cutoffStr)
          .order("aging_target_date", { ascending: true });

        if (error) throw error;
        setItems((data as unknown as AgingItem[]) ?? []);
      } catch {
        setItems([]); // fail silently — treat as no alerts
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Still loading
  if (loading) {
    return (
      <DashboardSection title="Aging Alerts" sectionIndex={2}>
        <DashboardSkeleton height={100} />
      </DashboardSection>
    );
  }

  // No matching cigars — hide section entirely
  if (!items || items.length === 0) return null;

  return (
    <DashboardSection title="Aging Alerts" sectionIndex={2}>
      <div className="glass rounded-xl px-4 divide-y" style={{ borderColor: "var(--border)" }}>
        {/* "Ready to Smoke" sub-label */}
        <div className="py-2.5">
          <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "var(--muted-foreground)" }}>
            Ready to Smoke
          </p>
        </div>

        {items.map((item, i) => (
          <div key={item.id} className={i < items.length - 1 ? "" : ""}>
            <AgingRow item={item} />
          </div>
        ))}
      </div>
    </DashboardSection>
  );
}
