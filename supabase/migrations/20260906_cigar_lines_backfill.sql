-- ============================================================
-- One-time backfill: one line per (brand, coalesce(series,''))
-- group; stamp line_id on every child. Additive-only: no child
-- row is deleted or modified beyond line_id.
--
-- Conflict handling: groups whose rows disagree on a blend field
-- get ONE line built from the highest-usage child (deterministic;
-- ties broken by id). Children keep their own copies untouched —
-- the audit report lists these groups for per-entry resolution.
-- (Seed data: 0 conflicts; prod may differ via community adds.)
-- Run AFTER 20260906_cigar_lines.sql.
--
-- APPLY-ORDER NOTE: children created while insert v1 is still live
-- (between applying 1-2 and 6) get line_id = null. The stamp UPDATE
-- below is idempotent (where line_id is null) — either apply all six
-- migrations in one sitting, or RE-RUN this file's two statements
-- after migration 6 to stamp any drift rows.
-- ============================================================

-- Record the before-count to compare in verify:
-- select count(*) from cigar_catalog;

insert into cigar_lines
  (brand, series, wrapper, shade, wrapper_country, binder_country,
   filler_countries, community_added, approved)
select distinct on (brand, coalesce(series, ''))
  brand, series, wrapper, shade, wrapper_country, binder_country,
  filler_countries, community_added, approved
from cigar_catalog
where brand is not null
order by brand, coalesce(series, ''), usage_count desc, id
on conflict (brand, coalesce(series, '')) do nothing;

update cigar_catalog c
set line_id = l.id
from cigar_lines l
where c.line_id is null
  and c.brand is not null
  and l.brand = c.brand
  and coalesce(l.series, '') = coalesce(c.series, '');

-- ── Verify ──────────────────────────────────────────────────
-- 1. Catalog row count UNCHANGED vs the before-count above.
-- select count(*) from cigar_catalog;
-- 2. Every row has line_id (expect 0; if >0, run the brand-null
--    check below — null-brand rows are the only legitimate gap):
-- select count(*) from cigar_catalog where line_id is null;
-- select count(*) from cigar_catalog where brand is null;
-- 3. Line count = distinct group count (both queries equal):
-- select count(*) from cigar_lines;
-- select count(distinct (brand, coalesce(series,''))) from cigar_catalog where brand is not null;
-- 4. Zero orphan lines:
-- select count(*) from cigar_lines l
--   where not exists (select 1 from cigar_catalog c where c.line_id = l.id);
-- 5. humidor_items count UNCHANGED:
-- select count(*) from humidor_items;
-- 6. Blend-conflict groups (audit input; expected 0 on seed data):
-- select l.brand, l.series, count(distinct (coalesce(c.wrapper,''),
--   coalesce(c.shade,''), coalesce(c.wrapper_country,''),
--   coalesce(c.binder_country,''), coalesce(c.filler_countries,'{}'::text[])))
-- from cigar_lines l join cigar_catalog c on c.line_id = l.id
-- group by l.brand, l.series
-- having count(distinct (coalesce(c.wrapper,''), coalesce(c.shade,''),
--   coalesce(c.wrapper_country,''), coalesce(c.binder_country,''),
--   coalesce(c.filler_countries,'{}'::text[]))) > 1;
