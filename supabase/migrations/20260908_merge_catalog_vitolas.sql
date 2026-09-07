-- ============================================================
-- merge_catalog_vitolas: fold one duplicate vitola into another
-- WITHOUT any member losing inventory. Atomic: repoints every
-- referencing table, then deletes the source row. Referencing
-- tables (verified 2026-09-07):
--   humidor_items.cigar_id          (on delete restrict)
--   smoke_logs.cigar_id             (on delete restrict)
--   cigar_edit_suggestions.cigar_id (on delete cascade)
--   cigar_image_submissions.cigar_id (on delete cascade)
-- Wishlist rows have a manual prod unique index on
-- (user_id, cigar_id) where is_wishlist: a member who wishlisted
-- BOTH duplicates keeps the target row (colliding source row is
-- deleted first). The TARGET's fields (including blend) survive;
-- usage counts sum; the target adopts the source's image only
-- when it has none. Manual-apply in the Supabase SQL editor.
-- ============================================================

create or replace function merge_catalog_vitolas(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source         cigar_catalog%rowtype;
  v_humidor        integer;
  v_logs           integer;
  v_wishlist_dupes integer;
begin
  if p_source = p_target then
    raise exception 'source and target are the same row';
  end if;

  -- Body style constraints (Supabase SQL editor parser, found 2026-09-07):
  -- one statement per line, and NO select nested inside an if condition
  -- or where clause (perform / delete using instead). Valid plpgsql
  -- otherwise 42601s in the editor.
  select * into v_source from cigar_catalog where id = p_source;
  if not found then
    raise exception 'source vitola not found';
  end if;
  perform 1 from cigar_catalog where id = p_target;
  if not found then
    raise exception 'target vitola not found';
  end if;

  delete from humidor_items s
  using humidor_items t
  where s.cigar_id = p_source
    and s.is_wishlist
    and t.user_id = s.user_id
    and t.cigar_id = p_target
    and t.is_wishlist;
  get diagnostics v_wishlist_dupes = row_count;

  update humidor_items set cigar_id = p_target where cigar_id = p_source;
  get diagnostics v_humidor = row_count;

  update smoke_logs set cigar_id = p_target where cigar_id = p_source;
  get diagnostics v_logs = row_count;

  update cigar_edit_suggestions  set cigar_id = p_target where cigar_id = p_source;
  update cigar_image_submissions set cigar_id = p_target where cigar_id = p_source;

  update cigar_catalog set
    usage_count = usage_count + coalesce(v_source.usage_count, 0),
    image_url   = coalesce(image_url, v_source.image_url)
  where id = p_target;

  delete from cigar_catalog where id = p_source;

  return jsonb_build_object(
    'humidor_items_moved',    v_humidor,
    'smoke_logs_moved',       v_logs,
    'wishlist_dupes_removed', v_wishlist_dupes
  );
end;
$$;

revoke execute on function merge_catalog_vitolas(uuid, uuid) from public, anon, authenticated;
grant execute on function merge_catalog_vitolas(uuid, uuid) to service_role;

-- ── Verify ──────────────────────────────────────────────────
-- select has_function_privilege('authenticated', 'merge_catalog_vitolas(uuid, uuid)', 'execute');  -- f
-- select has_function_privilege('anon', 'merge_catalog_vitolas(uuid, uuid)', 'execute');           -- f

-- ── Rollback ────────────────────────────────────────────────
-- drop function if exists merge_catalog_vitolas(uuid, uuid);
