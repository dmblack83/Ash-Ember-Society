-- Multi-word cigar search: one lowercased, concatenated search column.
-- Generated + STORED so it auto-updates on insert/update with no trigger.
-- All expression parts (lower, concat_ws, ::text) are immutable.

alter table cigar_catalog
  add column if not exists search_text text
  generated always as (
    lower(concat_ws(' ',
      brand, series, format, wrapper, wrapper_country, shade,
      ring_gauge::text, length_inches::text))
  ) stored;

-- Trigram index keeps `ILIKE %x%` fast as the catalog grows.
create extension if not exists pg_trgm;
create index if not exists cigar_catalog_search_text_trgm
  on cigar_catalog using gin (search_text gin_trgm_ops);
