# DB index spot-check — investigation runbook

Maintenance plan **6b-iv**. The 2026-05-05 audit flagged three tables
that *might* be missing indexes; this file pairs each suspect with the
exact query the app issues, the `EXPLAIN ANALYZE` to run on the live
DB, and the migration template to ship if (and only if) the plan
confirms a sequential-scan hot path.

> **Don't add indexes blindly.** Each index slows down inserts and
> takes space. Confirm each one by reading the `EXPLAIN ANALYZE`
> output BEFORE writing the migration.

---

## 1. `cigar_catalog_suggestions` — `created_at DESC`

**App query** — admin queue, sorted newest first. Inserted from
`components/humidor/AddCigarSheet.tsx:255` and
`components/humidor/WishlistClient.tsx:248`. The read query lives in
the admin panel; if the admin queue feels slow, this is probably why.

**EXPLAIN ANALYZE:**

```sql
EXPLAIN ANALYZE
SELECT id, brand, series, format, ring_gauge, length_inches, wrapper, status, created_at
FROM cigar_catalog_suggestions
ORDER BY created_at DESC
LIMIT 50;
```

**What to look for in the plan:**
- `Seq Scan on cigar_catalog_suggestions` followed by a `Sort` node →
  index is missing. This is the case to fix.
- `Index Scan using ..._created_at_idx` → already covered. Skip.

**Migration if needed:**

```sql
-- supabase/migrations/YYYYMMDD_cigar_suggestions_created_at_idx.sql
CREATE INDEX IF NOT EXISTS cigar_catalog_suggestions_created_at_idx
  ON cigar_catalog_suggestions (created_at DESC);
```

---

## 2. `shop_checkins` — composite `(shop_id, created_at DESC)`

**App queries** — both filter on `shop_id` and a recency window.
- `app/(app)/discover/shops/[slug]/page.tsx:80` — count of checkins in
  the last 30 days for the shop detail page (server-rendered, runs on
  every visit to a shop detail page).
- Future: profile page may show "your recent checkins" → would want
  a `(user_id, created_at desc)` index.

**EXPLAIN ANALYZE — current shop-detail query:**

```sql
EXPLAIN ANALYZE
SELECT count(*)
FROM shop_checkins
WHERE shop_id  = '<paste a real shop UUID>'
  AND created_at >= now() - interval '30 days';
```

**Decision matrix:**
- Plan shows `Seq Scan` and the table has > a few thousand rows →
  add the composite index below.
- Plan shows `Index Scan using shop_checkins_shop_id_idx` followed by
  a filter → adequate today, revisit when row count grows.
- Plan shows `Bitmap Index Scan` + small heap-fetch → fine.

**Migration if needed:**

```sql
-- supabase/migrations/YYYYMMDD_shop_checkins_shop_id_created_idx.sql
CREATE INDEX IF NOT EXISTS shop_checkins_shop_id_created_idx
  ON shop_checkins (shop_id, created_at DESC);
```

---

## 3. `field_guide_comments` — composite `(vol_number, parent_comment_id, created_at DESC)`

**App query** — `components/field-guide/FieldGuideComments.tsx:348`
fetches a vol's comments ordered chronologically; threaded display
groups by `parent_comment_id`. There IS a `vol_idx` (per the audit),
but the threading flow benefits from a composite.

```ts
supabase
  .from("field_guide_comments")
  .select("id, vol_number, user_id, content, created_at, updated_at, parent_comment_id")
  .eq("vol_number", volNumber)
  .order("created_at", { ascending: true })
  .range(0, COMMENTS_LIMIT - 1);
```

**EXPLAIN ANALYZE:**

```sql
EXPLAIN ANALYZE
SELECT id, vol_number, user_id, content, created_at, updated_at, parent_comment_id
FROM field_guide_comments
WHERE vol_number = 4
ORDER BY created_at ASC
LIMIT 50;
```

**What to look for:**
- `Index Scan using field_guide_comments_vol_idx` followed by a `Sort`
  → adequate but the sort is in memory; composite saves the sort.
  Only worth the migration if rows-per-vol exceeds ~5k or the page
  feels slow.
- `Seq Scan` → bigger problem, fix immediately.

**Migration if needed:**

```sql
-- supabase/migrations/YYYYMMDD_field_guide_comments_threaded_idx.sql
CREATE INDEX IF NOT EXISTS field_guide_comments_vol_thread_idx
  ON field_guide_comments (vol_number, parent_comment_id, created_at DESC);
```

Note: this composite serves the threaded display (parent → reply
chains) AS WELL AS the chronological page-load. It supersedes
`vol_idx` for these queries; consider whether to drop `vol_idx` after
adoption (verify no other query hits it via `pg_stat_user_indexes`).

---

## How to run these queries

In Supabase Studio → SQL Editor:

1. Pick a representative row id from the table (newest is fine).
2. Paste the `EXPLAIN ANALYZE` block.
3. Read the top of the plan tree:
   - **Seq Scan** = full table read (slow on big tables).
   - **Index Scan / Bitmap Index Scan** = index used (fast).
   - **Sort** node above the scan = data is being sorted in memory.
4. Note the `actual time` and `rows`. If actual time < ~5ms the
   query is fine regardless of plan shape.

## Don't break

- Don't add indexes inside an active migration that also alters the
  same table — separate concerns, separate migrations.
- After adding any composite index, do `pg_stat_user_indexes` a few
  weeks later to verify it's actually being used. Unused indexes
  should be dropped.
