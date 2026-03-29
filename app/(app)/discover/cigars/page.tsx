"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface Cigar {
  id: string;
  brand: string;
  line: string;
  name: string;
  vitola: string;
  strength: string;
  wrapper: string;
  country: string;
  image_url: string | null;
  avg_rating: number | null;
  total_ratings: number | null;
}

/* ------------------------------------------------------------------
   Constants
   ------------------------------------------------------------------ */

/* Strength options: value = DB enum, label = display text */
const STRENGTH_OPTIONS = [
  { value: "mild",        label: "Mild" },
  { value: "mild_medium", label: "Mild-Medium" },
  { value: "medium",      label: "Medium" },
  { value: "medium_full", label: "Medium-Full" },
  { value: "full",        label: "Full" },
] as const;

type StrengthValue = typeof STRENGTH_OPTIONS[number]["value"];

const PAGE_SIZE = 20;

/* ------------------------------------------------------------------
   Strength badge — muted, sophisticated, not neon
   ------------------------------------------------------------------ */

const STRENGTH_LABEL: Record<string, string> = {
  mild:         "Mild",
  mild_medium:  "Mild-Medium",
  medium:       "Medium",
  medium_full:  "Medium-Full",
  full:         "Full",
};

function strengthStyle(s: string): { backgroundColor: string; color: string } {
  const map: Record<string, { backgroundColor: string; color: string }> = {
    mild:         { backgroundColor: "#1E3A2A", color: "#5A9A72" },
    mild_medium:  { backgroundColor: "#2A2A1A", color: "#8A8A42" },
    medium:       { backgroundColor: "var(--secondary)", color: "#C17817" },
    medium_full:  { backgroundColor: "#2A1A0A", color: "#C17817" },
    full:         { backgroundColor: "#2A1010", color: "#C44536" },
  };
  return (
    map[s] ?? {
      backgroundColor: "var(--muted)",
      color: "var(--muted-foreground)",
    }
  );
}

/* ------------------------------------------------------------------
   Sub-components
   ------------------------------------------------------------------ */

function CigarPlaceholder() {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <svg
        width="96"
        height="28"
        viewBox="0 0 96 28"
        fill="none"
        aria-hidden="true"
        className="text-muted-foreground/30"
      >
        {/* Body */}
        <rect x="8" y="9" width="68" height="10" rx="5" fill="currentColor" />
        {/* Rounded cap */}
        <ellipse cx="76" cy="14" rx="12" ry="6" fill="currentColor" opacity="0.65" />
        {/* Cut foot */}
        <rect x="4" y="9" width="6" height="10" rx="2" fill="currentColor" opacity="0.45" />
        {/* Band */}
        <rect x="26" y="9" width="11" height="10" rx="1" fill="currentColor" opacity="0.22" />
        {/* Ember */}
        <ellipse cx="5" cy="14" rx="3.5" ry="3.5" fill="#E8642C" opacity="0.4" />
      </svg>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="card animate-pulse flex flex-col gap-3">
      <div className="w-full aspect-[16/9] rounded-lg bg-muted" />
      <div className="flex flex-col gap-2">
        <div className="h-2.5 bg-muted rounded w-1/3" />
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-2.5 bg-muted rounded w-1/4" />
        <div className="flex gap-2 mt-1">
          <div className="h-4 bg-muted rounded-full w-20" />
          <div className="h-3 bg-muted rounded w-24 ml-auto self-center" />
        </div>
      </div>
    </div>
  );
}

function CigarCard({ cigar }: { cigar: Cigar }) {
  const badge = strengthStyle(cigar.strength);
  const subtitle =
    cigar.name && cigar.name !== cigar.line && cigar.name !== cigar.vitola
      ? `${cigar.line} — ${cigar.name}`
      : cigar.line;

  return (
    <Link href={`/discover/cigars/${cigar.id}`} className="group block h-full">
      <div className="card card-interactive h-full flex flex-col gap-3">
        {/* Image / placeholder */}
        <div className="w-full aspect-[16/9] rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
          {cigar.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cigar.image_url}
              alt={`${cigar.brand} ${cigar.line}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <CigarPlaceholder />
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground truncate">
            {cigar.brand}
          </p>
          <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
            {subtitle}
          </h3>
          <p className="text-xs text-muted-foreground">{cigar.vitola}</p>

          {/* Footer */}
          <div className="flex items-center gap-2 mt-auto pt-2 flex-wrap">
            <span
              className="badge text-[10px] px-2.5 py-0.5 rounded-full font-medium"
              style={badge}
            >
              {STRENGTH_LABEL[cigar.strength] ?? cigar.strength}
            </span>
            {cigar.avg_rating != null && (
              <span
                className="text-xs font-medium"
                style={{ color: "var(--gold)" }}
              >
                ★ {cigar.avg_rating.toFixed(1)}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground ml-auto truncate max-w-[130px]">
              {cigar.wrapper}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="text-muted-foreground/35">
        <svg
          width="56"
          height="56"
          viewBox="0 0 56 56"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="2.5" />
          <line
            x1="36"
            y1="36"
            x2="51"
            y2="51"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <rect
            x="16"
            y="21"
            width="16"
            height="6"
            rx="3"
            fill="currentColor"
            opacity="0.5"
          />
        </svg>
      </div>
      <div>
        <p className="text-base font-medium text-foreground">No cigars found</p>
        <p className="text-sm text-muted-foreground mt-1">
          Try adjusting your search or clearing some filters
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Page
   ------------------------------------------------------------------ */

export default function CigarsPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedStrengths, setSelectedStrengths] = useState<StrengthValue[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [cigars, setCigars] = useState<Cigar[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);

  /* 300 ms debounce */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  /* Fetch distinct countries on mount for filter chips */
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("cigars")
      .select("country")
      .then(({ data }) => {
        if (data) {
          const unique = [
            ...new Set(
              data.map((r) => r.country as string).filter(Boolean)
            ),
          ].sort();
          setCountries(unique);
        }
      });
  }, []);

  /* Core fetch — reset=true clears results and resets pagination */
  const fetchCigars = useCallback(
    async (reset: boolean) => {
      const supabase = createClient();
      const offset = reset ? 0 : offsetRef.current;

      if (reset) {
        setLoading(true);
        setCigars([]);
        offsetRef.current = 0;
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        let q = supabase
          .from("cigars")
          .select(
            "id, brand, line, name, vitola, strength, wrapper, country, image_url, avg_rating, total_ratings"
          )
          .range(offset, offset + PAGE_SIZE - 1)
          .order("brand")
          .order("line");

        if (debouncedQuery) {
          q = q.textSearch("search_vector", debouncedQuery, {
            type: "websearch",
          });
        }
        if (selectedStrengths.length > 0) {
          q = q.in("strength", selectedStrengths);
        }
        if (selectedCountries.length > 0) {
          q = q.in("country", selectedCountries);
        }

        const { data, error: fetchError } = await q;
        if (fetchError) throw fetchError;

        const results = data ?? [];
        setCigars((prev) => (reset ? results : [...prev, ...results]));
        offsetRef.current = offset + results.length;
        setHasMore(results.length === PAGE_SIZE);
      } catch (e) {
        console.error(e);
        setError("Failed to load cigars. Please try again.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQuery, selectedStrengths, selectedCountries]
  );

  /* Re-fetch whenever filters or debounced query change */
  useEffect(() => {
    fetchCigars(true);
  }, [fetchCigars]);

  function toggleStrength(s: StrengthValue) {
    setSelectedStrengths((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  function toggleCountry(c: string) {
    setSelectedCountries((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  const activeCount = selectedStrengths.length + selectedCountries.length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

      {/* Header */}
      <div className="space-y-1">
        <h1 style={{ fontFamily: "var(--font-serif)" }}>Discover Cigars</h1>
        <p className="text-sm text-muted-foreground">
          Browse our curated database of premium cigars
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          width="15"
          height="15"
          viewBox="0 0 15 15"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
          <line
            x1="10.5"
            y1="10.5"
            x2="14"
            y2="14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <input
          type="search"
          className="input pl-9"
          placeholder="Search brand, line, wrapper, country…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Filter chips */}
      <div className="space-y-3">
        {/* Strength filters */}
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium mb-2">
            Strength
          </p>
          <div className="flex flex-wrap gap-2">
            {STRENGTH_OPTIONS.map(({ value, label }) => {
              const active = selectedStrengths.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleStrength(value)}
                  className="badge cursor-pointer transition-all duration-150 text-xs px-3 py-1 hover:opacity-80"
                  style={
                    active
                      ? {
                          backgroundColor: "var(--primary)",
                          color: "var(--primary-foreground)",
                        }
                      : undefined
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Country filters — only rendered when countries are loaded */}
        {countries.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium mb-2">
              Country
            </p>
            <div className="flex flex-wrap gap-2">
              {countries.map((c) => {
                const active = selectedCountries.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCountry(c)}
                    className="badge cursor-pointer transition-all duration-150 text-xs px-3 py-1 hover:opacity-80"
                    style={
                      active
                        ? {
                            backgroundColor: "var(--primary)",
                            color: "var(--primary-foreground)",
                          }
                        : undefined
                    }
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Clear filters */}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setSelectedStrengths([]);
              setSelectedCountries([]);
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 underline underline-offset-2"
          >
            Clear {activeCount} filter{activeCount !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fetchCigars(true)}
          >
            Try again
          </button>
        </div>
      ) : cigars.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cigars.map((c) => (
              <CigarCard key={c.id} cigar={c} />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-4 pb-8">
              <button
                type="button"
                className="btn btn-secondary min-w-[120px]"
                onClick={() => fetchCigars(false)}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
