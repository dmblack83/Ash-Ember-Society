"use client";

import { useState, useEffect } from "react";

/* ------------------------------------------------------------------
   AgingTargetSelect — preset dropdown for aging_target_date.

   Props
   ─────
   value        Current date string (YYYY-MM-DD) or "" for unset.
   onChange     Called with a YYYY-MM-DD string whenever the
                effective date changes (preset selected or custom
                date picker changed).
   defaultPreset  Which preset to select when value is "" (new items).
                  Defaults to "2_weeks".
   ------------------------------------------------------------------ */

export type AgingPreset =
  | "ready_now"
  | "2_weeks"
  | "1_month"
  | "3_months"
  | "6_months"
  | "1_year"
  | "custom";

interface PresetOption {
  value: AgingPreset;
  label: string;
  days:  number | null; // null = custom
}

export const AGING_PRESETS: PresetOption[] = [
  { value: "ready_now", label: "Ready Now",             days: 0   },
  { value: "2_weeks",   label: "2 Weeks (Acclimating)", days: 14  },
  { value: "1_month",   label: "1 Month",               days: 30  },
  { value: "3_months",  label: "3 Months",              days: 90  },
  { value: "6_months",  label: "6 Months",              days: 180 },
  { value: "1_year",    label: "1 Year",                days: 365 },
  { value: "custom",    label: "Custom",                days: null },
];

/* Returns today's date as YYYY-MM-DD in local time. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* Adds `days` to today, returns YYYY-MM-DD. */
function offsetDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Given a stored YYYY-MM-DD string, returns the matching preset key
 * (within ±1 day tolerance) or "custom" if no preset matches.
 */
export function dateToPreset(dateStr: string): AgingPreset {
  if (!dateStr) return "2_weeks";
  const stored = new Date(dateStr + "T00:00:00").getTime();
  const todayMs = new Date(today() + "T00:00:00").getTime();
  const diffDays = Math.round((stored - todayMs) / 86_400_000);

  for (const preset of AGING_PRESETS) {
    if (preset.days === null) continue;
    if (Math.abs(diffDays - preset.days) <= 1) return preset.value;
  }
  return "custom";
}

/* ------------------------------------------------------------------
   Component
   ------------------------------------------------------------------ */

export function AgingTargetSelect({
  value,
  onChange,
  defaultPreset = "2_weeks",
}: {
  value: string;
  onChange: (date: string) => void;
  defaultPreset?: AgingPreset;
}) {
  /* Determine initial preset from the incoming value */
  const [preset,     setPreset]     = useState<AgingPreset>(() =>
    value ? dateToPreset(value) : defaultPreset
  );
  const [customDate, setCustomDate] = useState<string>(
    value && dateToPreset(value) === "custom" ? value : ""
  );

  /* When the parent resets value to "" (sheet closed/reopened),
     snap back to the default preset. */
  useEffect(() => {
    if (!value) {
      setPreset(defaultPreset);
      setCustomDate("");
      // Emit the default preset date upward so the parent has a value
      const def = AGING_PRESETS.find((p) => p.value === defaultPreset);
      if (def && def.days !== null) onChange(offsetDate(def.days));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handlePresetChange(next: AgingPreset) {
    setPreset(next);
    if (next === "custom") {
      // Keep whatever is in customDate (or today if blank)
      onChange(customDate || today());
    } else {
      const opt = AGING_PRESETS.find((p) => p.value === next)!;
      onChange(offsetDate(opt.days!));
    }
  }

  function handleCustomDateChange(d: string) {
    setCustomDate(d);
    onChange(d);
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        className="input w-full"
        value={preset}
        onChange={(e) => handlePresetChange(e.target.value as AgingPreset)}
        style={{ minHeight: 44 }}
        aria-label="Ready to smoke by"
      >
        {AGING_PRESETS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {preset === "custom" && (
        <input
          type="date"
          className="input w-full"
          value={customDate}
          onChange={(e) => handleCustomDateChange(e.target.value)}
          style={{ minHeight: 44 }}
          aria-label="Custom ready-to-smoke date"
        />
      )}
    </div>
  );
}
