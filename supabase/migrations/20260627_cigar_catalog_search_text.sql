-- Multi-word cigar search: one lowercased, concatenated search column.
-- Generated + STORED so it auto-updates on insert/update with no trigger.
-- NOTE: built with || + coalesce, NOT concat_ws. concat_ws is STABLE (not
-- IMMUTABLE) and Postgres rejects it in a generated column expression
-- ("generation expression is not immutable"). The || operator, coalesce,
-- lower, and int/numeric ::text casts are all immutable.

alter table cigar_catalog
  add column if not exists search_text text
  generated always as (
    lower(
      coalesce(brand, '')           || ' ' ||
      coalesce(series, '')          || ' ' ||
      coalesce(format, '')          || ' ' ||
      coalesce(wrapper, '')         || ' ' ||
      coalesce(wrapper_country, '') || ' ' ||
      coalesce(shade, '')           || ' ' ||
      coalesce(ring_gauge::text, '')    || ' ' ||
      coalesce(length_inches::text, '')
    )
  ) stored;

-- Trigram index keeps `ILIKE %x%` fast as the catalog grows.
create extension if not exists pg_trgm;
create index if not exists cigar_catalog_search_text_trgm
  on cigar_catalog using gin (search_text gin_trgm_ops);
