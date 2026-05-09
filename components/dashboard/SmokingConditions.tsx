"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

type Suitability = "perfect" | "good" | "fair" | "indoors";

interface WeatherApiResponse {
  temp:        number;
  humidity:    number;
  wind:        number;
  code:        number;
  city:        string;
  suitability: Suitability;
  label:       string;
}

/* ------------------------------------------------------------------
   Verdict pill — color + label per suitability
   ------------------------------------------------------------------ */

const VERDICT: Record<
  Suitability,
  { label: string; color: string }
> = {
  perfect: { label: "Favorable", color: "var(--moss)"  },
  good:    { label: "Favorable", color: "var(--moss)"  },
  fair:    { label: "Fair",      color: "var(--gold)"  },
  indoors: { label: "Poor",      color: "var(--ember)" },
};

/* ------------------------------------------------------------------
   ConditionsStrip — the data ribbon

   Hairline borders top + bottom, faint gold gradient. City and
   verdict pill sit on a single row that doubles as a collapse toggle.
   The 3-column metric grid (Temp · Humidity · Wind) is hidden by
   default and animates in when expanded.
   ------------------------------------------------------------------ */

function ConditionsStrip({ weather }: { weather: WeatherApiResponse }) {
  const v = VERDICT[weather.suitability];
  const [expanded, setExpanded] = useState(false);

  return (
    <section
      style={{
        border:       "1px solid var(--card-border)",
        borderRadius: 6,
        background:   "var(--card-bg)",
        boxShadow:    "var(--card-edge)",
        padding:      "14px 14px 12px",
      }}
      aria-label="Smoking conditions"
    >
      {/* Eyebrow with leading rule */}
      <div
        style={{
          fontFamily:    "var(--font-mono)",
          fontSize:      10,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          color:         "var(--paper-mute)",
          display:       "flex",
          alignItems:    "center",
          gap:           10,
          marginBottom:  10,
        }}
      >
        <span aria-hidden="true" style={{ width: 18, height: 1, background: "var(--gold)" }} />
        Smoking Conditions
      </div>

      {/* City + verdict header — also toggles expansion */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls="smoking-conditions-metrics"
        style={{
          width:                   "100%",
          display:                 "flex",
          justifyContent:          "space-between",
          alignItems:              "baseline",
          gap:                     12,
          background:              "none",
          border:                  "none",
          padding:                 "4px 0",
          cursor:                  "pointer",
          textAlign:               "left",
          touchAction:             "manipulation",
          WebkitTapHighlightColor: "transparent",
          minHeight:               44,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontSize:   18,
            color:      "var(--foreground)",
            whiteSpace: "nowrap",
            overflow:   "hidden",
            textOverflow: "ellipsis",
            minWidth:   0,
          }}
        >
          {weather.city}
        </span>

        <span
          style={{
            display:       "inline-flex",
            alignItems:    "center",
            gap:           6,
            fontFamily:    "var(--font-mono)",
            fontSize:      10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color:         v.color,
            flexShrink:    0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width:        6,
              height:       6,
              borderRadius: "50%",
              background:   "currentColor",
              boxShadow:    "0 0 8px currentColor",
            }}
          />
          {v.label}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden="true"
            style={{
              marginLeft: 2,
              transition: "transform 0.25s ease",
              transform:  expanded ? "rotate(0deg)" : "rotate(-90deg)",
              color:      "var(--gold)",
            }}
          >
            <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {/* 3-column metric grid (collapsible) */}
      <div
        id="smoking-conditions-metrics"
        style={{
          maxHeight:  expanded ? 200 : 0,
          opacity:    expanded ? 1 : 0,
          overflow:   "hidden",
          transition: "max-height 280ms ease, opacity 200ms ease, margin-top 200ms ease, padding-top 200ms ease",
          marginTop:  expanded ? 12 : 0,
          paddingTop: expanded ? 14 : 0,
          borderTop:  expanded ? "1px dashed var(--line-soft)" : "1px dashed transparent",
        }}
      >
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
          }}
        >
          <Metric label="Temp"     value={weather.temp}     unit="°"   />
          <Metric label="Humidity" value={weather.humidity} unit="%"   border />
          <Metric label="Wind"     value={weather.wind}     unit="mph" />
        </div>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  unit,
  border = false,
}: {
  label:   string;
  value:   number;
  unit:    string;
  border?: boolean;
}) {
  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        gap:            4,
        padding:        "0 10px",
        borderLeft:     border ? "1px solid var(--line-soft)" : undefined,
        borderRight:    border ? "1px solid var(--line-soft)" : undefined,
        textAlign:      "center",
      }}
    >
      <span
        style={{
          fontFamily:    "var(--font-serif)",
          fontWeight:    500,
          fontSize:      24,
          lineHeight:    1,
          color:         "var(--foreground)",
        }}
      >
        {value}
        <sup
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   9,
            color:      "var(--paper-dim)",
            fontWeight: 400,
            marginLeft: 1,
            verticalAlign: "super",
          }}
        >
          {unit}
        </sup>
      </span>
      <span
        style={{
          fontFamily:    "var(--font-mono)",
          fontSize:      9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color:         "var(--paper-dim)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------
   Loading skeleton — keeps the strip's footprint while data loads
   ------------------------------------------------------------------ */

function StripSkeleton() {
  return (
    <div
      aria-hidden="true"
      style={{
        borderTop:    "1px solid var(--line)",
        borderBottom: "1px solid var(--line)",
        height:       72,
        opacity:      0.5,
      }}
    />
  );
}

/* ------------------------------------------------------------------
   No-location prompt
   ------------------------------------------------------------------ */

function NoLocation() {
  return (
    <div
      style={{
        borderTop:    "1px solid var(--line)",
        borderBottom: "1px solid var(--line)",
        padding:      "18px 14px",
      }}
    >
      <p
        style={{
          fontSize:   13,
          color:      "var(--paper-mute)",
          lineHeight: 1.5,
          margin:     0,
        }}
      >
        Set your location in{" "}
        <Link
          href="/account"
          style={{ color: "var(--gold)", textDecoration: "underline", textUnderlineOffset: 2 }}
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

   Prefers ZIP (resolves to neighborhood-level coords + station obs);
   falls back to city geocoding (city centroid + model output).
   Single fetch to /api/weather, server-side with edge caching.
   ------------------------------------------------------------------ */

export function SmokingConditions({
  zip,
  city,
}: {
  zip:  string | null;
  city: string | null;
}) {
  const trimmedZip  = zip?.trim()  || null;
  const trimmedCity = city?.trim() || null;
  const hasLocation = !!(trimmedZip || trimmedCity);

  const [weather,  setWeather]  = useState<WeatherApiResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading,  setLoading]  = useState(hasLocation);

  useEffect(() => {
    if (!hasLocation) return;

    let cancelled = false;

    async function load() {
      const params = new URLSearchParams();
      if (trimmedZip)  params.set("zip",  trimmedZip);
      if (trimmedCity) params.set("city", trimmedCity);

      try {
        const res = await fetch(`/api/weather?${params.toString()}`);
        if (cancelled) return;

        if (res.status === 404) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        if (!res.ok) { setLoading(false); return; }

        const data: WeatherApiResponse = await res.json();
        if (!cancelled) {
          setWeather(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [trimmedZip, trimmedCity, hasLocation]);

  if (!loading && !weather && !notFound && hasLocation) return null;

  if (loading)                return <StripSkeleton />;
  if (!hasLocation || notFound) return <NoLocation />;
  if (weather)                return <ConditionsStrip weather={weather} />;
  return null;
}
