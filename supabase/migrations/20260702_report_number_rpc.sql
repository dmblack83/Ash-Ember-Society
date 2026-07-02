-- DB-2 (HIGH) + DB-5 (MED) from the 2026-07-02 audit.
--
-- computeReportNumbers previously fetched EVERY smoke_log row for
-- every author appearing on a lounge page just to count 1-indexed
-- positions in JS. This replaces that with a single window-function
-- RPC, plus the (user_id, smoked_at desc) index that serves both the
-- window scan and the common "latest logs for user" reads.
--
-- SECURITY INVOKER (not definer): the function sees exactly the rows
-- the calling role's RLS already allows, so report numbers keep the
-- same visibility semantics as the JS path it replaces and the RPC
-- exposes no new data.
--
-- Tie-break on id keeps numbering deterministic when two logs share
-- the same smoked_at (the JS path's ordering was unspecified there).
--
-- MANUAL APPLY REQUIRED: run this in the Supabase SQL editor on prod.
-- The code path falls back to the legacy JS counting until this is
-- applied, so deploy order does not matter.

create index if not exists smoke_logs_user_id_smoked_at_idx
  on smoke_logs (user_id, smoked_at desc);

create or replace function get_report_numbers(p_smoke_log_ids uuid[])
returns table (
  smoke_log_id  uuid,
  report_number bigint
)
language sql
stable
security invoker
as $$
  with owners as (
    select distinct user_id
    from   smoke_logs
    where  id = any(p_smoke_log_ids)
  ),
  numbered as (
    select s.id,
           row_number() over (
             partition by s.user_id
             order by s.smoked_at asc, s.id asc
           ) as rn
    from  smoke_logs s
    join  owners o on o.user_id = s.user_id
  )
  select n.id, n.rn
  from   numbered n
  where  n.id = any(p_smoke_log_ids);
$$;
