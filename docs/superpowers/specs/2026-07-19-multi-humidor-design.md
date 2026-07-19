# Multi-Humidor — Design

Date: 2026-07-19
Status: Approved by Dave (conversation + interactive mockup, 2026-07-19)
Mockup: `mockups/multi-humidor/index.html` (approved; chips, aggregate strips,
first-run, add/edit/delete flows all validated visually)
Builds on: Govee sensor integration (PR #582, merged and live on Dave's H5179)

## Summary

Users organize cigars into multiple humidors (real containers: humidor,
tupperdor, cooler, travel case). Each humidor can have one Govee sensor
assigned from the user's single Govee account key, with its own thresholds
and alerts. Free tier: exactly 1 humidor. Member: unlimited — a headline
Member perk alongside unlimited cigars and live monitoring.

Explicit quality bar (Dave): no regressions to existing behavior. The
migration touches `humidor_items` (the app's most-used table); protection
measures are specified in the Regression Protection section and are part
of the deliverable, not optional.

## Decisions (from brainstorming + mockup iterations)

| Decision | Choice |
|---|---|
| Model | Real containers (`humidors` table), phased over two PRs |
| Gating | Free = 1 humidor (the default), Member = unlimited. Sensor connection stays Member-only |
| Default view | Full all-cigars list (as today), filterable by humidor via chip row |
| Overview | On "All": conditions strip becomes collapsed aggregate — "N humidors" + verdict pill ("All in range" / "1 needs attention"); expands to per-humidor rows (name, count, temp/RH, ✎) |
| Home card | 1 sensor → direct reading (as shipped); 2+ sensors → same collapsed aggregate + expand |
| Header | "My Humidor" when user has ≤1 humidor; "My Humidors" when ≥2 |
| Chips | Hidden when only the default exists — a single dashed "+ New Humidor" chip shows instead (discovery affordance). Full row (All · names · + New) from 2 humidors on |
| Sort/view row | Moves out of the fixed header to below the conditions card (scrolls with content). Fixed header = title row + chips |
| Management | BottomSheet from the humidor page (+ chip to create; ✎ on overview rows and single-humidor strip to edit) |
| Create sheet | Name, type picker (humidor/tupperdor/cooler/travel), Govee sensor assignment (unassigned sensors only, "No sensor for now" option) |
| Edit sheet | Same fields prefilled + per-humidor alert ranges + Delete |
| Delete rule | User picks a destination humidor for the cigars (default humidor preselected). With only the default left, cigars auto-move there, no picker. Burn history always kept. Default humidor is renameable but never deletable |
| Free upsell | Free user tapping + New gets the Member upsell sheet ($4.99/mo) instead of the form |
| Alert copy | Includes humidor name: "Cabinet humidity dropped to 58%. Your range is 62 to 72%." |

## Data model

### New table: `humidors`

- `id uuid` PK default `gen_random_uuid()`
- `user_id uuid` FK → profiles, cascade delete
- `name text` NOT NULL (UI caps at 40 chars)
- `type text` NOT NULL default `'humidor'` check in (`humidor`,`tupperdor`,`cooler`,`travel`)
- `is_default boolean` NOT NULL default false; partial unique index `(user_id) where is_default` — exactly one default per user
- Sensor block (moved here from `govee_connections`; all nullable — null device = no sensor):
  `device_id text`, `sku text`, `device_name text`,
  `humidity_min int default 62`, `humidity_max int default 72`,
  `temp_min_f int default 60`, `temp_max_f int default 72`,
  `last_temp_f numeric`, `last_humidity numeric`, `last_reading_at timestamptz`,
  `sensor_status text` check in (`active`,`auth_error`,`device_missing`) nullable,
  `alert_state jsonb` NOT NULL default `'{}'`
- `created_at timestamptz` default now()

No secrets live here (the API key stays in `govee_connections`), so unlike
that table, `humidors` gets own-row RLS (select/insert/update/delete where
`user_id = auth.uid()`), matching the `humidor_items` pattern — chips and
overview read client-side via SWR with no new API round-trips.

Free-tier limit: DB trigger `enforce_humidors_free_limit` (mirrors
`enforce_humidor_free_limit`): blocks INSERT when the user is free tier and
already has ≥1 humidor. Client check + upsell sheet in front of it.

### `govee_connections` (slims down to the account link)

Keeps: `user_id` PK, `api_key`, `status` (auth health), `created_at`.
Drops (after data moves to `humidors`): device/sensor columns, thresholds,
readings, `alert_state`. Stays service-role-only (zero RLS policies).

### `humidor_items`

- Add `humidor_id uuid` NULL FK → humidors **on delete restrict** (app
  always moves cigars before deleting a humidor; restrict is the backstop
  that makes orphaning impossible at the DB level).
- Wishlist rows (`is_wishlist = true`) keep `humidor_id` NULL — wishlist
  stays global. Non-wishlist rows get `humidor_id` set by the app on
  insert; a NULL on a non-wishlist row renders under "All" only (defensive
  display rule, should not occur post-backfill).

### Migration + backfill (manual-apply, single SQL file, ordered)

1. Create `humidors` + index + trigger.
2. Backfill: for every user having any `humidor_items` row OR a
   `govee_connections` row, insert a default humidor `'My Humidor'`
   (`is_default = true`), copying that user's sensor block from
   `govee_connections` if present.
3. `humidor_items.humidor_id` column add + backfill non-wishlist rows to
   the owner's default humidor.
4. `govee_connections`: drop moved columns.
5. Atomic delete helper: RPC `delete_humidor(p_humidor_id uuid, p_dest_id uuid)`
   — SECURITY INVOKER, runs under the caller's RLS; in one transaction moves
   items then deletes the humidor; refuses `is_default` targets for deletion
   and cross-user ids.
6. Verify queries (counts before/after, zero non-wishlist NULLs, exactly one
   default per affected user) ship with the migration block.

## Server / API changes

- **Cron `/api/cron/govee-poll`**: query becomes `humidors` (device_id not
  null, sensor_status = 'active') joined to `govee_connections` for the
  key. Same batching, isolation, cooldown engine. `GoveeAuthError` marks
  the user's `govee_connections.status = 'auth_error'` AND pauses all their
  sensors. Alert body prefixes the humidor name. One push per humidor
  transition (existing per-metric tags become `govee-${humidorId}-${metric}`).
- **`GET /api/govee/connection`** reshapes to account + array:
  `{ keyConnected, keyStatus, sensors: [{ humidorId, humidorName, sku, deviceName, thresholds, lastTempF, lastHumidity, lastReadingAt, sensorStatus }] }`.
  (The Govee feature shipped hours ago and has exactly one user — Dave —
  so the shape changes in place; no compatibility layer.)
- **New `POST /api/govee/assign`** `{ humidorId, deviceId, sku, deviceName }`
  and **`POST /api/govee/unassign`** `{ humidorId }` — server-validated
  (member gate, humidor ownership, device present in the account's Govee
  list, device not already assigned to another of the user's humidors).
  Thresholds PATCH gains `humidorId`.
- **`/api/govee/devices`** unchanged, but response marks which devices are
  already assigned (client hides them in pickers).
- **Account page** Humidor Sensor section slims to key management: connect
  key / key status / disconnect account (with warning that all sensor
  assignments deactivate). Sensor assignment + thresholds live in the
  humidor sheets.
- Humidor CRUD itself is client-side Supabase (own-row RLS + trigger),
  like `humidor_items`; delete goes through the `delete_humidor` RPC.

## UI changes

- **`HumidorClient`**: header pluralization; chip row (or dashed + chip)
  under the title inside the fixed header; sort/view row relocated below
  the conditions card into scrolling content; aggregate strip (collapsed
  default, expandable rows with ✎) on All; single strip with ✎ when
  filtered; humidor tag line on cigar cards in All view; filter state in
  component state + localStorage (matches the grid/list toggle precedent).
- **`HumidorConditions`** grows an `aggregate` mode fed by the sensors
  array; single mode unchanged for one sensor.
- **Home `DashboardPagerIsland`**: slide shows single reading for 1
  sensor, aggregate for 2+; slide hidden with 0 sensors (as today).
- **Humidor sheets** (new `components/humidor/HumidorSheet.tsx` on the
  existing BottomSheet primitive): create / edit / delete-with-destination
  flows per the mockup; free-tier upsell variant.
- **`AddToHumidorSheet`**: humidor picker, defaulting to the active filter
  (or the only humidor). **Item detail**: "Move to..." action (phase 2).
- SWR keys: `keyFor.humidors(userId)`; `goveeStatus` reshapes to the new
  response. `mutate` fan-out on humidor CRUD keeps chips, strips, and home
  card coherent.

## Regression Protection (part of the deliverable)

1. **Single-humidor experience is pixel-equivalent to today** except: the
   dashed + New chip, and the sort/view row relocation. Verified by
   before/after screenshots on /humidor with one humidor.
2. **Migration safety**: backfill is additive (new table, new nullable
   column); nothing existing is dropped until data is verified moved.
   The `govee_connections` column drop is the LAST statement and gated on
   the verify queries passing. Rollback path: the column drop is the only
   destructive step; everything before it is reversible by dropping the
   new objects.
3. **DB backstops**: `on delete restrict` on `humidor_id`; one-default
   partial unique index; free-limit trigger; RPC-only humidor deletion.
4. **Tests**: existing 277 must stay green. New unit tests: aggregate
   verdict derivation (n sensors → pill state), pluralization rule,
   thresholds engine untouched (its 12 tests are the regression net),
   sensor-array response mapping, assign/unassign validation logic.
5. **Static-shell rule**: /humidor and /home page.tsx untouched server-side;
   `npm run check:shells` stays a gate. Bundle gate: watch deltas
   (aggregate strip and sheets are added to existing client bundles).
6. **Runtime verification** before merge: verify-in-app across /humidor
   (1 humidor, 3 humidors, out-of-range), /home card (1 vs many), account
   key section; plus live end-to-end on Dave's real sensor (his existing
   connection must survive the migration with readings intact).
7. **Cron continuity**: after migration, the first poll tick must pick up
   Dave's sensor from the new location with no re-setup.

## Phasing (two PRs)

- **PR 1**: schema + backfill + Govee sensor rework (cron, routes, account
  slim-down) + HumidorClient chips/strips/sheets + AddToHumidorSheet
  picker + home card aggregate. Ships the whole approved mockup.
- **PR 2**: item-detail "Move to..." flow, per-humidor filter on stats and
  aging (if wanted), polish from real use.

## Out of scope (v1)

Per-humidor stats/aging filters (PR 2 candidates), capacity tracking,
multiple sensors per humidor, humidor sharing/photos, CSV import/export.
