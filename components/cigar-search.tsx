"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";

/* ------------------------------------------------------------------
   Shared type — used by AddCigarSheet, Wishlist, and Discover
   ------------------------------------------------------------------ */

export interface CatalogResult {
  id:              string;
  brand:           string | null;
  series:          string | null;
  format:          string | null;
  ring_gauge:      number | null;
  length_inches:   number | null;
  wrapper:         string | null;
  wrapper_country: string | null;
  shade:           string | null;
  usage_count:     number;
  image_url:       string | null;
}

const CATALOG_SELECT =
  "id, brand, series, format, ring_gauge, length_inches, wrapper, wrapper_country, shade, usage_count, image_url";

/* ------------------------------------------------------------------
   Gold-highlight matched text
   ------------------------------------------------------------------ */

export function Highlight({ text, query }: { text: string; query: string }) {
  if (!text || !query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts   = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <span key={i} style={{ color: "var(--gold)", fontWeight: 600 }}>
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}

/* ------------------------------------------------------------------
   CigarSearch
   Self-contained search input + dropdown. Fires onSelect(result)
   when user picks. onManual() fires when user clicks "Add manually".
   ------------------------------------------------------------------ */

export interface CigarSearchProps {
  onSelect:    (result: CatalogResult) => void;
  onManual?:   () => void;
  placeholder?: string;
  autoFocus?:   boolean;
}

export function CigarSearch({
  onSelect,
  onManual,
  placeholder = "Search cigars…",
  autoFocus,
}: CigarSearchProps) {
  const [query,        setQuery]        = useState("");
  const [results,      setResults]      = useState<CatalogResult[]>([]);
  const [searching,    setSearching]    = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isPopular,    setIsPopular]    = useState(true);

  const inputRef    = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function loadPopular() {
    const supabase = createClient();
    supabase
      .from("cigar_catalog")
      .select(CATALOG_SELECT)
      .order("usage_count", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setResults(data ?? []);
        setIsPopular(true);
        setShowDropdown(true);
      });
  }

  /* Load popular on mount */
  useEffect(() => {
    loadPopular();
    if (autoFocus) setTimeout(() => inputRef.current?.focus(), 120);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doSearch = useCallback(async (q: string) => {
    setSearching(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("cigar_catalog")
      .select(CATALOG_SELECT)
      .or(`brand.ilike.%${q}%,series.ilike.%${q}%,format.ilike.%${q}%`)
      .limit(8);
    setResults(data ?? []);
    setIsPopular(false);
    setShowDropdown(true);
    setSearching(false);
  }, []);

  /* Re-fetch when query changes */
  useEffect(() => {
    if (!query.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      loadPopular();
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query.trim()), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  /* Dismiss when clicking outside */
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function handleSelect(r: CatalogResult) {
    setShowDropdown(false);
    setQuery("");
    onSelect(r);
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Search input */}
      <div className="relative">
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 flex-shrink-0 pointer-events-none"
          style={{ color: "var(--muted-foreground)" }}
          width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true"
        >
          <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M12 12l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          placeholder={placeholder}
          className="input w-full pl-11 pr-4 text-base"
          style={{ minHeight: 52 }}
          autoComplete="off"
        />
        {searching && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2">
            <span
              className="rounded-full border animate-spin block"
              style={{
                width: 16, height: 16,
                borderColor: "rgba(193,120,23,0.3)",
                borderTopColor: "var(--primary)",
              }}
            />
          </span>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div
          className="absolute left-0 right-0 z-10 mt-2 rounded-2xl overflow-hidden glass animate-fade-in"
          style={{ border: "1px solid var(--border)" }}
        >
          {results.length === 0 ? (
            <div className="px-4 py-5 space-y-3 text-center">
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                No results for &ldquo;{query}&rdquo;
              </p>
              {onManual && (
                <button
                  onClick={onManual}
                  className="w-full text-sm font-semibold rounded-xl transition-colors"
                  style={{
                    minHeight: 44,
                    color: "var(--primary)",
                    backgroundColor: "rgba(193,120,23,0.10)",
                  }}
                >
                  Can&apos;t find it? Add manually
                </button>
              )}
            </div>
          ) : (
            <>
              {isPopular && (
                <div
                  className="px-4 py-2"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <span
                    className="text-[10px] font-bold tracking-widest uppercase"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Popular Cigars
                  </span>
                </div>
              )}
              {results.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => handleSelect(r)}
                  className="w-full text-left px-4 flex flex-col justify-center transition-colors active:opacity-70"
                  style={{
                    minHeight: 56,
                    borderBottom:
                      i < results.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <span className="text-sm font-semibold text-foreground leading-snug">
                    <Highlight text={r.brand ?? ""} query={query} />
                    {r.series && (
                      <span className="font-normal text-muted-foreground">
                        {" · "}
                        <Highlight text={r.series} query={query} />
                      </span>
                    )}
                  </span>
                  {(r.format || r.wrapper || r.ring_gauge) && (
                    <span
                      className="text-xs mt-0.5"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {[
                        r.format,
                        r.wrapper,
                        r.ring_gauge    ? `${r.ring_gauge} ring` : null,
                        r.length_inches ? `${r.length_inches}"`  : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </button>
              ))}
              {onManual && (
                <button
                  onClick={onManual}
                  className="w-full text-sm text-center transition-colors active:opacity-70"
                  style={{
                    minHeight: 48,
                    color: "var(--muted-foreground)",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  Can&apos;t find it? Add manually
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
