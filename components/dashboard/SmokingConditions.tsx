"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { DashboardSection, DashboardSkeleton } from "@/components/dashboard/dashboard-section";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface WeatherData {
  tempF:     number;
  humidity:  number;
  windMph:   number;
  code:      number;
  city:      string;
}

type Suitability = "perfect" | "good" | "fair" | "indoors";

const CACHE_MS = 30 * 60 * 1000; // 30 minutes

/* ------------------------------------------------------------------
   Suitability logic
   ------------------------------------------------------------------ */

function getSuitability(w: WeatherData): Suitability {
  const { tempF, humidity, windMph } = w;

  // Smoke Indoors — extreme conditions
  if (humidity > 85 || humidity < 40 || windMph > 20 || tempF < 40 || tempF > 95) {
    return "indoors";
  }
  // Perfect
  if (humidity >= 65 && humidity <= 72 && tempF >= 65 && tempF <= 80 && windMph < 10) {
    return "perfect";
  }
  // Good
  if (humidity >= 55 && humidity <= 80 && tempF >= 55 && tempF <= 85 && windMph < 15) {
    return "good";
  }
  return "fair";
}

const SUITABILITY_CONFIG: Record<
  Suitability,
  { label: string; bg: string; color: string; border: string }
> = {
  perfect: {
    label:  "Perfect",
    bg:     "rgba(34,197,94,0.15)",
    color:  "#4ade80",
    border: "rgba(34,197,94,0.3)",
  },
  good: {
    label:  "Good",
    bg:     "rgba(212,160,74,0.15)",
    color:  "var(--gold)",
    border: "rgba(212,160,74,0.3)",
  },
  fair: {
    label:  "Fair",
    bg:     "rgba(251,146,60,0.15)",
    color:  "#fb923c",
    border: "rgba(251,146,60,0.3)",
  },
  indoors: {
    label:  "Smoke Indoors",
    bg:     "rgba(239,68,68,0.15)",
    color:  "#f87171",
    border: "rgba(239,68,68,0.3)",
  },
};

/* ------------------------------------------------------------------
   Weather code → icon
   WMO codes: 0=clear, 1-3=partly cloudy, 45-48=fog,
   51-67=drizzle/rain, 71-77=snow, 80-82=showers, 95-99=thunder
   ------------------------------------------------------------------ */

function WeatherIcon({ code, size = 24 }: { code: number; size?: number }) {
  // Thunderstorm
  if (code >= 95) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 17.5A5 5 0 0015 8h-1.26A8 8 0 102 16.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M13 12l-4 7h5l-4 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  // Snow
  if (code >= 71 && code <= 77) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 17.5A5 5 0 0015 8h-1.26A8 8 0 102 16.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M8 19h.01M12 21h.01M16 19h.01M10 23h.01M14 23h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    );
  }
  // Rain / drizzle / showers
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 17.5A5 5 0 0015 8h-1.26A8 8 0 102 16.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M8 19l-1 4M12 19l-1 4M16 19l-1 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  }
  // Fog
  if (code >= 45 && code <= 48) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 8h18M3 12h18M5 16h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  }
  // Partly cloudy
  if (code >= 1 && code <= 3) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="9" r="4" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M17.5 16.5A4 4 0 0013.5 10h-.74A6 6 0 103 15.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  }
  // Clear / sunny (code 0)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

/* ------------------------------------------------------------------
   Stat cell
   ------------------------------------------------------------------ */

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 flex-1">
      <span
        className="text-lg font-bold leading-none text-foreground"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------
   Weather card
   ------------------------------------------------------------------ */

function WeatherCard({ weather }: { weather: WeatherData }) {
  const suit   = getSuitability(weather);
  const config = SUITABILITY_CONFIG[suit];

  return (
    <div
      className="glass rounded-xl p-4 flex flex-col gap-3"
      aria-label="Smoking conditions card"
    >
      {/* Top row: city + icon + suitability badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-muted-foreground">
            <WeatherIcon code={weather.code} size={22} />
          </span>
          <span className="text-sm font-medium text-foreground truncate">
            {weather.city}
          </span>
        </div>
        <span
          className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
          style={{
            backgroundColor: config.bg,
            color:            config.color,
            border:           `1px solid ${config.border}`,
          }}
        >
          {config.label}
        </span>
      </div>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: "var(--border)" }} />

      {/* Stat row */}
      <div className="flex items-stretch">
        <StatCell value={`${Math.round(weather.tempF)}°F`} label="Temp" />
        <div style={{ width: 1, backgroundColor: "var(--border)" }} />
        <StatCell value={`${Math.round(weather.humidity)}%`} label="Humidity" />
        <div style={{ width: 1, backgroundColor: "var(--border)" }} />
        <StatCell value={`${Math.round(weather.windMph)} mph`} label="Wind" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   No-location prompt
   ------------------------------------------------------------------ */

function NoLocation() {
  return (
    <div
      className="glass rounded-xl px-4 py-5 flex items-start gap-3"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
        className="flex-shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true">
        <circle cx="9" cy="7.5" r="3" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M9 1.5C5.96 1.5 3.5 3.96 3.5 7c0 4.5 5.5 9.5 5.5 9.5S14.5 11.5 14.5 7c0-3.04-2.46-5.5-5.5-5.5z"
          stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      </svg>
      <p className="text-sm text-muted-foreground leading-snug">
        Set your location in{" "}
        <Link
          href="/account"
          className="font-medium underline underline-offset-2"
          style={{ color: "var(--primary)" }}
        >
          Account settings
        </Link>{" "}
        to see local smoking conditions.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------
   SmokingConditions — main export
   ------------------------------------------------------------------ */

export function SmokingConditions() {
  const [weather,  setWeather]  = useState<WeatherData | null>(null);
  const [noCity,   setNoCity]   = useState(false);
  const [loading,  setLoading]  = useState(true);

  // Cache: [data, fetchedAt ms]
  const cache = useRef<{ data: WeatherData; at: number } | null>(null);

  useEffect(() => {
    async function load() {
      // Return cached result if still fresh
      if (cache.current && Date.now() - cache.current.at < CACHE_MS) {
        setWeather(cache.current.data);
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const { data: profile } = await supabase
          .from("profiles")
          .select("city")
          .eq("id", user.id)
          .single();

        const city = profile?.city?.trim();
        if (!city) {
          setNoCity(true);
          setLoading(false);
          return;
        }

        // 1. Geocoding
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
        );
        if (!geoRes.ok) { setLoading(false); return; }

        const geoJson = await geoRes.json();
        const loc     = geoJson?.results?.[0];
        if (!loc) { setNoCity(true); setLoading(false); return; }

        // 2. Weather
        const wxRes = await fetch(
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${loc.latitude}&longitude=${loc.longitude}` +
          `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weathercode` +
          `&temperature_unit=fahrenheit&wind_speed_unit=mph`
        );
        if (!wxRes.ok) { setLoading(false); return; }

        const wxJson  = await wxRes.json();
        const current = wxJson?.current;
        if (!current) { setLoading(false); return; }

        const result: WeatherData = {
          tempF:    current.temperature_2m,
          humidity: current.relative_humidity_2m,
          windMph:  current.wind_speed_10m,
          code:     current.weathercode,
          city:     loc.name,
        };

        cache.current = { data: result, at: Date.now() };
        setWeather(result);
      } catch {
        // Fail silently — section simply doesn't render
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Hide section entirely on silent API failure
  if (!loading && !weather && !noCity) return null;

  return (
    <DashboardSection title="Smoking Conditions" sectionIndex={1}>
      {loading ? (
        <DashboardSkeleton height={110} />
      ) : noCity ? (
        <NoLocation />
      ) : weather ? (
        <WeatherCard weather={weather} />
      ) : null}
    </DashboardSection>
  );
}
