# Govee Humidor Sensor Integration — Design

Date: 2026-07-19
Status: Approved by Dave (conversation, 2026-07-19)
Hardware plan: Dave is ordering a Govee H5179. Build proceeds in parallel against
Govee's documented API; a real-API probe with Dave's key is a merge gate for
user-facing work.

## Summary

Members can connect a WiFi-capable Govee thermo-hygrometer (H5179, H5103, and
other models on Govee's official supported list) to Ash & Ember. A cron job
polls Govee's cloud API every 15 minutes per connected user, stores the latest
reading, and sends push alerts when temperature or humidity crosses
user-configurable thresholds. Readings surface on the My Humidor page and as a
Home dashboard carousel card.

Bluetooth-only models (e.g. H5075) are out of scope: iOS PWAs have no Web
Bluetooth, and the H5075 is not on Govee's official API supported-model list
even via gateway.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Architecture | Background poll + stored reading (approach B). No live fetch on view; no history table in v1, but schema leaves room. |
| Audience | Member-only perk. Free users see a locked teaser pointing to membership. |
| Surfaces | Humidor page strip + Home dashboard carousel card (card only when connected). |
| Alerts | Push on out-of-range transition, 6-hour cooldown per metric. New notification category with automatic toggle in Account notification settings. |
| Thresholds | Defaults 62–72% RH, 60–72°F; user-adjustable on /account. |
| Sensors per user | One (v1). |
| Hardware sequencing | Build in parallel; probe real API before shipping user-facing UI. |

## Architecture

One Govee-calling path: the poll cron. UI reads only our own database via SWR.

```
Govee cloud (openapi.api.govee.com)
        ▲ every 15 min (cron)
/api/cron/govee-poll ──▶ govee_connections (latest reading + alert state)
                              ▲ threshold breach → sendPushToUser
        ┌─────────────────────┤
/api/govee/* (server routes)  │
        ▲                     ▲
Account "Humidor Sensor"   Humidor strip + Home card (SWR)
```

### Govee API

- Base: `https://openapi.api.govee.com/router/api/v1`
- Auth: `Govee-API-Key` header; per-user key the user generates in the Govee
  Home app (Settings → About Us → Apply for API Key).
- `POST /device/state` with `{ requestId, payload: { sku, device } }` returns
  capability readings including temperature and humidity.
- Device list endpoint enumerates devices with sku + device (MAC).
- Quota: 10,000 requests/day per key. 15-min polling ≈ 96/day per user, far
  under quota.
- Exact response shapes MUST be verified against the live probe (ship gate)
  before UI merge; the poller's parsing layer is isolated in one module so
  probe corrections are localized.

## Components

### 1. Database: `govee_connections` (new table, manual-apply migration)

One row per user:

- `user_id uuid` PK, FK → profiles, cascade delete
- `api_key text` — server-only secret (see Security)
- `device_id text`, `sku text`, `device_name text`
- `humidity_min int default 62`, `humidity_max int default 72`
- `temp_min_f int default 60`, `temp_max_f int default 72`
- `last_temp_f numeric`, `last_humidity numeric`, `last_reading_at timestamptz`
- `status text default 'active'` — `active | auth_error | device_missing`
- `alert_state jsonb default '{}'` — per-metric `{ out_of_range: bool, last_alert_at: timestamptz }`
- `created_at timestamptz default now()`

**Security / RLS:** No client policies at all (RLS enabled, zero `SELECT`
policies). All reads and writes go through server API routes using the service
client after auth via `getServerUser()`. The API key is returned to the browser
exactly never; status responses include only non-secret fields. This follows
the repo precedent that per-user secret rows (`push_subscriptions`) are
plain-text columns guarded by access policy, not at-rest field encryption.

Migration file committed under `supabase/migrations/`, applied manually by Dave
in the Supabase SQL editor (paste-block + verify query at implementation time,
flagged as a pre-deploy gate).

### 2. Server routes (`app/api/govee/`)

All routes: `runtime = "nodejs"`, auth via `getServerUser()`, Member-tier check
(reject free tier), service client for DB.

- `POST /api/govee/connect` — body `{ apiKey }`. Validates key by listing
  devices from Govee; returns supported sensors (filtered to Govee's official
  API-supported thermo-hygrometer SKUs). Does not persist yet.
- `POST /api/govee/select` — body `{ apiKey, deviceId, sku, deviceName }`.
  Upserts the connection row, fetches one immediate reading so the UI isn't
  empty until the next cron tick.
- `GET /api/govee/status` — returns `{ connected, deviceName, sku, thresholds,
  lastTempF, lastHumidity, lastReadingAt, status }` (no key). Used by all three
  UI surfaces via SWR.
- `PATCH /api/govee/thresholds` — body with the four bounds; validates
  min < max and sane ranges (RH 30–90, temp 40–90°F).
- `DELETE /api/govee/disconnect` — deletes the row.

Input validation on every route (schema-checked body, fail fast). Govee errors
map to friendly messages ("That key didn't work. Double-check it in the Govee
Home app.").

### 3. Poll cron: `app/api/cron/govee-poll/route.ts`

- `vercel.json` crons entry: `*/15 * * * *`.
- Reuses the repo's `isAuthorized(req)` CRON_SECRET pattern and
  `lib/cron-log.ts` run logging, `runtime = "nodejs"`.
- For each `status = 'active'` connection (batched, per-user isolation so one
  failure doesn't stop the run):
  1. `POST /device/state` with the stored key.
  2. On success: update `last_*` columns, evaluate thresholds.
  3. Alerting per metric (temp, humidity):
     - In range → out of range: send push if `last_alert_at` older than 6h;
       set `out_of_range: true`, stamp `last_alert_at`.
     - Out of range → in range: clear `out_of_range` (no push in v1).
  4. On 401/403: set `status = 'auth_error'`, stop polling this user.
     Device gone from account: `status = 'device_missing'`. Transient
     network/5xx: leave row untouched; next tick retries naturally.
- Push copy (no em dashes, user-facing): e.g. "Humidor humidity dropped to
  58%. Your range is 62 to 72%."

### 4. Notifications

- Add `humidor_sensor` to `NOTIFICATION_CATEGORIES` in
  `lib/notification-categories.ts` (label: "Humidor sensor alerts").
  The toggle appears automatically in `NotificationsSection` on /account.
- Sending uses existing `sendPushToUser` (outbox retry included). The cron
  checks `isCategoryEnabled(prefs, 'humidor_sensor')` before sending.

### 5. Account UI: "Humidor Sensor" section

New sibling section component in `components/account/AccountClient.tsx`, placed
after `NotificationsSection`, following the existing `SectionLabel` + card
pattern. Heavy content lazy-loaded like other sheets.

States:
- **Free tier:** locked teaser card ("Connect a Govee sensor to monitor your
  humidor. A Member perk.") linking to membership.
- **Member, not connected:** explainer (which models work, where to get the
  key), API key input (16px font, iOS zoom rule), Connect button → device
  picker → done.
- **Connected:** device name, latest reading, threshold controls
  (four bounds), Disconnect.
- **auth_error / device_missing:** reconnect prompt with plain-language copy.

### 6. Display surfaces

Both read `keyFor.goveeStatus(userId) = ["govee-status", userId]` via
`jsonFetcher` against `/api/govee/status`, with the SmokingConditions-style
visibility-refetch gating (5-min min age on `visibilitychange`/`pageshow`).

- **Humidor strip:** in `components/humidor/HumidorClient.tsx`, first child of
  the content container (scrolls with content; keeps the measured fixed header
  untouched). Temp · RH metrics, "as of Xm ago" relative timestamp, ember tint
  (`--ember`) on an out-of-range metric. Hidden entirely when no connection
  (free users see nothing here; the teaser lives on /account).
  Stale badge when `last_reading_at` > 45 min old ("sensor not reporting").
- **Home dashboard card:** carousel card mirroring the Smoking Conditions
  visual vocabulary (eyebrow, verdict pill, metric pair). Rendered only when
  `connected`. Because `/home` and `/humidor` are static shells, all of this is
  client-side SWR; no server fetch is added to the routes (static-shell rule
  respected, `npm run check:shells` must stay green).

## Error handling summary

| Failure | Behavior |
|---|---|
| Bad API key on connect | Inline friendly error, nothing saved |
| Key revoked later | Cron sets `auth_error`, polling pauses, /account shows reconnect, strip shows stale badge |
| Sensor offline / not uploading | Reading goes stale; strip shows "sensor not reporting" past 45 min; no false alerts (thresholds evaluated only on fresh reads) |
| Govee cloud down | Cron logs failures, rows untouched, retries next tick; no user-facing error |
| Threshold spam | Transition-only alerts + 6h per-metric cooldown |

## Testing

- **Unit (vitest, existing `test:unit` setup):** threshold evaluation +
  cooldown state machine (pure module, fully covered); Govee response parsing
  (fixtures updated from the live probe); route input validation.
- **Probe script** (`scripts/govee-probe.ts`): given a key, lists devices and
  fetches one state; run against Dave's H5179 as the ship gate, output pasted
  into fixtures.
- **Runtime verification:** `verify-in-app` screenshots of /account section
  states, humidor strip, dashboard card before PR completion claims.
- **Perf guardrails:** no new client deps; strip/card are small client
  components inside existing bundles; bundle-size CI gate must stay green.

## Out of scope (v1)

- Reading history + trend charts (schema allows adding an append table later)
- Multiple sensors / multiple humidors per user
- Bluetooth-only sensors (H5075) and Govee gateway bridging
- "Back in range" recovery notifications
- Premium-tier differentiation
