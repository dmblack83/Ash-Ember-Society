"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetchCatalogBrands, fetchSeriesForBrand } from "@/lib/data/cigar-fetchers";
import { keyFor } from "@/lib/data/keys";

/* ------------------------------------------------------------------
   useBrandSeriesSuggestions

   Datalist suggestions for CigarDetailFields' Brand/Series inputs.
   Brand options load once per session (cached under keyFor.catalogBrands,
   shared with the catalog landing's brand index). Series options refetch
   per brand, debounced so each keystroke doesn't fire a query. Picking a
   suggestion inserts the exact canonical string; typing a brand-new value
   stays possible either way.

   Fetch errors degrade to empty option lists — inputs remain plain text
   fields, never blocked.
   ------------------------------------------------------------------ */

const SERIES_DEBOUNCE_MS = 300;

export interface BrandSeriesSuggestions {
  brandOptions:  string[];
  seriesOptions: string[];
}

export function useBrandSeriesSuggestions(brand: string): BrandSeriesSuggestions {
  const [debouncedBrand, setDebouncedBrand] = useState(brand.trim());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedBrand(brand.trim()), SERIES_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [brand]);

  const { data: brands } = useSWR(
    keyFor.catalogBrands,
    fetchCatalogBrands,
    { shouldRetryOnError: false },
  );

  const { data: series } = useSWR(
    debouncedBrand ? keyFor.seriesForBrand(debouncedBrand) : null,
    () => fetchSeriesForBrand(debouncedBrand),
    { shouldRetryOnError: false },
  );

  return {
    brandOptions:  (brands ?? []).map((b) => b.brand),
    seriesOptions: series ?? [],
  };
}
