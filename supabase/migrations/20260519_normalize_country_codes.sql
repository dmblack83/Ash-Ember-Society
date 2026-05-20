-- ============================================================
-- Normalize country codes across cigar_catalog
--
-- The 2026-04-11 migrate-wrapper-country-leak.ts script normalized
-- wrapper_country only. binder_country (3147 rows) and
-- filler_countries (3899 rows) still carry ISO codes — surfaces
-- as the "double country" bug in the Suggest Edit flow (PR #407)
-- because the multi-select compares "NI" and "Nicaragua" as
-- distinct strings.
--
-- This migration maps every known code to its canonical dropdown
-- name (see WRAPPER_COUNTRIES in lib/cigar-taxonomy.ts) across all
-- three columns. filler_countries is deduped after substitution so
-- a row like ["NI", "Nicaragua"] collapses to ["Nicaragua"].
--
-- Mapping decided 2026-05-19:
--   NI→Nicaragua, DO→Dominican Republic, HN→Honduras, CU→Cuba,
--   ID→Indonesia, EC→Ecuador, BR→Brazil, MX→Mexico, CR→Costa Rica,
--   CM→Cameroon, PE→Peru, PA→Panama, US→USA, PH→Philippines,
--   CO→Colombia, IT→Italy, PY→Paraguay, ZW→Zimbabwe, ES→Spain,
--   HVA→Cuba (single typo; assume "Havana" intent).
--
-- Idempotent: re-running is a no-op once every code is normalized.
--
-- Run in the Supabase SQL editor (the project's migration pattern
-- per supabase/index-spotcheck.md and prior migration files).
-- ============================================================

begin;

create temp table _code_map (code text primary key, name text not null);

insert into _code_map (code, name) values
  ('NI',  'Nicaragua'),
  ('DO',  'Dominican Republic'),
  ('HN',  'Honduras'),
  ('CU',  'Cuba'),
  ('ID',  'Indonesia'),
  ('EC',  'Ecuador'),
  ('BR',  'Brazil'),
  ('MX',  'Mexico'),
  ('CR',  'Costa Rica'),
  ('CM',  'Cameroon'),
  ('PE',  'Peru'),
  ('PA',  'Panama'),
  ('US',  'USA'),
  ('PH',  'Philippines'),
  ('CO',  'Colombia'),
  ('IT',  'Italy'),
  ('PY',  'Paraguay'),
  ('ZW',  'Zimbabwe'),
  ('ES',  'Spain'),
  ('HVA', 'Cuba');

-- 1. wrapper_country (2 outliers expected: IT, PH)
update cigar_catalog c
   set wrapper_country = m.name
  from _code_map m
 where c.wrapper_country = m.code;

-- 2. binder_country (~3147 rows expected)
update cigar_catalog c
   set binder_country = m.name
  from _code_map m
 where c.binder_country = m.code;

-- 3. filler_countries (~3899 rows expected). Substitute each element
--    via the map; dedupe the result preserving order (first occurrence
--    wins). A row like ["NI", "Nicaragua"] becomes ["Nicaragua"].
update cigar_catalog c
   set filler_countries = sub.normalized
  from (
    select c2.id,
           (
             select array_agg(distinct mapped)
               from (
                 select coalesce(m.name, f) as mapped, ord
                   from unnest(c2.filler_countries) with ordinality as t(f, ord)
                   left join _code_map m on m.code = t.f
                  order by ord
               ) ordered
           ) as normalized
      from cigar_catalog c2
     where c2.filler_countries is not null
       and exists (
         select 1
           from unnest(c2.filler_countries) f
          where f in (select code from _code_map)
       )
  ) sub
 where c.id = sub.id;

-- 4. Sanity check counts after the rewrite. These should all be 0.
--    Re-run the offenders query separately if any are non-zero.
do $$
declare
  wrap_left   int;
  binder_left int;
  filler_left int;
begin
  select count(*) into wrap_left
    from cigar_catalog
   where wrapper_country in (select code from _code_map);

  select count(*) into binder_left
    from cigar_catalog
   where binder_country  in (select code from _code_map);

  select count(*) into filler_left
    from cigar_catalog c
   where exists (
     select 1 from unnest(coalesce(c.filler_countries, array[]::text[])) f
      where f in (select code from _code_map)
   );

  raise notice 'Remaining codes after migration: wrapper=%, binder=%, filler=%',
    wrap_left, binder_left, filler_left;
end $$;

commit;
