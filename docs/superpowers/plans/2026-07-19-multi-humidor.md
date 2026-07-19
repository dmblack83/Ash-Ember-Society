# Multi-Humidor (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users organize cigars into multiple humidors (free = 1, Member = unlimited), each with an optional per-humidor Govee sensor under the user's single API key; the humidor page gains chips + a collapsed aggregate conditions strip, the home card handles 1-vs-many sensors.

**Architecture:** New `humidors` table with own-row RLS carries names, types, and the per-humidor sensor block (no secrets) — all UI reads it client-side via SWR (`keyFor.humidors`), with NO API route on hot paths. `govee_connections` slims to the account-level API key (service-role-only). Server routes remain only for key management and sensor assign/unassign (which must validate against Govee's cloud). The cron polls `humidors` joined to the account key.

**Tech Stack:** Supabase (RLS + trigger + SECURITY INVOKER RPC), Next.js route handlers (nodejs), SWR, BottomSheet primitive, vitest.

**Spec:** `docs/superpowers/specs/2026-07-19-multi-humidor-design.md`
**Mockup (approved):** `mockups/multi-humidor/index.html`
**Spec refinement (this plan):** sensor readings/thresholds are read AND written client-side on `humidors` (own-row RLS) instead of via `/api/govee/connection` GET/PATCH. The GET slims to key status (used on /account only); PATCH is deleted. Better perf than the spec's shape, same security (no secrets in `humidors`).

## Global Constraints

- NO REGRESSIONS (Dave's explicit bar): with one humidor the page renders as today except the dashed "+ New Humidor" chip and the sort/view row relocation. All 277 existing tests stay green. Dave's live sensor must survive the migration (readings + alerts continue on the first cron tick, no re-setup).
- Header: "My Humidor" when the user has ≤1 humidor, "My Humidors" when ≥2.
- Chips hidden when only the default humidor exists — show a single dashed "+ New Humidor" chip. Full row (All · names · + New) from 2 humidors.
- Delete rule: destination picker (default humidor preselected); cigars always move, burn history kept; the default humidor cannot be deleted.
- Free tier: exactly 1 humidor (DB trigger + client check + upsell sheet). Sensor features stay Member-only.
- All user-facing copy: NO em dashes. Text inputs ≥16px font (iOS zoom).
- Static-shell rule: no server fetch added to /home or /humidor page.tsx; `npm run check:shells` green.
- Migration is MANUAL-APPLY by Dave (paste block + verify queries); the `govee_connections` column drop is the last statement, gated on verify queries. Code must tolerate the table state only AFTER apply (this ships in one PR with the migration as pre-deploy gate, same as #582).
- Branch: `feat/multi-humidor` (already created off synced main @ d90dc01). Commit after every task.
- Alert copy includes humidor name: "Cabinet humidity dropped to 58%. Your range is 62 to 72%." Push tag: `govee-${humidorId}-${metric}`.

## File Structure

- Create: `supabase/migrations/20260719_multi_humidor.sql` (Task 1)
- Create: `lib/humidor/overview.ts` + tests (Task 2) — pure verdict/pluralization logic
- Create: `lib/data/humidors.ts` (Task 3) — Humidor type, fetcher, client CRUD helpers, ensureDefaultHumidor
- Modify: `lib/data/keys.ts` (Task 3) — `keyFor.humidors`
- Modify: `lib/govee/types.ts`, `lib/govee/server.ts`, `app/api/govee/connection/route.ts`, `app/api/govee/devices/route.ts` (Task 4); Create: `app/api/govee/assign/route.ts` (Task 4)
- Modify: `app/api/cron/govee-poll/route.ts` (Task 5)
- Create: `components/humidor/useHumidors.ts`; Rewrite: `components/govee/HumidorConditions.tsx`; Delete: `components/govee/useGoveeStatus.ts` (Task 6)
- Create: `components/humidor/HumidorSheet.tsx` (Task 7)
- Modify: `components/humidor/HumidorClient.tsx` (Task 8)
- Modify: `components/cigars/AddToHumidorSheet.tsx`, `lib/humidor/add-item.ts`, other `addHumidorItem` call sites (Task 9)
- Modify: `app/(app)/home/client-islands.tsx` (Task 10)
- Rewrite: `components/govee/HumidorSensorSection.tsx` → key management only (Task 11)

---

### Task 1: Migration SQL

**Files:**
- Create: `supabase/migrations/20260719_multi_humidor.sql`

**Interfaces:**
- Produces: `humidors` table (columns below), `humidor_items.humidor_id`, trigger `enforce_humidors_free_limit`, RPC `delete_humidor(p_humidor_id, p_dest_id)`.

- [ ] **Step 1: Write the migration file** (exact content):

```sql
-- Multi-humidor: containers table + per-humidor sensor block.
-- ORDERED manual-apply. Steps 1-5 are additive/reversible; step 6
-- (govee_connections column drop) is the ONLY destructive step and
-- runs LAST, after the verify queries at the bottom pass.

-- 1. humidors ------------------------------------------------------
create table if not exists humidors (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  name            text not null,
  type            text not null default 'humidor'
                  check (type in ('humidor','tupperdor','cooler','travel')),
  is_default      boolean not null default false,
  -- sensor block (no secrets; api key stays in govee_connections)
  device_id       text,
  sku             text,
  device_name     text,
  humidity_min    int  not null default 62,
  humidity_max    int  not null default 72,
  temp_min_f      int  not null default 60,
  temp_max_f      int  not null default 72,
  last_temp_f     numeric,
  last_humidity   numeric,
  last_reading_at timestamptz,
  sensor_status   text check (sensor_status in ('active','auth_error','device_missing')),
  alert_state     jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

create unique index if not exists humidors_one_default_per_user
  on humidors (user_id) where is_default;
create index if not exists humidors_user_idx on humidors (user_id);

alter table humidors enable row level security;
create policy humidors_select on humidors for select using (auth.uid() = user_id);
create policy humidors_insert on humidors for insert with check (auth.uid() = user_id);
create policy humidors_update on humidors for update using (auth.uid() = user_id);
create policy humidors_delete on humidors for delete using (auth.uid() = user_id);

-- 2. free-tier limit: 1 humidor (mirrors enforce_humidor_free_limit)
create or replace function enforce_humidors_free_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tier text;
  v_count int;
begin
  select coalesce(membership_tier, 'free') into v_tier
    from profiles where id = new.user_id;
  if v_tier <> 'free' then return new; end if;
  select count(*) into v_count from humidors where user_id = new.user_id;
  if v_count >= 1 then
    raise exception 'humidors_free_tier_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists humidors_free_limit_check on humidors;
create trigger humidors_free_limit_check
  before insert on humidors for each row
  execute function enforce_humidors_free_limit();

-- 3. backfill: one default humidor per existing user, copying the
--    sensor block from govee_connections where present -------------
insert into humidors (user_id, name, is_default,
                      device_id, sku, device_name,
                      humidity_min, humidity_max, temp_min_f, temp_max_f,
                      last_temp_f, last_humidity, last_reading_at,
                      sensor_status, alert_state)
select u.user_id, 'My Humidor', true,
       g.device_id, g.sku, g.device_name,
       coalesce(g.humidity_min, 62), coalesce(g.humidity_max, 72),
       coalesce(g.temp_min_f, 60),  coalesce(g.temp_max_f, 72),
       g.last_temp_f, g.last_humidity, g.last_reading_at,
       g.status, coalesce(g.alert_state, '{}'::jsonb)
from (
  select distinct user_id from humidor_items
  union
  select user_id from govee_connections
) u
left join govee_connections g on g.user_id = u.user_id
on conflict do nothing;

-- 4. humidor_items.humidor_id + backfill non-wishlist rows ---------
alter table humidor_items
  add column if not exists humidor_id uuid references humidors(id) on delete restrict;

update humidor_items hi
set humidor_id = h.id
from humidors h
where h.user_id = hi.user_id and h.is_default
  and hi.is_wishlist = false and hi.humidor_id is null;

create index if not exists humidor_items_humidor_idx
  on humidor_items (humidor_id) where humidor_id is not null;

-- 5. atomic move-then-delete (SECURITY INVOKER: caller's RLS applies)
create or replace function delete_humidor(p_humidor_id uuid, p_dest_id uuid)
returns void language plpgsql security invoker as $$
declare
  v_user uuid;
  v_default boolean;
begin
  select user_id, is_default into v_user, v_default
    from humidors where id = p_humidor_id;
  if v_user is null then raise exception 'humidor_not_found' using errcode = 'P0001'; end if;
  if v_default then raise exception 'cannot_delete_default' using errcode = 'P0001'; end if;
  if p_dest_id = p_humidor_id
     or not exists (select 1 from humidors where id = p_dest_id and user_id = v_user) then
    raise exception 'invalid_destination' using errcode = 'P0001';
  end if;
  update humidor_items set humidor_id = p_dest_id where humidor_id = p_humidor_id;
  delete from humidors where id = p_humidor_id;
end $$;

-- ==================================================================
-- VERIFY before running step 6 (all must look right):
--   select count(*) from humidors;                          -- one per active user
--   select count(*) from humidors where is_default;         -- same number
--   select count(*) from humidor_items
--     where is_wishlist = false and humidor_id is null;     -- 0
--   select user_id, device_id, last_humidity from humidors
--     where device_id is not null;                          -- Dave's sensor moved
-- ==================================================================

-- 6. govee_connections slims to the account key (DESTRUCTIVE, LAST)
alter table govee_connections
  drop column if exists device_id,
  drop column if exists sku,
  drop column if exists device_name,
  drop column if exists humidity_min,
  drop column if exists humidity_max,
  drop column if exists temp_min_f,
  drop column if exists temp_max_f,
  drop column if exists last_temp_f,
  drop column if exists last_humidity,
  drop column if exists last_reading_at,
  drop column if exists alert_state;
-- keep: user_id, api_key, status, created_at
```

- [ ] **Step 2: Commit** — `git add supabase/migrations/20260719_multi_humidor.sql && git commit -m "feat: multi-humidor schema migration (manual-apply)"`

- [ ] **Step 3: Controller posts the SQL as a chat paste block** with the verify queries, flagged as pre-deploy gate (steps 1-5 first, verify, then step 6).

---

### Task 2: Overview verdict + pluralization (pure, TDD)

**Files:**
- Create: `lib/humidor/overview.ts`
- Test: `lib/humidor/__tests__/overview.test.ts`

**Interfaces:**
- Consumes: `isMetricOutOfRange`, `ThresholdConfig`, `SensorReading` from `lib/govee/thresholds.ts`.
- Produces (consumed by Tasks 6, 8, 10):

```ts
export interface SensorLike {
  device_id: string | null;
  humidity_min: number; humidity_max: number;
  temp_min_f: number; temp_max_f: number;
  last_temp_f: number | null; last_humidity: number | null;
  last_reading_at: string | null;
  sensor_status: string | null;
}
export interface OverviewVerdict {
  total: number;        // humidor count
  sensored: number;     // humidors with a device AND a stored reading
  outCount: number;     // sensored humidors with any metric out of range
  pill: "good" | "bad" | null;   // null when sensored === 0
  pillLabel: string;    // "All in range" | "1 needs attention" | "2 need attention" | ""
}
export function deriveOverview(humidors: SensorLike[]): OverviewVerdict;
export function isHumidorOut(h: SensorLike): boolean;  // false when no device/reading
export function humidorsTitle(count: number): string;  // <=1 "My Humidor", >=2 "My Humidors"
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { deriveOverview, isHumidorOut, humidorsTitle } from "../overview";
import type { SensorLike } from "../overview";

const base: SensorLike = {
  device_id: "d1", humidity_min: 62, humidity_max: 72, temp_min_f: 60, temp_max_f: 72,
  last_temp_f: 68, last_humidity: 65, last_reading_at: "2026-07-19T12:00:00Z",
  sensor_status: "active",
};
const noSensor: SensorLike = { ...base, device_id: null, last_temp_f: null, last_humidity: null, last_reading_at: null, sensor_status: null };

describe("isHumidorOut", () => {
  test("in-range sensored humidor is not out", () => {
    expect(isHumidorOut(base)).toBe(false);
  });
  test("low humidity is out", () => {
    expect(isHumidorOut({ ...base, last_humidity: 53 })).toBe(true);
  });
  test("high temp is out", () => {
    expect(isHumidorOut({ ...base, last_temp_f: 80 })).toBe(true);
  });
  test("no sensor is never out", () => {
    expect(isHumidorOut(noSensor)).toBe(false);
  });
  test("device assigned but no reading yet is not out", () => {
    expect(isHumidorOut({ ...base, last_temp_f: null, last_humidity: null })).toBe(false);
  });
});

describe("deriveOverview", () => {
  test("all in range", () => {
    const v = deriveOverview([base, { ...base, device_id: "d2" }, noSensor]);
    expect(v).toEqual({ total: 3, sensored: 2, outCount: 0, pill: "good", pillLabel: "All in range" });
  });
  test("one out", () => {
    const v = deriveOverview([base, { ...base, device_id: "d2", last_humidity: 53 }]);
    expect(v.pill).toBe("bad");
    expect(v.pillLabel).toBe("1 needs attention");
  });
  test("two out pluralizes", () => {
    const v = deriveOverview([
      { ...base, last_humidity: 53 },
      { ...base, device_id: "d2", last_temp_f: 80 },
    ]);
    expect(v.pillLabel).toBe("2 need attention");
  });
  test("no sensors anywhere -> null pill, empty label", () => {
    const v = deriveOverview([noSensor, { ...noSensor }]);
    expect(v).toEqual({ total: 2, sensored: 0, outCount: 0, pill: null, pillLabel: "" });
  });
});

describe("humidorsTitle", () => {
  test("0 and 1 are singular", () => {
    expect(humidorsTitle(0)).toBe("My Humidor");
    expect(humidorsTitle(1)).toBe("My Humidor");
  });
  test("2+ is plural", () => {
    expect(humidorsTitle(2)).toBe("My Humidors");
    expect(humidorsTitle(5)).toBe("My Humidors");
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run lib/humidor` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/humidor/overview.ts`**

```ts
/* Pure aggregate-verdict logic for the multi-humidor conditions
   strips (humidor page "All" view + home card). No I/O. */

import { isMetricOutOfRange, type SensorReading, type ThresholdConfig } from "@/lib/govee/thresholds";

export interface SensorLike {
  device_id: string | null;
  humidity_min: number; humidity_max: number;
  temp_min_f: number; temp_max_f: number;
  last_temp_f: number | null; last_humidity: number | null;
  last_reading_at: string | null;
  sensor_status: string | null;
}

export interface OverviewVerdict {
  total: number;
  sensored: number;
  outCount: number;
  pill: "good" | "bad" | null;
  pillLabel: string;
}

function hasReading(h: SensorLike): boolean {
  return h.device_id !== null && h.last_temp_f !== null && h.last_humidity !== null;
}

export function isHumidorOut(h: SensorLike): boolean {
  if (!hasReading(h)) return false;
  const reading: SensorReading = { tempF: h.last_temp_f as number, humidity: h.last_humidity as number };
  const cfg: ThresholdConfig = {
    humidityMin: h.humidity_min, humidityMax: h.humidity_max,
    tempMinF: h.temp_min_f, tempMaxF: h.temp_max_f,
  };
  return isMetricOutOfRange(reading, cfg, "temp") || isMetricOutOfRange(reading, cfg, "humidity");
}

export function deriveOverview(humidors: SensorLike[]): OverviewVerdict {
  const sensored = humidors.filter(hasReading);
  const outCount = sensored.filter(isHumidorOut).length;
  if (sensored.length === 0) {
    return { total: humidors.length, sensored: 0, outCount: 0, pill: null, pillLabel: "" };
  }
  const pillLabel = outCount === 0
    ? "All in range"
    : `${outCount} ${outCount === 1 ? "needs" : "need"} attention`;
  return { total: humidors.length, sensored: sensored.length, outCount, pill: outCount === 0 ? "good" : "bad", pillLabel };
}

export function humidorsTitle(count: number): string {
  return count >= 2 ? "My Humidors" : "My Humidor";
}
```

- [ ] **Step 4: Run** — `npx vitest run lib/humidor` → all PASS.
- [ ] **Step 5: Commit** — `git add lib/humidor && git commit -m "feat: humidor overview verdict + title pluralization"`

---

### Task 3: Humidors client data layer

**Files:**
- Create: `lib/data/humidors.ts`
- Modify: `lib/data/keys.ts` (add key after `goveeStatus`)
- Test: `lib/data/__tests__/humidors.test.ts` (error-mapping only; fetchers follow the untested repo convention)

**Interfaces:**
- Consumes: `createClient` from `@/utils/supabase/client` (same as `lib/data/humidor-fetchers.ts`).
- Produces (consumed by Tasks 6-11):

```ts
export interface Humidor extends SensorLike {   // SensorLike from lib/humidor/overview
  id: string; user_id: string; name: string;
  type: "humidor" | "tupperdor" | "cooler" | "travel";
  is_default: boolean; created_at: string;
}
export const HUMIDOR_COLUMNS: string; // select string, all columns above
export class HumidorLimitReachedError extends Error {}   // P0001 humidors_free_tier_limit
export function fetchHumidors(userId: string): Promise<Humidor[]>;           // ordered is_default desc, created_at asc
export function createHumidor(userId: string, name: string, type: Humidor["type"]): Promise<Humidor>;
export function updateHumidor(humidorId: string, patch: { name?: string; type?: Humidor["type"]; humidity_min?: number; humidity_max?: number; temp_min_f?: number; temp_max_f?: number }): Promise<void>;
export function deleteHumidor(humidorId: string, destId: string): Promise<void>;  // rpc delete_humidor
export function ensureDefaultHumidor(userId: string): Promise<Humidor>;      // select default; insert if missing; on unique-violation re-select
// keys.ts: humidors: (userId: string) => ["humidors", userId] as const
```

- [ ] **Step 1: Write the failing error-mapping tests**

```ts
import { describe, expect, test } from "vitest";
import { mapHumidorInsertError, HumidorLimitReachedError } from "../humidors";

describe("mapHumidorInsertError", () => {
  test("free-limit P0001 maps to HumidorLimitReachedError", () => {
    const err = { code: "P0001", message: "humidors_free_tier_limit" };
    expect(mapHumidorInsertError(err)).toBeInstanceOf(HumidorLimitReachedError);
  });
  test("other errors pass through as generic Error with message", () => {
    const err = { code: "23505", message: "duplicate key" };
    const mapped = mapHumidorInsertError(err);
    expect(mapped).toBeInstanceOf(Error);
    expect(mapped).not.toBeInstanceOf(HumidorLimitReachedError);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run lib/data` → FAIL.

- [ ] **Step 3: Implement `lib/data/humidors.ts`**

```ts
"use client";

/* Humidor containers: client-side reads/writes under own-row RLS,
   mirroring lib/data/humidor-fetchers.ts. Free-tier 1-humidor limit
   enforced by DB trigger (humidors_free_tier_limit) + upsell UI.
   Deletion goes through the delete_humidor RPC (atomic move+delete). */

import { createClient } from "@/utils/supabase/client";
import type { SensorLike } from "@/lib/humidor/overview";

export interface Humidor extends SensorLike {
  id: string; user_id: string; name: string;
  type: "humidor" | "tupperdor" | "cooler" | "travel";
  is_default: boolean; created_at: string;
}

export const HUMIDOR_COLUMNS =
  "id, user_id, name, type, is_default, device_id, sku, device_name, " +
  "humidity_min, humidity_max, temp_min_f, temp_max_f, " +
  "last_temp_f, last_humidity, last_reading_at, sensor_status, alert_state, created_at";

export class HumidorLimitReachedError extends Error {
  constructor() { super("humidors_free_tier_limit"); }
}

export function mapHumidorInsertError(err: { code?: string; message?: string }): Error {
  if (err.code === "P0001" && (err.message ?? "").includes("humidors_free_tier_limit")) {
    return new HumidorLimitReachedError();
  }
  return new Error(err.message ?? "Something went wrong.");
}

export async function fetchHumidors(userId: string): Promise<Humidor[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("humidors").select(HUMIDOR_COLUMNS)
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Humidor[];
}

export async function createHumidor(
  userId: string, name: string, type: Humidor["type"],
): Promise<Humidor> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("humidors")
    .insert({ user_id: userId, name: name.trim().slice(0, 40), type })
    .select(HUMIDOR_COLUMNS).single();
  if (error) throw mapHumidorInsertError(error);
  return data as unknown as Humidor;
}

export async function updateHumidor(
  humidorId: string,
  patch: Partial<Pick<Humidor, "name" | "type" | "humidity_min" | "humidity_max" | "temp_min_f" | "temp_max_f">>,
): Promise<void> {
  const supabase = createClient();
  const clean = { ...patch };
  if (clean.name !== undefined) clean.name = clean.name.trim().slice(0, 40);
  const { error } = await supabase.from("humidors").update(clean).eq("id", humidorId);
  if (error) throw new Error(error.message);
}

export async function deleteHumidor(humidorId: string, destId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("delete_humidor", {
    p_humidor_id: humidorId, p_dest_id: destId,
  });
  if (error) throw new Error(error.message);
}

/* Lazy default for brand-new users (backfill covers existing ones).
   The one-default-per-user partial unique index makes a concurrent
   double-create safe: the loser re-selects. */
export async function ensureDefaultHumidor(userId: string): Promise<Humidor> {
  const supabase = createClient();
  const { data } = await supabase
    .from("humidors").select(HUMIDOR_COLUMNS)
    .eq("user_id", userId).eq("is_default", true).maybeSingle();
  if (data) return data as unknown as Humidor;

  const { data: created, error } = await supabase
    .from("humidors")
    .insert({ user_id: userId, name: "My Humidor", is_default: true })
    .select(HUMIDOR_COLUMNS).single();
  if (!error && created) return created as unknown as Humidor;

  const { data: retry, error: retryErr } = await supabase
    .from("humidors").select(HUMIDOR_COLUMNS)
    .eq("user_id", userId).eq("is_default", true).single();
  if (retryErr || !retry) throw new Error(retryErr?.message ?? "Could not create default humidor.");
  return retry as unknown as Humidor;
}
```

- [ ] **Step 4: Add the SWR key in `lib/data/keys.ts`** (after `goveeStatus`):

```ts
  /* ── Humidor containers (per-user; humidors table, own-row RLS).
   *   Shared by chips, conditions strips, sheets, and the home card. */
  humidors:      (userId: string) => ["humidors", userId] as const,
```

- [ ] **Step 5: Run** — `npx vitest run lib/data` PASS; `npx tsc --noEmit` clean.
- [ ] **Step 6: Commit** — `git add lib/data && git commit -m "feat: humidors client data layer + SWR key"`

---

### Task 4: Govee API surface rework (key management + assign/unassign)

**Files:**
- Modify: `lib/govee/types.ts` — replace `GoveeStatusResponse`/`DISCONNECTED_STATUS` with `GoveeKeyStatus`
- Modify: `lib/govee/server.ts` — drop `rowToStatus`/`CONNECTION_COLUMNS`, keep gate + client helpers
- Modify: `app/api/govee/connection/route.ts` — GET returns key status; POST saves key only (validates via device list); DELETE disconnects key AND clears all sensor assignments; PATCH removed
- Modify: `app/api/govee/devices/route.ts` — response marks already-assigned devices
- Create: `app/api/govee/assign/route.ts` — POST assign `{ humidorId, deviceId, sku, deviceName }` / DELETE unassign `{ humidorId }`

**Interfaces:**
- Consumes: `requireMemberUser`, `goveeServiceClient` (unchanged in `lib/govee/server.ts`), `listSensorDevices`, `fetchSensorReading`, `GoveeAuthError`, `SUPPORTED_SENSOR_SKUS` (`lib/govee/api.ts`, unchanged), `checkRateLimit`.
- Produces (consumed by Tasks 7, 11):

```ts
// lib/govee/types.ts
export interface GoveeKeyStatus { keyConnected: boolean; keyStatus: "active" | "auth_error" | null }
// Route contract:
// GET  /api/govee/connection            -> GoveeKeyStatus
// POST /api/govee/connection {apiKey}   -> GoveeKeyStatus (validates key via listSensorDevices; upserts user_id+api_key+status='active')
// DELETE /api/govee/connection          -> { ok: true } (deletes key row; nulls device_id/sku/device_name/sensor_status and resets alert_state on ALL the user's humidors)
// POST /api/govee/devices {} (no body)  -> { devices: Array<GoveeDevice & { assignedHumidorId: string | null }> } (uses the STORED key; 409 {error} if no key connected)
// POST /api/govee/assign {humidorId, deviceId, sku, deviceName} -> { ok: true } (validates: member, humidor ownership, sku supported, device in account list, device not assigned to another humidor; seeds one immediate reading)
// DELETE /api/govee/assign {humidorId} -> { ok: true }
```

Note: `/api/govee/devices` changes from accepting a raw key to using the STORED key — the connect flow becomes: save key (POST connection) → list devices (POST devices) → assign (POST assign). The account section (Task 11) only saves the key; humidor sheets (Task 7) list + assign.

- [ ] **Step 1: Rewrite `lib/govee/types.ts`**

```ts
/* Client-safe Govee account-level status. Per-humidor sensor data
   now lives on the humidors table (own-row RLS) and is read directly
   by the client — see lib/data/humidors.ts. */
export interface GoveeKeyStatus {
  keyConnected: boolean;
  keyStatus: "active" | "auth_error" | null;
}
```

- [ ] **Step 2: Trim `lib/govee/server.ts`** — keep `goveeServiceClient` and `requireMemberUser` exactly as-is; delete `rowToStatus`, `CONNECTION_COLUMNS`, and the `ConnectionRow` interface.

- [ ] **Step 3: Rewrite `app/api/govee/connection/route.ts`**

```ts
/* /api/govee/connection — the user's Govee ACCOUNT link (API key).
     GET    -> GoveeKeyStatus
     POST   -> save { apiKey } after proving it lists devices
     DELETE -> forget the key and clear every sensor assignment
   Per-humidor sensor state lives on humidors (own-row RLS); see
   /api/govee/assign for assignment. All methods Member-gated. */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { listSensorDevices, GoveeAuthError } from "@/lib/govee/api";
import { requireMemberUser, goveeServiceClient } from "@/lib/govee/server";
import type { GoveeKeyStatus } from "@/lib/govee/types";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;
  const supabase = goveeServiceClient();
  const { data, error } = await supabase
    .from("govee_connections").select("status")
    .eq("user_id", gate.userId).maybeSingle();
  if (error) {
    console.error("[govee/connection] GET failed:", error.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  const body: GoveeKeyStatus = data
    ? { keyConnected: true, keyStatus: data.status as GoveeKeyStatus["keyStatus"] }
    : { keyConnected: false, keyStatus: null };
  return NextResponse.json(body);
}

export async function POST(request: NextRequest) {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  const rl = await checkRateLimit(gate.userId, { limit: 10, window: "1 h", prefix: "govee-connect" });
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let apiKey = "";
  try {
    const body = await request.json();
    apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  } catch { /* fall through */ }
  if (!apiKey || apiKey.length > 200) {
    return NextResponse.json({ error: "Enter your Govee API key." }, { status: 400 });
  }

  try {
    await listSensorDevices(apiKey); // proves the key works
  } catch (err) {
    if (err instanceof GoveeAuthError) {
      return NextResponse.json(
        { error: "That key didn't work. Double-check it in the Govee Home app." },
        { status: 400 },
      );
    }
    console.error("[govee/connection] key validation failed:", (err as Error).message);
    return NextResponse.json({ error: "Couldn't reach Govee. Try again in a minute." }, { status: 502 });
  }

  const supabase = goveeServiceClient();
  const { error } = await supabase
    .from("govee_connections")
    .upsert({ user_id: gate.userId, api_key: apiKey, status: "active" }, { onConflict: "user_id" });
  if (error) {
    console.error("[govee/connection] upsert failed:", error.message);
    return NextResponse.json({ error: "Something went wrong saving the key." }, { status: 500 });
  }
  return NextResponse.json({ keyConnected: true, keyStatus: "active" } satisfies GoveeKeyStatus);
}

export async function DELETE() {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;
  const supabase = goveeServiceClient();

  const { error: clearErr } = await supabase
    .from("humidors")
    .update({ device_id: null, sku: null, device_name: null, sensor_status: null, alert_state: {} })
    .eq("user_id", gate.userId)
    .not("device_id", "is", null);
  if (clearErr) {
    console.error("[govee/connection] sensor clear failed:", clearErr.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  const { error } = await supabase.from("govee_connections").delete().eq("user_id", gate.userId);
  if (error) {
    console.error("[govee/connection] DELETE failed:", error.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Rewrite `app/api/govee/devices/route.ts`**

```ts
/* POST /api/govee/devices — list the account's supported sensors
   using the STORED key, marking which are already assigned to one of
   the user's humidors. 409 when no key is connected yet. */

import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { listSensorDevices, GoveeAuthError } from "@/lib/govee/api";
import { requireMemberUser, goveeServiceClient } from "@/lib/govee/server";

export const runtime = "nodejs";

export async function POST() {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  const rl = await checkRateLimit(gate.userId, { limit: 20, window: "1 h", prefix: "govee-devices" });
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const supabase = goveeServiceClient();
  const { data: conn, error: connErr } = await supabase
    .from("govee_connections").select("api_key")
    .eq("user_id", gate.userId).maybeSingle();
  if (connErr) {
    console.error("[govee/devices] key lookup failed:", connErr.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  if (!conn) {
    return NextResponse.json(
      { error: "Connect your Govee account first in Account settings." },
      { status: 409 },
    );
  }

  const { data: assigned, error: assignedErr } = await supabase
    .from("humidors").select("id, device_id")
    .eq("user_id", gate.userId).not("device_id", "is", null);
  if (assignedErr) {
    console.error("[govee/devices] assigned lookup failed:", assignedErr.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  const byDevice = new Map((assigned ?? []).map((h) => [h.device_id as string, h.id as string]));

  try {
    const devices = await listSensorDevices(conn.api_key);
    return NextResponse.json({
      devices: devices.map((d) => ({ ...d, assignedHumidorId: byDevice.get(d.device) ?? null })),
    });
  } catch (err) {
    if (err instanceof GoveeAuthError) {
      await supabase.from("govee_connections")
        .update({ status: "auth_error" }).eq("user_id", gate.userId);
      return NextResponse.json(
        { error: "Govee rejected your API key. Reconnect it in Account settings." },
        { status: 400 },
      );
    }
    console.error("[govee/devices] list failed:", (err as Error).message);
    return NextResponse.json({ error: "Couldn't reach Govee. Try again in a minute." }, { status: 502 });
  }
}
```

- [ ] **Step 5: Create `app/api/govee/assign/route.ts`**

```ts
/* /api/govee/assign — attach/detach a Govee sensor to ONE humidor.
     POST   { humidorId, deviceId, sku, deviceName } -> { ok: true }
     DELETE { humidorId }                            -> { ok: true }
   Server-validated because assignment must check the account's real
   device list and cross-humidor uniqueness. Member-gated. */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { listSensorDevices, fetchSensorReading, GoveeAuthError, SUPPORTED_SENSOR_SKUS } from "@/lib/govee/api";
import { requireMemberUser, goveeServiceClient } from "@/lib/govee/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  const rl = await checkRateLimit(gate.userId, { limit: 20, window: "1 h", prefix: "govee-assign" });
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let body: { humidorId?: unknown; deviceId?: unknown; sku?: unknown; deviceName?: unknown };
  try { body = await request.json(); } catch { body = {}; }
  const humidorId  = typeof body.humidorId  === "string" ? body.humidorId  : "";
  const deviceId   = typeof body.deviceId   === "string" ? body.deviceId.trim() : "";
  const sku        = typeof body.sku        === "string" ? body.sku.trim() : "";
  const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim().slice(0, 100) : null;
  if (!humidorId || !deviceId || !SUPPORTED_SENSOR_SKUS.has(sku)) {
    return NextResponse.json({ error: "Pick a supported sensor." }, { status: 400 });
  }

  const supabase = goveeServiceClient();

  const { data: humidor, error: hErr } = await supabase
    .from("humidors").select("id")
    .eq("id", humidorId).eq("user_id", gate.userId).maybeSingle();
  if (hErr) {
    console.error("[govee/assign] humidor lookup failed:", hErr.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  if (!humidor) return NextResponse.json({ error: "Humidor not found." }, { status: 404 });

  const { data: conn } = await supabase
    .from("govee_connections").select("api_key")
    .eq("user_id", gate.userId).maybeSingle();
  if (!conn) {
    return NextResponse.json(
      { error: "Connect your Govee account first in Account settings." },
      { status: 409 },
    );
  }

  const { data: clash } = await supabase
    .from("humidors").select("id")
    .eq("user_id", gate.userId).eq("device_id", deviceId).neq("id", humidorId).maybeSingle();
  if (clash) {
    return NextResponse.json(
      { error: "That sensor is already assigned to another humidor." },
      { status: 409 },
    );
  }

  let reading;
  try {
    const devices = await listSensorDevices(conn.api_key);
    if (!devices.some((d) => d.device === deviceId && d.sku === sku)) {
      return NextResponse.json({ error: "That sensor isn't on your Govee account." }, { status: 400 });
    }
    reading = await fetchSensorReading(conn.api_key, sku, deviceId);
  } catch (err) {
    if (err instanceof GoveeAuthError) {
      await supabase.from("govee_connections")
        .update({ status: "auth_error" }).eq("user_id", gate.userId);
      return NextResponse.json(
        { error: "Govee rejected your API key. Reconnect it in Account settings." },
        { status: 400 },
      );
    }
    console.error("[govee/assign] validation failed:", (err as Error).message);
    return NextResponse.json({ error: "Couldn't reach Govee. Try again in a minute." }, { status: 502 });
  }

  const { error } = await supabase.from("humidors").update({
    device_id: deviceId, sku, device_name: deviceName,
    sensor_status: "active", alert_state: {},
    last_temp_f: reading?.tempF ?? null,
    last_humidity: reading?.humidity ?? null,
    last_reading_at: reading ? new Date().toISOString() : null,
  }).eq("id", humidorId);
  if (error) {
    console.error("[govee/assign] update failed:", error.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  let humidorId = "";
  try {
    const body = await request.json();
    humidorId = typeof body?.humidorId === "string" ? body.humidorId : "";
  } catch { /* fall through */ }
  if (!humidorId) return NextResponse.json({ error: "Missing humidor." }, { status: 400 });

  const supabase = goveeServiceClient();
  const { error } = await supabase.from("humidors").update({
    device_id: null, sku: null, device_name: null,
    sensor_status: null, alert_state: {},
    last_temp_f: null, last_humidity: null, last_reading_at: null,
  }).eq("id", humidorId).eq("user_id", gate.userId);
  if (error) {
    console.error("[govee/assign] unassign failed:", error.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Verify** — `npx tsc --noEmit` will FAIL at this point: `components/govee/useGoveeStatus.ts`, `HumidorConditions.tsx`, `HumidorSensorSection.tsx`, and `client-islands.tsx` still import the old `GoveeStatusResponse`. That is EXPECTED mid-branch; note it in the report (Tasks 6, 10, 11 fix the consumers). Run `npx vitest run lib/govee` — must PASS (api/thresholds tests unaffected).
- [ ] **Step 7: Commit** — `git add lib/govee app/api/govee && git commit -m "feat: govee api rework: account key + per-humidor assign/unassign"`

---

### Task 5: Cron rework

**Files:**
- Modify: `app/api/cron/govee-poll/route.ts`

**Interfaces:**
- Consumes: `evaluateReading`/`AlertState`/`ThresholdAlert` (unchanged), `fetchSensorReading`/`GoveeAuthError` (unchanged), `sendPushToUser`, `startCronRun`/`finishCronRun`.
- Behavior: polls every humidor with `device_id` set and `sensor_status = 'active'` whose owner has an active key; per-HUMIDOR isolation; auth error marks `govee_connections.status='auth_error'` AND `sensor_status='auth_error'` on that user's sensored humidors (pauses all); alert body prefixed with humidor name; tag `govee-${humidorId}-${metric}`.

- [ ] **Step 1: Rewrite the data plumbing in `app/api/cron/govee-poll/route.ts`** — keep `isAuthorized`, `runtime`, cron-log usage, `BATCH_SIZE`, and the overall handler shape from the current file; replace `ConnectionRow`, `alertBody`, `pollOne`, and the query:

```ts
interface SensoredHumidor {
  id: string; user_id: string; name: string;
  device_id: string; sku: string;
  humidity_min: number; humidity_max: number;
  temp_min_f: number; temp_max_f: number;
  alert_state: AlertState | null;
  api_key: string;                    // joined from govee_connections
}

/* User-facing push copy. NO EM DASHES. */
function alertBody(a: ThresholdAlert, h: SensoredHumidor): string {
  const value = Math.round(a.value * 10) / 10;
  const verb = a.direction === "low" ? "dropped" : "rose";
  if (a.metric === "humidity") {
    return `${h.name} humidity ${verb} to ${value}%. Your range is ${h.humidity_min} to ${h.humidity_max}%.`;
  }
  return `${h.name} temperature ${verb} to ${value}°F. Your range is ${h.temp_min_f} to ${h.temp_max_f}°F.`;
}
```

Query (replaces the `govee_connections` select in `handle`):

```ts
    const { data: conns, error: connErr } = await supabase
      .from("govee_connections")
      .select("user_id, api_key")
      .eq("status", "active");
    if (connErr) { /* finishCronRun fail + 500, as today */ }

    const keyByUser = new Map((conns ?? []).map((c) => [c.user_id as string, c.api_key as string]));
    const userIds = [...keyByUser.keys()];

    let list: SensoredHumidor[] = [];
    if (userIds.length > 0) {
      const { data: hums, error: humErr } = await supabase
        .from("humidors")
        .select("id, user_id, name, device_id, sku, humidity_min, humidity_max, temp_min_f, temp_max_f, alert_state")
        .in("user_id", userIds)
        .not("device_id", "is", null)
        .eq("sensor_status", "active");
      if (humErr) { /* finishCronRun fail + 500 */ }
      list = (hums ?? []).map((h) => ({ ...h, api_key: keyByUser.get(h.user_id as string) as string })) as SensoredHumidor[];
    }
```

`pollOne` changes (same structure as current, per humidor):
- reads via `fetchSensorReading(h.api_key, h.sku, h.device_id)`
- `GoveeAuthError` → set `govee_connections.status='auth_error'` for `h.user_id` AND `humidors.sensor_status='auth_error'` for all that user's rows with `device_id not null` (log both errors if the marks fail); return `"auth_error"`.
- `null` reading → `humidors.sensor_status='device_missing'` on `h.id`; return `"device_missing"`.
- success → update `humidors` row `h.id` (`last_temp_f`, `last_humidity`, `last_reading_at`, `alert_state`, `sensor_status: "active"`); on write error log + return `"transient"` WITHOUT sending alerts (preserves the no-spam guarantee from #582).
- alerts loop: `sendPushToUser(h.user_id, { title: "Humidor Alert", body: alertBody(a, h), url: "/humidor", tag: \`govee-${h.id}-${a.metric}\` }, "humidor_sensor")`, per-alert try/catch as today.
- Summary counts unchanged (`polled/alerted/auth_errors/device_missing/transient`).

- [ ] **Step 2: Verify** — `npx tsc --noEmit` (cron file itself clean; consumer errors from Task 4 remain until Task 6). `npx vitest run lib/govee` PASS.
- [ ] **Step 3: Commit** — `git add app/api/cron/govee-poll && git commit -m "feat: govee poll cron reads per-humidor sensors, alerts name the humidor"`

---

### Task 6: useHumidors hook + HumidorConditions rewrite (single + aggregate)

**Files:**
- Create: `components/humidor/useHumidors.ts`
- Rewrite: `components/govee/HumidorConditions.tsx`
- Delete: `components/govee/useGoveeStatus.ts`

**Interfaces:**
- Consumes: `fetchHumidors`/`Humidor` (Task 3), `keyFor.humidors`, `deriveOverview`/`isHumidorOut`/`SensorLike` (Task 2), `useSWR`.
- Produces (consumed by Tasks 7, 8, 10):

```ts
// components/humidor/useHumidors.ts
export function useHumidors(userId: string | null): {
  humidors: Humidor[] | undefined;
  mutate: () => Promise<unknown>;
};
// components/govee/HumidorConditions.tsx
export function HumidorConditions(props: {
  userId: string;
  /* null/undefined -> aggregate-or-single auto mode; a humidor id -> that humidor only */
  humidorId?: string | null;
  /* edit affordance callback; when provided, ✎ renders (humidor page). Home omits it. */
  onEdit?: (humidorId: string) => void;
  /* row tap -> filter callback (humidor page aggregate rows). */
  onSelect?: (humidorId: string) => void;
}): JSX.Element | null;
```

Behavior matrix (from the approved mockup):
- 0 sensored humidors AND no humidorId → render null (nothing on home/humidor).
- humidorId given → single strip for that humidor: eyebrow + name + In range / Needs attention / No sensor pill + Temp/RH metric grid (ember on out metric) + "as of Xm ago" / "sensor not reporting" (>45 min) / "reconnect needed" (`sensor_status !== 'active'`) + ✎ when onEdit.
- no humidorId, exactly 1 sensored humidor → single strip for it (home card 1-sensor case).
- no humidorId, 2+ humidors → aggregate: collapsed by default, "N humidors" + verdict pill (`deriveOverview`), caret; expanded rows: name (serif italic), count via `counts` prop — see below — temp/RH with out metric in ember, "no sensor" label, ✎ when onEdit, row onClick → onSelect.

Because cigar counts live with the items data (not on humidors), the aggregate rows take counts through an optional prop: `counts?: Map<string, number>` (humidorId → cigar count). Humidor page passes it (it already holds items); home omits it (rows show name + readings only).

- [ ] **Step 1: Write `components/humidor/useHumidors.ts`**

```tsx
"use client";

import useSWR from "swr";
import { keyFor } from "@/lib/data/keys";
import { fetchHumidors, type Humidor } from "@/lib/data/humidors";

/* One SWR entry for the user's humidors (own-row RLS read; no API
   route, no member gate needed — free users simply have one row). */
export function useHumidors(userId: string | null) {
  const { data, mutate } = useSWR(
    userId ? keyFor.humidors(userId) : null,
    () => fetchHumidors(userId as string),
  );
  return { humidors: data, mutate };
}
```

- [ ] **Step 2: Rewrite `components/govee/HumidorConditions.tsx`** — complete component:

```tsx
"use client";

import { useState } from "react";
import { useHumidors } from "@/components/humidor/useHumidors";
import { deriveOverview, isHumidorOut } from "@/lib/humidor/overview";
import { isMetricOutOfRange, type SensorReading, type ThresholdConfig } from "@/lib/govee/thresholds";
import type { Humidor } from "@/lib/data/humidors";

const STALE_AFTER_MS = 45 * 60_000;

function agoLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function cfgOf(h: Humidor): ThresholdConfig {
  return { humidityMin: h.humidity_min, humidityMax: h.humidity_max, tempMinF: h.temp_min_f, tempMaxF: h.temp_max_f };
}
function readingOf(h: Humidor): SensorReading | null {
  if (h.last_temp_f === null || h.last_humidity === null) return null;
  return { tempF: h.last_temp_f, humidity: h.last_humidity };
}
function metaLabel(h: Humidor): string {
  if (h.sensor_status !== "active") return "reconnect needed";
  if (!h.last_reading_at) return "";
  if (Date.now() - Date.parse(h.last_reading_at) > STALE_AFTER_MS) return "sensor not reporting";
  return `as of ${agoLabel(h.last_reading_at)}`;
}

const eyebrowStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.28em",
  textTransform: "uppercase", color: "var(--muted-foreground)",
  display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
};
const sectionStyle: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 6,
  background: "var(--card)", padding: "12px 14px",
};
const pillStyle = (bad: boolean): React.CSSProperties => ({
  fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
  color: bad ? "var(--ember)" : "var(--moss, #8fa36a)",
  background: bad ? "rgba(232,100,44,0.14)" : "rgba(143,163,106,0.12)",
});

function Metric({ label, value, out }: { label: string; value: string; out: boolean }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em",
                    textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, lineHeight: 1,
                    color: out ? "var(--ember)" : "var(--foreground)" }}>
        {value}
      </div>
    </div>
  );
}

function EditPencil({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Edit humidor"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ background: "none", border: "none", color: "var(--muted-foreground)",
               fontSize: 14, cursor: "pointer", padding: "4px 6px" }}
    >
      ✎
    </button>
  );
}

function SingleStrip({ h, onEdit }: { h: Humidor; onEdit?: (id: string) => void }) {
  const reading = readingOf(h);
  const hasSensor = h.device_id !== null;
  const out = isHumidorOut(h);
  return (
    <section aria-label="Humidor conditions" style={sectionStyle}>
      <div style={eyebrowStyle}>
        <span aria-hidden="true" style={{ width: 18, height: 1, background: "var(--gold)" }} />
        Humidor Conditions
        <span style={{ marginLeft: "auto", letterSpacing: "0.05em", textTransform: "none" }}>
          {hasSensor ? metaLabel(h) : ""}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 19, color: "var(--foreground)" }}>
          {h.name}
        </span>
        <span style={{ display: "flex", alignItems: "center" }}>
          {hasSensor && reading
            ? <span style={pillStyle(out)}>{out ? "Needs attention" : "In range"}</span>
            : <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>No sensor</span>}
          {onEdit && <EditPencil onClick={() => onEdit(h.id)} />}
        </span>
      </div>
      {hasSensor && reading && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, paddingTop: 12 }}>
          <Metric label="Temp" value={`${Math.round(reading.tempF)}°F`}
                  out={isMetricOutOfRange(reading, cfgOf(h), "temp")} />
          <Metric label="Humidity" value={`${Math.round(reading.humidity)}%`}
                  out={isMetricOutOfRange(reading, cfgOf(h), "humidity")} />
        </div>
      )}
    </section>
  );
}

export function HumidorConditions({
  userId, humidorId, onEdit, onSelect, counts,
}: {
  userId: string;
  humidorId?: string | null;
  onEdit?: (humidorId: string) => void;
  onSelect?: (humidorId: string) => void;
  counts?: Map<string, number>;
}) {
  const { humidors } = useHumidors(userId);
  const [expanded, setExpanded] = useState(false);
  if (!humidors || humidors.length === 0) return null;

  if (humidorId) {
    const h = humidors.find((x) => x.id === humidorId);
    return h ? <SingleStrip h={h} onEdit={onEdit} /> : null;
  }

  const v = deriveOverview(humidors);
  if (humidors.length === 1) {
    /* one humidor: single strip when it has a sensor, else nothing
       (matches the pre-multi-humidor behavior exactly) */
    return humidors[0].device_id ? <SingleStrip h={humidors[0]} onEdit={onEdit} /> : null;
  }
  if (v.sensored === 0 && !onEdit) return null; // home: nothing to show

  return (
    <section
      aria-label="Humidor conditions"
      style={{ ...sectionStyle, cursor: "pointer" }}
      onClick={() => setExpanded((e) => !e)}
    >
      <div style={eyebrowStyle}>
        <span aria-hidden="true" style={{ width: 18, height: 1, background: "var(--gold)" }} />
        Humidor Conditions
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 19, color: "var(--foreground)" }}>
          {v.total} humidors
        </span>
        <span>
          {v.pill && <span style={pillStyle(v.pill === "bad")}>{v.pillLabel}</span>}
          <span aria-hidden="true" style={{ color: "var(--muted-foreground)", fontSize: 12, marginLeft: 8,
            display: "inline-block", transition: "transform .25s",
            transform: expanded ? "rotate(180deg)" : "none" }}>▾</span>
        </span>
      </div>
      {expanded && (
        <div style={{ paddingTop: 10 }}>
          {humidors.map((h) => {
            const reading = readingOf(h);
            const out = isHumidorOut(h);
            return (
              <div
                key={h.id}
                onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(h.id); } : undefined}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 2px",
                         borderTop: "1px solid var(--border)",
                         cursor: onSelect ? "pointer" : "default" }}
              >
                <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 17,
                               flex: "1 1 auto", minWidth: 0, color: "var(--foreground)" }}>
                  {h.name}
                </span>
                {counts && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>
                    {counts.get(h.id) ?? 0} cigars
                  </span>
                )}
                {h.device_id && reading ? (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--foreground)" }}>
                    {Math.round(reading.tempF)}°F ·{" "}
                    <span style={{ color: out ? "var(--ember)" : undefined, fontWeight: out ? 700 : 400 }}>
                      {Math.round(reading.humidity)}%
                    </span>
                  </span>
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>
                    no sensor
                  </span>
                )}
                {onEdit && <EditPencil onClick={() => onEdit(h.id)} />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Delete `components/govee/useGoveeStatus.ts`** (its consumers are rewritten in this task and Tasks 10-11).
- [ ] **Step 4: Verify** — `npx tsc --noEmit`: remaining errors must ONLY be in `client-islands.tsx` and `HumidorSensorSection.tsx` (fixed in Tasks 10-11); none in the new/rewritten files. `npx vitest run lib` PASS.
- [ ] **Step 5: Commit** — `git add components/humidor/useHumidors.ts components/govee && git commit -m "feat: humidor conditions strip: single + collapsed aggregate modes"`

---

### Task 7: HumidorSheet (create / edit / delete / upsell)

**Files:**
- Create: `components/humidor/HumidorSheet.tsx`

**Interfaces:**
- Consumes: `BottomSheet` (`components/ui/BottomSheet`, props `{open, onClose, ariaLabel, children}`), `createHumidor`/`updateHumidor`/`deleteHumidor`/`HumidorLimitReachedError`/`Humidor` (Task 3), `validateThresholds` (`lib/govee/thresholds`), `jsonFetcher`-style `fetch` for `/api/govee/devices` + `/api/govee/assign` (Task 4 contract), `useHumidors().mutate` passed in.
- Produces (consumed by Task 8):

```tsx
export function HumidorSheet(props: {
  open: boolean;
  onClose: () => void;
  userId: string;
  tier: string;                       // "free" -> upsell variant
  humidors: Humidor[];                // current list (for delete destinations + limit check)
  editing: Humidor | null;            // null -> create mode
  onChanged: () => Promise<unknown>;  // mutate humidors after any write
  onToast: (msg: string) => void;
}): JSX.Element;
```

Behavior (from the approved mockup):
- `tier === "free"` and create mode → upsell body: "More humidors, more room" copy + "Multiple humidors is a Member perk." + Upgrade link to `/account?tab=membership`. No form.
- Create: name input (16px), type chip picker (Humidor/Tupperdor/Cooler/Travel), sensor section (only when the user's Govee key is connected: lazily POST `/api/govee/devices` on open; list unassigned devices + "No sensor for now"; devices with `assignedHumidorId !== null` hidden), Create button → `createHumidor` then optional `/api/govee/assign` POST → `onChanged()` → toast "«name» created" → close. `HumidorLimitReachedError` → switch to upsell body.
- Edit: same fields prefilled from `editing`; sensor section shows current assignment (✓) + other unassigned devices + "No sensor" (selecting it → DELETE `/api/govee/assign`); alert-range grid (four numeric inputs, client `validateThresholds`); Save → `updateHumidor` (+ assign/unassign call if the sensor selection changed) → `onChanged()` → toast → close.
- Delete (edit mode, non-default only): "Delete Humidor" (ember) expands the destination panel: "Move N cigars to" + list of the OTHER humidors (default first, preselected) + "Move Cigars & Delete" → `deleteHumidor(editing.id, destId)` → `onChanged()` → toast → close. The default humidor renders no delete affordance. N comes from a `cigarCount` prop? — No: pass `counts` is not needed; the sheet receives `deleteCount: number` via props from Task 8 (which owns the items array). Add to props: `deleteCount?: number` (shown in the panel title; defaults to 0).
- All copy em-dash-free. Errors → `onToast(err.message)`.

Implementation notes for the engineer:
- Follow `HumidorSensorSection.tsx` (current file) for the card/input/button inline-style vocabulary and the `postJson` helper — copy that helper into this file.
- Local state: `name`, `type`, `sensorSel` (`{ device, sku, deviceName } | "none"`), `devices` (fetched list or null), `draftRanges` (null until edited), `deleteOpen`, `destId`, `busy`. Reset ALL local state when `open` flips true (derive initial values from `editing` in a `useEffect` keyed on `[open, editing?.id]`) — the sheet is always-mounted (BottomSheet contract), so stale state across opens is the bug class to avoid (this exact class bit us in #582's review).
- Sensor section only renders when at least the key is connected; determine via a lazy POST to `/api/govee/devices` when the sheet opens for a Member: a 409 response means "no key" → render a hint linking to `/account` instead of the picker.

- [ ] **Step 1: Implement the component per the contract above** (single file, ~300 lines; complete state machine, no TODOs).
- [ ] **Step 2: Verify** — `npx tsc --noEmit` (no errors in this file), `npx eslint components/humidor/HumidorSheet.tsx` clean.
- [ ] **Step 3: Commit** — `git add components/humidor/HumidorSheet.tsx && git commit -m "feat: humidor create/edit/delete bottom sheet with sensor assignment"`

---

### Task 8: HumidorClient integration

**Files:**
- Modify: `components/humidor/HumidorClient.tsx`

**Interfaces:**
- Consumes: `useHumidors` (Task 6), `HumidorConditions` (Task 6), `HumidorSheet` (Task 7), `humidorsTitle` (Task 2), `Humidor` (Task 3). `HumidorItem` gains `humidor_id: string | null` (Task 9 updates the fetcher select; this task adds the field to the local `HumidorItem` interface and uses it).

Changes (each keyed to current code verified this session):
1. **State**: add `const [selected, setSelected] = useState<string>("all")` (humidorId or "all"; reset to "all" if the id disappears after a delete), `const [sheetOpen, setSheetOpen] = useState(false)`, `const [editingHumidor, setEditingHumidor] = useState<Humidor | null>(null)`. Add `const { humidors, mutate: mutateHumidors } = useHumidors(userId)`. `const multi = (humidors?.length ?? 0) >= 2`.
2. **Title** (Row 2, currently literal `My Humidor`): `humidorsTitle(humidors?.length ?? 1)`.
3. **Chip row**: new row inside the fixed header's `max-w-6xl` wrapper, after Row 2. When `multi`: horizontally scrollable chips — All + one per humidor (name) + dashed "+ New"; active chip = `selected`. When not `multi`: single dashed "+ New Humidor" chip. Chip styles: `fontSize 13, padding "8px 14px", borderRadius 999`, active = `background var(--secondary), color var(--foreground), borderColor var(--gold)`, inactive = `border 1px solid var(--border), color var(--muted-foreground)`; dashed variant `borderStyle: "dashed", color: "var(--gold)"`. "+ New" → `setEditingHumidor(null); setSheetOpen(true)`.
4. **Row 3 (sort/view) moves out of the header**: delete the Row 3 block from the fixed header; render the identical block as the SECOND child of the content container (`max-w-6xl mx-auto px-4 sm:px-6 py-4`), directly after the conditions strip wrapper, with `className="flex items-center gap-3 pb-3"` → `style={{ marginBottom: 12 }}` wrapper. The `ResizeObserver`-measured `headerHeight` self-adjusts; no other header math changes.
5. **Conditions strip** (replaces the #582 `<HumidorConditions userId={userId} />` wrapper): `<HumidorConditions userId={userId} humidorId={selected === "all" ? null : selected} counts={countsByHumidor} onSelect={(id) => setSelected(id)} onEdit={(id) => { const h = humidors?.find(x => x.id === id) ?? null; setEditingHumidor(h); setSheetOpen(true); }} />` — keep the `empty:hidden` wrapper.
   `countsByHumidor`: `useMemo(() => { const m = new Map<string, number>(); for (const i of items) if (i.humidor_id) m.set(i.humidor_id, (m.get(i.humidor_id) ?? 0) + i.quantity); return m; }, [items])`.
6. **Filtering**: `const visible = useMemo(() => selected === "all" ? items : items.filter(i => i.humidor_id === selected), [items, selected]);` then `displayed = sortItems(visible, sort)`. Count/value line computes over `visible` (so a filtered view reads "8 cigars in Tupperdor": when `selected !== "all"`, append ` in ${name}` and drop the Est. value only if you must — keep value, computed over `visible`). Empty-state when `visible.length === 0` but `items.length > 0`: render a small inline "No cigars in this humidor yet." message instead of the full `<EmptyState>`.
7. **Humidor tag on cards**: in All view with `multi`, GridCard/ListRow show a small tag line (`fontFamily var(--font-mono), fontSize 10, color var(--gold)`) with the humidor name — pass `tagName?: string` as a new optional prop to both card components and render it under the existing name/brand block. Look up via a `nameById` map memoized from `humidors`.
8. **Sheet mount** (next to the existing sheets at the bottom): `<HumidorSheet open={sheetOpen} onClose={() => setSheetOpen(false)} userId={userId} tier={tier} humidors={humidors ?? []} editing={editingHumidor} deleteCount={editingHumidor ? (countsByHumidor.get(editingHumidor.id) ?? 0) : 0} onChanged={async () => { await mutateHumidors(); if (selected !== "all" && !(humidors ?? []).some(h => h.id === selected)) setSelected("all"); }} onToast={setToastOrEquivalent} />`. Tier: HumidorClient has no tier today — read it the same way `useGoveeStatus` did: `useSWR(keyFor.profile(userId), () => fetchProfileLite(userId))` → `getMembershipTier(profile)`; pass `"free"` until loaded. Toast: HumidorClient has no toast state today — add the same minimal toast pattern used in `AccountClient` (`useState<string | null>` + the existing `components/ui/toast` component if importable, else a fixed-position div above the nav; check `components/ui/toast.tsx` and reuse).
9. **selected persistence**: none (session state only, resets to All on reload — matches mockup intent; localStorage can come later).

- [ ] **Step 1: Implement all 9 changes.**
- [ ] **Step 2: Verify** — `npm run build` (route `/humidor` still `○`), `npm run check:shells` green, `npx tsc --noEmit` (remaining errors only in `client-islands.tsx` / `HumidorSensorSection.tsx`), manual sanity: with the humidors SWR returning 1 row the header shows "My Humidor", no chip row except dashed + New, strip identical to pre-branch behavior.
- [ ] **Step 3: Commit** — `git add components/humidor components/ui && git commit -m "feat: humidor page chips, aggregate strip, sheet wiring, sort row relocation"`

---

### Task 9: Item assignment (fetcher + add flow)

**Files:**
- Modify: `lib/data/humidor-fetchers.ts` — `fetchHumidorItems` select gains `humidor_id`; `HumidorItem` type gains `humidor_id: string | null` (type lives where the fetcher's row type is defined — follow the import in `HumidorClient.tsx`).
- Modify: `lib/humidor/add-item.ts` — `HumidorInsertPayload` gains `humidor_id?: string | null`.
- Modify: `components/cigars/AddToHumidorSheet.tsx` — humidor picker + payload.

**Interfaces:**
- Consumes: `useHumidors`, `ensureDefaultHumidor` (Task 3).
- Produces: `AddToHumidorSheetProps` gains `defaultHumidorId?: string | null` (Task 8's caller passes `selected === "all" ? null : selected`; other callers pass nothing).

Changes:
1. `fetchHumidorItems` select string: prepend `humidor_id, ` to the existing columns. Update the `HumidorItem` interface accordingly.
2. `HumidorInsertPayload`: add `humidor_id?: string | null;` — the insert passes the payload straight through, so no other change in `add-item.ts`.
3. `AddToHumidorSheet`:
   - Get the current user's humidors via `useHumidors(userIdWhenOpen)` — the sheet already resolves the user before insert; reuse that id, or accept `userId` from useAppSession as the other client components do (match whatever the file already does to get `user.id`).
   - Picker UI (only when ≥2 humidors): a labeled select ("Humidor") above the quantity field, options = humidor names, initial value = `defaultHumidorId ?? default humidor's id`. With 1 humidor: no picker rendered.
   - On submit: `const humidorId = pickedId ?? (await ensureDefaultHumidor(user.id)).id;` and add `humidor_id: humidorId` to the `addHumidorItem` payload. (`ensureDefaultHumidor` covers brand-new users with zero humidors.)
   - The "add to existing row" quantity-update path is unchanged (row keeps its humidor).
4. Grep for other `addHumidorItem(` call sites (`components/humidor/AddCigarSheet.tsx`, `components/humidor/WishlistClient.tsx` per this session's scout; re-grep to confirm) — each non-wishlist insert adds `humidor_id: (await ensureDefaultHumidor(user.id)).id` when the component has no picker (wishlist inserts stay `humidor_id`-less).

- [ ] **Step 1: Implement.** 
- [ ] **Step 2: Verify** — `npx tsc --noEmit` (no NEW errors), `npm run test:unit` PASS, `npm run build` OK.
- [ ] **Step 3: Commit** — `git add lib components && git commit -m "feat: cigars carry humidor_id; add flows pick or default the humidor"`

---

### Task 10: Home dashboard card

**Files:**
- Modify: `app/(app)/home/client-islands.tsx`

Changes:
- `GoveeSensorIsland`: renders `<HumidorConditions userId={session.userId} />` (no humidorId, no onEdit/onSelect/counts) — the component internally does: 1 sensored humidor → direct reading; 2+ humidors → collapsed aggregate; nothing sensored → null.
- `DashboardPagerIsland`: replace `useGoveeStatus` with `useHumidors(userId)`; `const showSensor = (humidors ?? []).some(h => h.device_id !== null && h.last_temp_f !== null && h.last_humidity !== null);` — same conditional-slide pattern (null child dropped by `Children.toArray`).
- Imports: swap `useGoveeStatus` for `useHumidors`; `HumidorConditions` import path unchanged.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** — `npm run build` (`/home` still `○`), `npm run check:shells` green, `npx tsc --noEmit` (remaining errors only in `HumidorSensorSection.tsx`).
- [ ] **Step 3: Commit** — `git add 'app/(app)/home' && git commit -m "feat: home humidor card handles one or many sensors"`

---

### Task 11: Account section slims to key management

**Files:**
- Rewrite: `components/govee/HumidorSensorSection.tsx`

**Interfaces:**
- Props unchanged: `{ userId: string; tier: string; onToast: (msg: string) => void }` (AccountClient call site untouched).
- Consumes: `GoveeKeyStatus` (Task 4), `jsonFetcher`/`keyFor` — new key: add `goveeKey: (userId: string) => ["govee-key", userId] as const` to `lib/data/keys.ts` (replaces the now-unused `goveeStatus` key — DELETE `goveeStatus` from keys.ts in this task; grep confirms no other consumers remain).

Behavior:
- Free tier: teaser unchanged in spirit — "Connect a Govee sensor to monitor your humidors. A Member perk." + upgrade link `/account?tab=membership`.
- Member, no key (`keyConnected: false`): explainer (supported models, where to get the key, H5075 note — reuse current copy) + password input (16px) + "Connect Govee Account" → POST `/api/govee/connection` → mutate → toast.
- Member, key connected + `keyStatus 'active'`: "Govee account connected." + note "Assign sensors to humidors from the My Humidors page." + Disconnect button → `window.confirm("Disconnect your Govee account? All humidor sensors will stop updating.")` → DELETE → mutate → toast.
- `keyStatus 'auth_error'`: ember text "Govee rejected your API key. Reconnect with a fresh key." + the key input + Connect button (re-upsert).
- Threshold editing and device pickers are REMOVED from this file (they live in HumidorSheet now).

- [ ] **Step 1: Implement** (this file shrinks; keep the `postJson` helper + style constants).
- [ ] **Step 2: Verify** — `npx tsc --noEmit` FULLY CLEAN now (all consumers migrated); `npx eslint components/govee/HumidorSensorSection.tsx` clean; `npm run test:unit` PASS.
- [ ] **Step 3: Commit** — `git add components/govee lib/data/keys.ts && git commit -m "feat: account govee section is key management only"`

---

### Task 12: Full verification pass

- [ ] **Step 1:** `npm run test:unit` → all PASS (277 existing + new overview/humidors tests).
- [ ] **Step 2:** `npx tsc --noEmit` clean; `npm run build` — `/home`, `/humidor`, `/account` all `○`; `npm run check:shells` green.
- [ ] **Step 3:** Bundle gate: `npm run analyze && npm run check:bundle` — the two /lounge failures are pre-existing (verified on origin/main 2026-07-19); NO OTHER route may fail. Report deltas for /humidor, /home, /account.
- [ ] **Step 4:** Grep gates: `grep -rn "useGoveeStatus\|GoveeStatusResponse\|DISCONNECTED_STATUS\|goveeStatus" app components lib --include='*.ts*'` → zero hits (old surface fully removed). `grep -rn "—" components/humidor/HumidorSheet.tsx components/govee lib/data/humidors.ts` → em dashes only in code comments, never in strings.
- [ ] **Step 5:** Fix anything found; one commit per fix.

---

### Task 13: Ship gate (BLOCKED on Dave applying SQL)

- [ ] **Step 1:** Dave runs migration steps 1-5 in the Supabase SQL editor, runs the verify queries (expected: one humidor per active user, all defaults, zero unassigned non-wishlist items, Dave's sensor row present with readings), then runs step 6 (column drop).
- [ ] **Step 2:** Open PR (preflight `gh pr list --head feat/multi-humidor --state all` first) with the SQL paste block + verify queries in the body, flagged pre-deploy. Merge order: SQL steps 1-5 → merge/deploy → verify app → SQL step 6 is safe any time after (code no longer reads those columns).
- [ ] **Step 3:** Post-deploy checks on Dave's account: humidor page shows "My Humidor" + his sensor strip exactly as before (regression bar); next cron tick updates `humidors.last_reading_at` (continuity check: `select name, last_reading_at from humidors where device_id is not null;` advances within 15 min); create a second humidor ("Desk Tupperdor"), confirm chips appear + title pluralizes + aggregate strip on All; assign no sensor to it, confirm "no sensor" row; move nothing (Move flow is PR 2); delete the test humidor via the sheet (destination picker) and confirm cigars unaffected.
- [ ] **Step 4:** verify-in-app screenshots: /humidor (1 humidor, 2 humidors, expanded aggregate), /home card, /account key section.

---

## Self-Review Notes (completed during planning)

- **Premise freshness:** verified this session against d90dc01: BottomSheet props (`open/onClose/ariaLabel/children`, always-mounted), HumidorClient rows 1-3 + `headerHeight` ResizeObserver + `sortItems`/`displayed` + localStorage `humidor_view` + count/value computation, `addHumidorItem` pass-through payload + `HumidorLimitError` P0001 pattern, free-limit trigger SQL shape (20260703 migration), browser `supabase.rpc` pattern, `fetchHumidorItems` select string, govee files as merged in #582 (authored this session), `keyFor.profile` + `fetchProfileLite` tier fields, no pager skeleton exists.
- **Spec coverage:** containers + gating (T1, T3, T7), chips/title/sort-row/aggregate/single strips (T2, T6, T8), per-humidor sensors + one key (T1, T4, T5), home 1-vs-many (T10), account slim-down (T11), delete-with-destination (T1 RPC, T7), add-flow picker + defaults (T9), regression bar (T12 gates + T13 continuity checks). Spec's `/api/govee/connection` GET/PATCH shape replaced by client-side RLS reads/writes — declared as a refinement in the header.
- **Type consistency:** `SensorLike` (T2) is the structural base of `Humidor` (T3) and the cron row (T5 uses its own narrow interface with matching column names); `GoveeKeyStatus` (T4) consumed only by T11; `HumidorConditions` props (T6) match T8/T10 call sites; `HumidorSheet` props (T7) match T8's mount; `defaultHumidorId` (T9) matches T8's pass-through.
- **State lifecycle:** HumidorSheet is always-mounted → state reset on `open` via effect keyed `[open, editing?.id]` (called out explicitly in T7 — the #582 stale-draft bug class); `selected` resets to "all" when the selected humidor is deleted (T8.1/T8.8); aggregate `expanded` state is local and collapses naturally on remount; `ensureDefaultHumidor` double-create race is resolved by the partial unique index + re-select (T3).
