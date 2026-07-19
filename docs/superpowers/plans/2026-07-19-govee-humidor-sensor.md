# Govee Humidor Sensor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members connect a WiFi Govee thermo-hygrometer; a 15-min cron polls Govee's cloud, stores the latest reading, and pushes out-of-range alerts; readings show on the Humidor page and a Home dashboard carousel card.

**Architecture:** One Govee-calling path (the cron + a one-shot read at connect time). UI surfaces read only our own DB via a `/api/govee/connection` GET, through SWR. New `govee_connections` table is service-role-only (RLS enabled, zero policies); the API key never reaches the browser after save.

**Tech Stack:** Next.js App Router route handlers (nodejs runtime), Supabase service client, existing push stack (`lib/push.ts`), SWR, vitest (`npm run test:unit` covers `lib/`).

**Spec:** `docs/superpowers/specs/2026-07-19-govee-humidor-sensor-design.md`

## Global Constraints

- Member-only: every `/api/govee/*` route (except cron) rejects free tier. UI gates are cosmetic; the server check is authoritative.
- No em dashes in ANY user-facing string (UI copy, push bodies). Use commas/periods.
- Static-shell rule: no server fetch added to `/home` or `/humidor` page.tsx. All new data arrives client-side via SWR. `npm run check:shells` must stay green after a build.
- Text inputs: `fontSize: 16` minimum (iOS zoom rule).
- Thresholds defaults: humidity 62–72 %RH, temp 60–72 °F. Alert cooldown 6 h per metric. Poll every 15 min.
- Govee response shapes are UNVERIFIED until the live probe (Task 13). Parsing lives in one module (`lib/govee/api.ts`) so probe corrections are localized.
- Branch: `feat/govee-humidor-sensor` (already created off synced main). Commit after every task.
- The DB migration is MANUAL-APPLY: Dave pastes SQL into the Supabase SQL editor. Flag it as a pre-deploy gate; code must not assume the table exists until he confirms.

---

### Task 1: `govee_connections` migration

**Files:**
- Create: `supabase/migrations/20260719_govee_connections.sql`

**Interfaces:**
- Produces: table `govee_connections` (columns below) used by Tasks 6–7.

- [ ] **Step 1: Write the migration file**

```sql
-- Govee sensor connections. One row per user. SERVICE-ROLE ONLY:
-- RLS is enabled with zero policies, so anon/authenticated clients
-- can never read api_key. All access goes through /api/govee/*
-- route handlers and the govee-poll cron via the service client.
create table if not exists govee_connections (
  user_id         uuid primary key references profiles(id) on delete cascade,
  api_key         text not null,
  device_id       text not null,
  sku             text not null,
  device_name     text,
  humidity_min    int  not null default 62,
  humidity_max    int  not null default 72,
  temp_min_f      int  not null default 60,
  temp_max_f      int  not null default 72,
  last_temp_f     numeric,
  last_humidity   numeric,
  last_reading_at timestamptz,
  status          text not null default 'active'
                  check (status in ('active','auth_error','device_missing')),
  alert_state     jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

alter table govee_connections enable row level security;
-- Intentionally NO policies: service-role only.
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260719_govee_connections.sql
git commit -m "feat: govee_connections table migration (manual-apply)"
```

- [ ] **Step 3: Give Dave the paste block** — post the SQL above in chat as a copy-paste block plus this verify query, and flag manual apply as a pre-deploy gate:

```sql
select column_name, data_type from information_schema.columns
where table_name = 'govee_connections' order by ordinal_position;
```

---

### Task 2: Threshold + cooldown engine (pure, TDD)

**Files:**
- Create: `lib/govee/thresholds.ts`
- Test: `lib/govee/__tests__/thresholds.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 6, 7, 8, 10):

```ts
export interface ThresholdConfig { humidityMin: number; humidityMax: number; tempMinF: number; tempMaxF: number }
export interface SensorReading  { tempF: number; humidity: number }
export interface MetricAlertState { outOfRange: boolean; lastAlertAt: string | null }
export interface AlertState { temp?: MetricAlertState; humidity?: MetricAlertState }
export interface ThresholdAlert { metric: "temp" | "humidity"; direction: "low" | "high"; value: number }
export interface EvalOutcome { nextState: AlertState; alerts: ThresholdAlert[] }
export const DEFAULT_THRESHOLDS: ThresholdConfig;
export const ALERT_COOLDOWN_MS: number; // 6h
export function evaluateReading(reading: SensorReading, config: ThresholdConfig, prev: AlertState, nowMs: number): EvalOutcome;
export function isMetricOutOfRange(reading: SensorReading, config: ThresholdConfig, metric: "temp" | "humidity"): boolean;
export function validateThresholds(input: unknown): ThresholdConfig | null;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import {
  evaluateReading, validateThresholds, isMetricOutOfRange,
  DEFAULT_THRESHOLDS, ALERT_COOLDOWN_MS,
} from "../thresholds";

const CFG = DEFAULT_THRESHOLDS; // 62-72 RH, 60-72 F
const NOW = Date.parse("2026-07-19T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("evaluateReading", () => {
  test("in-range reading produces no alerts and in-range state", () => {
    const r = evaluateReading({ tempF: 68, humidity: 66 }, CFG, {}, NOW);
    expect(r.alerts).toEqual([]);
    expect(r.nextState.temp?.outOfRange).toBe(false);
    expect(r.nextState.humidity?.outOfRange).toBe(false);
  });

  test("transition into low humidity fires one alert and stamps lastAlertAt", () => {
    const r = evaluateReading({ tempF: 68, humidity: 58 }, CFG, {}, NOW);
    expect(r.alerts).toEqual([{ metric: "humidity", direction: "low", value: 58 }]);
    expect(r.nextState.humidity).toEqual({ outOfRange: true, lastAlertAt: iso(NOW) });
  });

  test("staying out of range does NOT re-alert (transition-only)", () => {
    const prev = { humidity: { outOfRange: true, lastAlertAt: iso(NOW - 10 * 60_000) } };
    const r = evaluateReading({ tempF: 68, humidity: 57 }, CFG, prev, NOW);
    expect(r.alerts).toEqual([]);
    expect(r.nextState.humidity?.lastAlertAt).toBe(iso(NOW - 10 * 60_000));
  });

  test("bounce back out within cooldown is silenced, lastAlertAt preserved", () => {
    const last = iso(NOW - ALERT_COOLDOWN_MS + 60_000); // 5h59m ago
    const prev = { humidity: { outOfRange: false, lastAlertAt: last } };
    const r = evaluateReading({ tempF: 68, humidity: 58 }, CFG, prev, NOW);
    expect(r.alerts).toEqual([]);
    expect(r.nextState.humidity).toEqual({ outOfRange: true, lastAlertAt: last });
  });

  test("re-entry after cooldown expiry alerts again", () => {
    const prev = { humidity: { outOfRange: false, lastAlertAt: iso(NOW - ALERT_COOLDOWN_MS - 1) } };
    const r = evaluateReading({ tempF: 68, humidity: 58 }, CFG, prev, NOW);
    expect(r.alerts).toHaveLength(1);
    expect(r.nextState.humidity?.lastAlertAt).toBe(iso(NOW));
  });

  test("recovery clears outOfRange without alerting", () => {
    const last = iso(NOW - 60_000);
    const prev = { temp: { outOfRange: true, lastAlertAt: last } };
    const r = evaluateReading({ tempF: 68, humidity: 66 }, CFG, prev, NOW);
    expect(r.alerts).toEqual([]);
    expect(r.nextState.temp).toEqual({ outOfRange: false, lastAlertAt: last });
  });

  test("both metrics can alert in one pass, high direction reported", () => {
    const r = evaluateReading({ tempF: 80, humidity: 78 }, CFG, {}, NOW);
    expect(r.alerts).toEqual([
      { metric: "temp",     direction: "high", value: 80 },
      { metric: "humidity", direction: "high", value: 78 },
    ]);
  });
});

describe("isMetricOutOfRange", () => {
  test("boundary values are in range (inclusive)", () => {
    expect(isMetricOutOfRange({ tempF: 60, humidity: 62 }, CFG, "temp")).toBe(false);
    expect(isMetricOutOfRange({ tempF: 72, humidity: 72 }, CFG, "humidity")).toBe(false);
    expect(isMetricOutOfRange({ tempF: 59.9, humidity: 66 }, CFG, "temp")).toBe(true);
  });
});

describe("validateThresholds", () => {
  test("accepts sane config", () => {
    expect(validateThresholds({ humidityMin: 60, humidityMax: 75, tempMinF: 55, tempMaxF: 75 }))
      .toEqual({ humidityMin: 60, humidityMax: 75, tempMinF: 55, tempMaxF: 75 });
  });
  test("rejects min >= max", () => {
    expect(validateThresholds({ humidityMin: 72, humidityMax: 62, tempMinF: 60, tempMaxF: 72 })).toBeNull();
  });
  test("rejects out-of-band values (RH outside 30-90, temp outside 40-90)", () => {
    expect(validateThresholds({ humidityMin: 10, humidityMax: 72, tempMinF: 60, tempMaxF: 72 })).toBeNull();
    expect(validateThresholds({ humidityMin: 62, humidityMax: 72, tempMinF: 60, tempMaxF: 95 })).toBeNull();
  });
  test("rejects non-numeric / missing fields", () => {
    expect(validateThresholds({ humidityMin: "62" })).toBeNull();
    expect(validateThresholds(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test:unit -- thresholds` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/govee/thresholds.ts`**

```ts
/* Pure threshold + alert-cooldown engine for Govee humidor readings.
   No I/O — fully unit-tested. Alert rule: push only on the transition
   from in-range to out-of-range, and only if the metric's last alert
   is older than the cooldown. Recovery (out -> in) clears the flag
   silently, preserving lastAlertAt so an in/out bounce can't spam. */

export interface ThresholdConfig { humidityMin: number; humidityMax: number; tempMinF: number; tempMaxF: number }
export interface SensorReading  { tempF: number; humidity: number }
export interface MetricAlertState { outOfRange: boolean; lastAlertAt: string | null }
export interface AlertState { temp?: MetricAlertState; humidity?: MetricAlertState }
export interface ThresholdAlert { metric: "temp" | "humidity"; direction: "low" | "high"; value: number }
export interface EvalOutcome { nextState: AlertState; alerts: ThresholdAlert[] }

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  humidityMin: 62, humidityMax: 72, tempMinF: 60, tempMaxF: 72,
};

export const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/* Sanity bands for user-configurable thresholds. */
const RH_BAND   = { min: 30, max: 90 };
const TEMP_BAND = { min: 40, max: 90 };

function metricBounds(config: ThresholdConfig, metric: "temp" | "humidity") {
  return metric === "temp"
    ? { min: config.tempMinF,   max: config.tempMaxF,   value: (r: SensorReading) => r.tempF }
    : { min: config.humidityMin, max: config.humidityMax, value: (r: SensorReading) => r.humidity };
}

export function isMetricOutOfRange(
  reading: SensorReading, config: ThresholdConfig, metric: "temp" | "humidity",
): boolean {
  const b = metricBounds(config, metric);
  const v = b.value(reading);
  return v < b.min || v > b.max;
}

export function evaluateReading(
  reading: SensorReading, config: ThresholdConfig, prev: AlertState, nowMs: number,
): EvalOutcome {
  const nextState: AlertState = {};
  const alerts: ThresholdAlert[] = [];

  for (const metric of ["temp", "humidity"] as const) {
    const b = metricBounds(config, metric);
    const v = b.value(reading);
    const out = v < b.min || v > b.max;
    const prevMetric = prev[metric] ?? { outOfRange: false, lastAlertAt: null };

    if (out && !prevMetric.outOfRange) {
      const lastMs = prevMetric.lastAlertAt ? Date.parse(prevMetric.lastAlertAt) : null;
      const cooled = lastMs === null || nowMs - lastMs > ALERT_COOLDOWN_MS;
      if (cooled) {
        alerts.push({ metric, direction: v < b.min ? "low" : "high", value: v });
        nextState[metric] = { outOfRange: true, lastAlertAt: new Date(nowMs).toISOString() };
      } else {
        nextState[metric] = { outOfRange: true, lastAlertAt: prevMetric.lastAlertAt };
      }
    } else {
      nextState[metric] = { outOfRange: out, lastAlertAt: prevMetric.lastAlertAt };
    }
  }

  return { nextState, alerts };
}

/* Route-input validation. Returns a clean config or null. */
export function validateThresholds(input: unknown): ThresholdConfig | null {
  if (typeof input !== "object" || input === null) return null;
  const o = input as Record<string, unknown>;
  const nums = ["humidityMin", "humidityMax", "tempMinF", "tempMaxF"].map((k) => o[k]);
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const [humidityMin, humidityMax, tempMinF, tempMaxF] = nums as number[];
  if (humidityMin >= humidityMax || tempMinF >= tempMaxF) return null;
  if (humidityMin < RH_BAND.min || humidityMax > RH_BAND.max) return null;
  if (tempMinF < TEMP_BAND.min || tempMaxF > TEMP_BAND.max) return null;
  return { humidityMin, humidityMax, tempMinF, tempMaxF };
}
```

- [ ] **Step 4: Run to verify pass** — `npm run test:unit -- thresholds` → all PASS.

- [ ] **Step 5: Commit** — `git add lib/govee && git commit -m "feat: govee threshold + cooldown engine"`

---

### Task 3: Govee cloud API client (TDD, fixtures from docs)

**Files:**
- Create: `lib/govee/api.ts`
- Test: `lib/govee/__tests__/api.test.ts`

**Interfaces:**
- Consumes: `SensorReading` from `lib/govee/thresholds.ts`.
- Produces (consumed by Tasks 4, 6, 7):

```ts
export const SUPPORTED_SENSOR_SKUS: ReadonlySet<string>;
export class GoveeAuthError extends Error {}
export class GoveeApiError  extends Error {}
export interface GoveeDevice { sku: string; device: string; deviceName: string }
export function listSensorDevices(apiKey: string): Promise<GoveeDevice[]>;      // throws GoveeAuthError on 401/403
export function fetchSensorReading(apiKey: string, sku: string, device: string): Promise<SensorReading | null>;
```

- [ ] **Step 1: Write the failing tests** (mock global `fetch` with `vi.stubGlobal`; fixtures follow Govee's documented v1 platform shapes and get reconciled against the live probe in Task 13)

```ts
import { afterEach, describe, expect, test, vi } from "vitest";
import { listSensorDevices, fetchSensorReading, GoveeAuthError, SUPPORTED_SENSOR_SKUS } from "../api";

function mockFetch(status: number, json: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: status >= 200 && status < 300, status,
    json: async () => json,
  })));
}
afterEach(() => vi.unstubAllGlobals());

const DEVICES_FIXTURE = {
  code: 200, message: "success",
  data: [
    { sku: "H5179", device: "AA:BB:CC:DD:EE:FF:11:22", deviceName: "Humidor" },
    { sku: "H6008", device: "11:22:33:44:55:66:77:88", deviceName: "Desk Lamp" },
  ],
};

const STATE_FIXTURE = {
  requestId: "r1", code: 200, msg: "success",
  payload: {
    sku: "H5179", device: "AA:BB:CC:DD:EE:FF:11:22",
    capabilities: [
      { type: "devices.capabilities.property", instance: "sensorTemperature", state: { value: 68.4 } },
      { type: "devices.capabilities.property", instance: "sensorHumidity",    state: { value: 65 } },
    ],
  },
};

describe("listSensorDevices", () => {
  test("returns only supported sensor SKUs", async () => {
    mockFetch(200, DEVICES_FIXTURE);
    const devices = await listSensorDevices("key");
    expect(devices).toEqual([{ sku: "H5179", device: "AA:BB:CC:DD:EE:FF:11:22", deviceName: "Humidor" }]);
  });
  test("throws GoveeAuthError on 401", async () => {
    mockFetch(401, { code: 401, message: "unauthorized" });
    await expect(listSensorDevices("bad")).rejects.toBeInstanceOf(GoveeAuthError);
  });
});

describe("fetchSensorReading", () => {
  test("extracts tempF and humidity from capabilities", async () => {
    mockFetch(200, STATE_FIXTURE);
    await expect(fetchSensorReading("key", "H5179", "AA:BB:CC:DD:EE:FF:11:22"))
      .resolves.toEqual({ tempF: 68.4, humidity: 65 });
  });
  test("handles object-wrapped values ({ value: { currentValue } })", async () => {
    const fx = structuredClone(STATE_FIXTURE) as typeof STATE_FIXTURE;
    (fx.payload.capabilities[0].state as { value: unknown }).value = { currentValue: 70.2 };
    (fx.payload.capabilities[1].state as { value: unknown }).value = { currentValue: 63 };
    mockFetch(200, fx);
    await expect(fetchSensorReading("key", "H5179", "AA:BB:CC:DD:EE:FF:11:22"))
      .resolves.toEqual({ tempF: 70.2, humidity: 63 });
  });
  test("returns null when capabilities are missing", async () => {
    mockFetch(200, { code: 200, payload: { capabilities: [] } });
    await expect(fetchSensorReading("key", "H5179", "x")).resolves.toBeNull();
  });
  test("throws GoveeAuthError on 403", async () => {
    mockFetch(403, {});
    await expect(fetchSensorReading("bad", "H5179", "x")).rejects.toBeInstanceOf(GoveeAuthError);
  });
});

test("H5075 is not a supported SKU", () => {
  expect(SUPPORTED_SENSOR_SKUS.has("H5075")).toBe(false);
  expect(SUPPORTED_SENSOR_SKUS.has("H5179")).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test:unit -- govee/__tests__/api` → FAIL.

- [ ] **Step 3: Implement `lib/govee/api.ts`**

```ts
/* Govee cloud platform API client. The ONLY module that talks to
   Govee — response-shape assumptions are quarantined here so the
   live-probe reconciliation (scripts/govee-probe.ts) edits one file.
   Docs: https://developer.govee.com (v1 platform API). */

import type { SensorReading } from "./thresholds";

const BASE = "https://openapi.api.govee.com/router/api/v1";
const TIMEOUT_MS = 10_000;

/* Govee's official API-supported thermo-hygrometer SKUs. Bluetooth-only
   models (H5075 etc.) are NOT api-reachable and stay off this list. */
export const SUPPORTED_SENSOR_SKUS: ReadonlySet<string> = new Set([
  "H5179", "H5100", "H5103", "H5127", "H5160", "H5161",
]);

export class GoveeAuthError extends Error {}
export class GoveeApiError  extends Error {}

export interface GoveeDevice { sku: string; device: string; deviceName: string }

async function goveeFetch(apiKey: string, path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Govee-API-Key": apiKey, "Content-Type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403) {
    throw new GoveeAuthError(`Govee rejected the API key (${res.status})`);
  }
  if (!res.ok) throw new GoveeApiError(`Govee API error ${res.status} on ${path}`);
  return res.json();
}

export async function listSensorDevices(apiKey: string): Promise<GoveeDevice[]> {
  const json = (await goveeFetch(apiKey, "/user/devices")) as {
    data?: Array<{ sku?: string; device?: string; deviceName?: string }>;
  };
  return (json.data ?? [])
    .filter((d) => d.sku && d.device && SUPPORTED_SENSOR_SKUS.has(d.sku))
    .map((d) => ({ sku: d.sku as string, device: d.device as string, deviceName: d.deviceName ?? d.sku as string }));
}

/* Capability state values arrive either as a bare number or wrapped
   in an object; accept both (exact prod shape confirmed by probe). */
function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "object" && v !== null) {
    for (const key of ["currentValue", "value"]) {
      const inner = (v as Record<string, unknown>)[key];
      if (typeof inner === "number" && Number.isFinite(inner)) return inner;
    }
  }
  return null;
}

export async function fetchSensorReading(
  apiKey: string, sku: string, device: string,
): Promise<SensorReading | null> {
  const json = (await goveeFetch(apiKey, "/device/state", {
    method: "POST",
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      payload: { sku, device },
    }),
  })) as {
    payload?: { capabilities?: Array<{ instance?: string; state?: { value?: unknown } }> };
  };

  const caps = json.payload?.capabilities ?? [];
  const find = (instance: string) =>
    toNumber(caps.find((c) => c.instance === instance)?.state?.value);

  const tempF    = find("sensorTemperature");
  const humidity = find("sensorHumidity");
  if (tempF === null || humidity === null) return null;
  return { tempF, humidity };
}
```

- [ ] **Step 4: Run to verify pass** — `npm run test:unit -- govee` → all PASS (thresholds + api).

- [ ] **Step 5: Commit** — `git add lib/govee && git commit -m "feat: govee cloud api client"`

---

### Task 4: Probe script (ship-gate tool)

**Files:**
- Create: `scripts/govee-probe.ts`

**Interfaces:**
- Consumes: `listSensorDevices`, `fetchSensorReading` from `lib/govee/api.ts`.

- [ ] **Step 1: Write the script**

```ts
/* One-shot probe against the real Govee cloud API. Run when the
   H5179 arrives, BEFORE merging user-facing UI:

     npx tsx scripts/govee-probe.ts <GOVEE_API_KEY>

   Prints the raw device list and one state payload. Compare against
   the fixtures in lib/govee/__tests__/api.test.ts and reconcile any
   shape differences in lib/govee/api.ts (Task 13). */

import { listSensorDevices, fetchSensorReading } from "../lib/govee/api";

async function main() {
  const apiKey = process.argv[2];
  if (!apiKey) {
    console.error("Usage: npx tsx scripts/govee-probe.ts <GOVEE_API_KEY>");
    process.exit(1);
  }

  const devices = await listSensorDevices(apiKey);
  console.log("Supported sensors on this account:");
  console.log(JSON.stringify(devices, null, 2));

  if (devices.length === 0) {
    console.log("No supported sensors found. Raw list may include unsupported SKUs; check the Govee Home app.");
    return;
  }

  const d = devices[0];
  console.log(`\nReading state for ${d.deviceName} (${d.sku})...`);
  const reading = await fetchSensorReading(apiKey, d.sku, d.device);
  console.log(JSON.stringify(reading, null, 2));
}

main().catch((err) => { console.error("Probe failed:", err); process.exit(1); });
```

- [ ] **Step 2: Verify it compiles** — `npx tsc --noEmit` → no new errors. (Can't run for real until hardware arrives.)

- [ ] **Step 3: Commit** — `git add scripts/govee-probe.ts && git commit -m "feat: govee live-api probe script"`

---

### Task 5: Notification category

**Files:**
- Modify: `lib/notification-categories.ts` (add entry to `NOTIFICATION_CATEGORIES`, after `lounge_reply`, before `test`)

**Interfaces:**
- Produces: category id `humidor_sensor` (used by Task 7's `sendPushToUser` call). The /account toggle appears automatically — `NotificationsSection` renders every non-`internal` entry.

- [ ] **Step 1: Add the entry**

```ts
  /* Govee humidor sensor out-of-range alerts. Triggered by
     /api/cron/govee-poll when a connected sensor's temperature or
     humidity crosses the user's thresholds. */
  humidor_sensor: {
    id:          "humidor_sensor",
    label:       "Humidor sensor alerts",
    description: "Notify me when my connected humidor sensor reads outside my temperature or humidity range.",
  },
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` → clean; `npm run test:unit` → PASS.

- [ ] **Step 3: Commit** — `git add lib/notification-categories.ts && git commit -m "feat: humidor_sensor notification category"`

---

### Task 6: Server routes (`/api/govee/devices`, `/api/govee/connection`)

**Files:**
- Create: `lib/govee/types.ts` (client-safe response types)
- Create: `lib/govee/server.ts` (member gate helper)
- Create: `app/api/govee/devices/route.ts`
- Create: `app/api/govee/connection/route.ts`

**Interfaces:**
- Consumes: `getServerUser` (`lib/auth/server-user.ts`), `createServiceClientFor` (`utils/supabase/service.ts`), `isPaidMember` (`lib/membership.ts`), `checkRateLimit` (`lib/rate-limit.ts`), `listSensorDevices`/`fetchSensorReading`/`GoveeAuthError` (Task 3), `validateThresholds`/`DEFAULT_THRESHOLDS`/`ThresholdConfig` (Task 2).
- Produces (consumed by Tasks 8–11):

```ts
// lib/govee/types.ts
export interface GoveeStatusResponse {
  connected:     boolean;
  deviceName:    string | null;
  sku:           string | null;
  status:        "active" | "auth_error" | "device_missing" | null;
  thresholds:    ThresholdConfig | null;
  lastTempF:     number | null;
  lastHumidity:  number | null;
  lastReadingAt: string | null;
}
```
- Route contract: `POST /api/govee/devices` `{ apiKey }` → `{ devices: GoveeDevice[] }`; `GET /api/govee/connection` → `GoveeStatusResponse`; `POST /api/govee/connection` `{ apiKey, deviceId, sku, deviceName }` → `GoveeStatusResponse`; `PATCH` `{ humidityMin, humidityMax, tempMinF, tempMaxF }` → `{ ok: true }`; `DELETE` → `{ ok: true }`. Free tier → 403 `{ error: "Membership required" }`.

- [ ] **Step 1: Write `lib/govee/types.ts`**

```ts
import type { ThresholdConfig } from "./thresholds";

/* Shape returned by GET/POST /api/govee/connection. Client-safe:
   NEVER includes api_key or device MAC. */
export interface GoveeStatusResponse {
  connected:     boolean;
  deviceName:    string | null;
  sku:           string | null;
  status:        "active" | "auth_error" | "device_missing" | null;
  thresholds:    ThresholdConfig | null;
  lastTempF:     number | null;
  lastHumidity:  number | null;
  lastReadingAt: string | null;
}

export const DISCONNECTED_STATUS: GoveeStatusResponse = {
  connected: false, deviceName: null, sku: null, status: null,
  thresholds: null, lastTempF: null, lastHumidity: null, lastReadingAt: null,
};
```

- [ ] **Step 2: Write `lib/govee/server.ts`**

```ts
/* Server-only helpers for /api/govee/* routes. */

import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/server-user";
import { createServiceClientFor } from "@/utils/supabase/service";
import { isPaidMember } from "@/lib/membership";
import type { GoveeStatusResponse } from "./types";

export function goveeServiceClient() {
  return createServiceClientFor(
    "api:govee",
    "govee_connections is service-role-only (holds per-user Govee API keys); routes verify auth + tier first",
  );
}

/* Auth + Member-tier gate. Returns userId or a ready-to-return error. */
export async function requireMemberUser(): Promise<
  { userId: string; error: null } | { userId: null; error: NextResponse }
> {
  const user = await getServerUser();
  if (!user) {
    return { userId: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const supabase = goveeServiceClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("membership_tier, badge, assigned_badges")
    .eq("id", user.id)
    .single();
  if (error || !isPaidMember(profile)) {
    return { userId: null, error: NextResponse.json({ error: "Membership required" }, { status: 403 }) };
  }
  return { userId: user.id, error: null };
}

interface ConnectionRow {
  device_name: string | null; sku: string; status: "active" | "auth_error" | "device_missing";
  humidity_min: number; humidity_max: number; temp_min_f: number; temp_max_f: number;
  last_temp_f: number | null; last_humidity: number | null; last_reading_at: string | null;
}

export function rowToStatus(row: ConnectionRow): GoveeStatusResponse {
  return {
    connected:     true,
    deviceName:    row.device_name,
    sku:           row.sku,
    status:        row.status,
    thresholds: {
      humidityMin: row.humidity_min, humidityMax: row.humidity_max,
      tempMinF:    row.temp_min_f,   tempMaxF:    row.temp_max_f,
    },
    lastTempF:     row.last_temp_f,
    lastHumidity:  row.last_humidity,
    lastReadingAt: row.last_reading_at,
  };
}

export const CONNECTION_COLUMNS =
  "device_name, sku, status, humidity_min, humidity_max, temp_min_f, temp_max_f, last_temp_f, last_humidity, last_reading_at";
```

- [ ] **Step 3: Write `app/api/govee/devices/route.ts`**

```ts
/* POST /api/govee/devices — validate a Govee API key and list the
   account's SUPPORTED sensors. Persists nothing; the client holds
   the key only during the connect flow. Rate-limited: each call
   fans out to Govee's cloud with user input. */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { listSensorDevices, GoveeAuthError } from "@/lib/govee/api";
import { requireMemberUser } from "@/lib/govee/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  const rl = await checkRateLimit(gate.userId, { limit: 10, window: "1 h", prefix: "govee-devices" });
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let apiKey: string;
  try {
    const body = await request.json();
    apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  } catch { apiKey = ""; }
  if (!apiKey || apiKey.length > 200) {
    return NextResponse.json({ error: "Enter your Govee API key." }, { status: 400 });
  }

  try {
    const devices = await listSensorDevices(apiKey);
    return NextResponse.json({ devices });
  } catch (err) {
    if (err instanceof GoveeAuthError) {
      return NextResponse.json(
        { error: "That key didn't work. Double-check it in the Govee Home app." },
        { status: 400 },
      );
    }
    console.error("[govee/devices] list failed:", (err as Error).message);
    return NextResponse.json({ error: "Couldn't reach Govee. Try again in a minute." }, { status: 502 });
  }
}
```

- [ ] **Step 4: Write `app/api/govee/connection/route.ts`**

```ts
/* /api/govee/connection — the user's single sensor connection.
     GET    → GoveeStatusResponse (no secrets)
     POST   → save { apiKey, deviceId, sku, deviceName } + take one
              immediate reading so the UI isn't empty until the cron
     PATCH  → update thresholds
     DELETE → disconnect (row delete)
   All methods: auth + Member gate. Table is service-role-only. */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { fetchSensorReading, GoveeAuthError, SUPPORTED_SENSOR_SKUS } from "@/lib/govee/api";
import { validateThresholds } from "@/lib/govee/thresholds";
import { DISCONNECTED_STATUS } from "@/lib/govee/types";
import { requireMemberUser, goveeServiceClient, rowToStatus, CONNECTION_COLUMNS } from "@/lib/govee/server";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  const supabase = goveeServiceClient();
  const { data, error } = await supabase
    .from("govee_connections")
    .select(CONNECTION_COLUMNS)
    .eq("user_id", gate.userId)
    .maybeSingle();

  if (error) {
    console.error("[govee/connection] GET failed:", error.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  return NextResponse.json(data ? rowToStatus(data) : DISCONNECTED_STATUS);
}

export async function POST(request: NextRequest) {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  const rl = await checkRateLimit(gate.userId, { limit: 10, window: "1 h", prefix: "govee-connect" });
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let body: { apiKey?: unknown; deviceId?: unknown; sku?: unknown; deviceName?: unknown };
  try { body = await request.json(); } catch { body = {}; }
  const apiKey     = typeof body.apiKey     === "string" ? body.apiKey.trim()     : "";
  const deviceId   = typeof body.deviceId   === "string" ? body.deviceId.trim()   : "";
  const sku        = typeof body.sku        === "string" ? body.sku.trim()        : "";
  const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim().slice(0, 100) : null;

  if (!apiKey || !deviceId || !SUPPORTED_SENSOR_SKUS.has(sku)) {
    return NextResponse.json({ error: "Pick a supported sensor to connect." }, { status: 400 });
  }

  /* Prove key + device work RIGHT NOW with one reading; also seeds
     the UI so the strip isn't empty until the next cron tick. */
  let reading;
  try {
    reading = await fetchSensorReading(apiKey, sku, deviceId);
  } catch (err) {
    if (err instanceof GoveeAuthError) {
      return NextResponse.json(
        { error: "That key didn't work. Double-check it in the Govee Home app." },
        { status: 400 },
      );
    }
    console.error("[govee/connection] seed reading failed:", (err as Error).message);
    return NextResponse.json({ error: "Couldn't reach Govee. Try again in a minute." }, { status: 502 });
  }

  const supabase = goveeServiceClient();
  const { data, error } = await supabase
    .from("govee_connections")
    .upsert({
      user_id:         gate.userId,
      api_key:         apiKey,
      device_id:       deviceId,
      sku,
      device_name:     deviceName,
      status:          "active",
      alert_state:     {},
      last_temp_f:     reading?.tempF ?? null,
      last_humidity:   reading?.humidity ?? null,
      last_reading_at: reading ? new Date().toISOString() : null,
    }, { onConflict: "user_id" })
    .select(CONNECTION_COLUMNS)
    .single();

  if (error || !data) {
    console.error("[govee/connection] upsert failed:", error?.message);
    return NextResponse.json({ error: "Something went wrong saving the connection." }, { status: 500 });
  }
  return NextResponse.json(rowToStatus(data));
}

export async function PATCH(request: NextRequest) {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const thresholds = validateThresholds(body);
  if (!thresholds) {
    return NextResponse.json(
      { error: "Ranges must be within 30 to 90% RH and 40 to 90°F, with min below max." },
      { status: 400 },
    );
  }

  const supabase = goveeServiceClient();
  const { error } = await supabase
    .from("govee_connections")
    .update({
      humidity_min: thresholds.humidityMin, humidity_max: thresholds.humidityMax,
      temp_min_f:   thresholds.tempMinF,    temp_max_f:   thresholds.tempMaxF,
    })
    .eq("user_id", gate.userId);

  if (error) {
    console.error("[govee/connection] PATCH failed:", error.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const gate = await requireMemberUser();
  if (gate.error) return gate.error;

  const supabase = goveeServiceClient();
  const { error } = await supabase.from("govee_connections").delete().eq("user_id", gate.userId);
  if (error) {
    console.error("[govee/connection] DELETE failed:", error.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Verify** — `npx tsc --noEmit` → clean. `npm run test:unit` → PASS.

- [ ] **Step 6: Commit** — `git add lib/govee app/api/govee && git commit -m "feat: govee connection api routes"`

---

### Task 7: Poll cron

**Files:**
- Create: `app/api/cron/govee-poll/route.ts`
- Modify: `vercel.json` (append cron entry)

**Interfaces:**
- Consumes: `evaluateReading`/`AlertState`/`ThresholdAlert` (Task 2), `fetchSensorReading`/`GoveeAuthError` (Task 3), `sendPushToUser` (`lib/push.ts`, signature `(userId, payload, category)`), `startCronRun`/`finishCronRun` (`lib/cron-log.ts`), category `humidor_sensor` (Task 5).

- [ ] **Step 1: Add the vercel.json cron entry** (inside the existing `crons` array)

```json
    {
      "path":     "/api/cron/govee-poll",
      "schedule": "*/15 * * * *"
    }
```

- [ ] **Step 2: Write `app/api/cron/govee-poll/route.ts`**

```ts
/* ------------------------------------------------------------------
   GET/POST /api/cron/govee-poll — every 15 minutes.

   For each active govee_connections row: fetch the current reading
   from Govee's cloud, store it, evaluate thresholds, and push an
   alert on an in-range -> out-of-range transition (6h per-metric
   cooldown lives in lib/govee/thresholds.ts).

   Failure isolation: each user is processed independently.
     - GoveeAuthError  -> status 'auth_error', polling pauses for
       that user until they reconnect (/account shows a prompt).
     - null reading (device gone / no capabilities) -> 'device_missing'.
     - transient error -> row untouched; next tick retries.

   Auth + logging: same isAuthorized / cron-log pattern as
   /api/cron/aging-ready. Node runtime (web-push needs Node crypto).
   ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClientFor }    from "@/utils/supabase/service";
import { sendPushToUser }            from "@/lib/push";
import { startCronRun, finishCronRun } from "@/lib/cron-log";
import { fetchSensorReading, GoveeAuthError } from "@/lib/govee/api";
import { evaluateReading, type AlertState, type ThresholdAlert } from "@/lib/govee/thresholds";

export const runtime = "nodejs";

const BATCH_SIZE = 5;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const syncSecret = process.env.SYNC_SECRET;

  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  const sync = req.headers.get("x-sync-secret");
  if (syncSecret && sync === syncSecret) return true;

  if (process.env.NODE_ENV !== "production") {
    const ua = req.headers.get("user-agent") ?? "";
    if (!cronSecret && ua.startsWith("vercel-cron/")) return true;
  }
  return false;
}

interface ConnectionRow {
  user_id: string; api_key: string; device_id: string; sku: string;
  humidity_min: number; humidity_max: number; temp_min_f: number; temp_max_f: number;
  alert_state: AlertState | null;
}

/* User-facing push copy. NO EM DASHES. */
function alertBody(a: ThresholdAlert, row: ConnectionRow): string {
  const value = Math.round(a.value * 10) / 10;
  if (a.metric === "humidity") {
    const verb = a.direction === "low" ? "dropped" : "rose";
    return `Humidor humidity ${verb} to ${value}%. Your range is ${row.humidity_min} to ${row.humidity_max}%.`;
  }
  const verb = a.direction === "low" ? "dropped" : "rose";
  return `Humidor temperature ${verb} to ${value}°F. Your range is ${row.temp_min_f} to ${row.temp_max_f}°F.`;
}

async function pollOne(
  supabase: ReturnType<typeof createServiceClientFor>,
  row: ConnectionRow,
  nowMs: number,
): Promise<"ok" | "alerted" | "auth_error" | "device_missing" | "transient"> {
  let reading;
  try {
    reading = await fetchSensorReading(row.api_key, row.sku, row.device_id);
  } catch (err) {
    if (err instanceof GoveeAuthError) {
      await supabase.from("govee_connections")
        .update({ status: "auth_error" }).eq("user_id", row.user_id);
      return "auth_error";
    }
    return "transient"; // row untouched; next tick retries
  }

  if (reading === null) {
    await supabase.from("govee_connections")
      .update({ status: "device_missing" }).eq("user_id", row.user_id);
    return "device_missing";
  }

  const config = {
    humidityMin: row.humidity_min, humidityMax: row.humidity_max,
    tempMinF:    row.temp_min_f,   tempMaxF:    row.temp_max_f,
  };
  const { nextState, alerts } = evaluateReading(reading, config, row.alert_state ?? {}, nowMs);

  await supabase.from("govee_connections").update({
    last_temp_f:     reading.tempF,
    last_humidity:   reading.humidity,
    last_reading_at: new Date(nowMs).toISOString(),
    alert_state:     nextState,
    status:          "active",
  }).eq("user_id", row.user_id);

  for (const a of alerts) {
    try {
      await sendPushToUser(row.user_id, {
        title: "Humidor Alert",
        body:  alertBody(a, row),
        url:   "/humidor",
        tag:   `govee-${a.metric}`,
      }, "humidor_sensor");
    } catch (err) {
      console.error(`[govee-poll] push failed for ${row.user_id}:`, (err as Error).message);
    }
  }
  return alerts.length > 0 ? "alerted" : "ok";
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await startCronRun("govee-poll", "*/15 * * * *");
  try {
    const supabase = createServiceClientFor(
      "cron:govee-poll",
      "poll Govee cloud for every connected user's sensor; table is service-role-only",
    );

    const { data: rows, error } = await supabase
      .from("govee_connections")
      .select("user_id, api_key, device_id, sku, humidity_min, humidity_max, temp_min_f, temp_max_f, alert_state")
      .eq("status", "active");

    if (error) {
      await finishCronRun(run, { ok: false, error: `query failed: ${error.message}`.slice(0, 500) });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const summary = { polled: 0, alerted: 0, auth_errors: 0, device_missing: 0, transient: 0 };
    const nowMs = Date.now();
    const list = (rows ?? []) as ConnectionRow[];

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const results = await Promise.allSettled(
        list.slice(i, i + BATCH_SIZE).map((row) => pollOne(supabase, row, nowMs)),
      );
      for (const r of results) {
        if (r.status === "rejected") { summary.transient += 1; continue; }
        summary.polled += 1;
        if (r.value === "alerted")        summary.alerted += 1;
        if (r.value === "auth_error")     summary.auth_errors += 1;
        if (r.value === "device_missing") summary.device_missing += 1;
        if (r.value === "transient")      summary.transient += 1;
      }
    }

    await finishCronRun(run, { ok: true, summary });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    await finishCronRun(run, { ok: false, error: (err as Error).message });
    throw err;
  }
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit** — `git add vercel.json app/api/cron/govee-poll && git commit -m "feat: govee 15-min poll cron with out-of-range push alerts"`

---

### Task 8: SWR key + shared display component

**Files:**
- Modify: `lib/data/keys.ts` (add key next to `homeAging`)
- Create: `components/govee/useGoveeStatus.ts`
- Create: `components/govee/HumidorConditions.tsx`

**Interfaces:**
- Consumes: `GoveeStatusResponse` (Task 6), `isMetricOutOfRange` (Task 2), `jsonFetcher`/`keyFor` (`lib/data/keys.ts`).
- Produces (consumed by Tasks 9–11):
  - `keyFor.goveeStatus: (userId: string) => ["govee-status", userId]`
  - `useGoveeStatus(userId: string | null): { status: GoveeStatusResponse | undefined }`
  - `<HumidorConditions userId={string} />` — renders the strip, or null when not connected / no reading yet.

- [ ] **Step 1: Add the key in `lib/data/keys.ts`** (after the `homeAging` entry)

```ts
  /* ── Govee humidor sensor status (per-user; /api/govee/connection).
   *   Shared by the humidor strip, the home card, and the account
   *   section — one cache entry, one request. */
  goveeStatus:   (userId: string) => ["govee-status", userId] as const,
```

- [ ] **Step 2: Write `components/govee/useGoveeStatus.ts`**

```ts
"use client";

import useSWR from "swr";
import { keyFor, jsonFetcher } from "@/lib/data/keys";
import type { GoveeStatusResponse } from "@/lib/govee/types";

/* One SWR entry shared by every surface. SWR's provider defaults
   handle focus/reconnect revalidation; no bespoke visibility code. */
export function useGoveeStatus(userId: string | null) {
  const { data, mutate } = useSWR(
    userId ? keyFor.goveeStatus(userId) : null,
    () => jsonFetcher<GoveeStatusResponse>("/api/govee/connection"),
  );
  return { status: data, mutate };
}
```

- [ ] **Step 3: Write `components/govee/HumidorConditions.tsx`**

```tsx
"use client";

import { useGoveeStatus } from "./useGoveeStatus";
import { isMetricOutOfRange, type SensorReading, type ThresholdConfig } from "@/lib/govee/thresholds";

/* Reading older than this shows "sensor not reporting" — our cron
   runs every 15 min, so 45 min = 3 consecutive missed polls. */
const STALE_AFTER_MS = 45 * 60_000;

function agoLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function Metric({ label, value, out }: { label: string; value: string; out: boolean }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em",
        textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "var(--font-serif)", fontSize: 22, lineHeight: 1,
        color: out ? "var(--ember)" : "var(--foreground)",
      }}>
        {value}
      </div>
    </div>
  );
}

/* The Temp · RH strip. Renders null unless the user has a connected
   sensor with at least one stored reading — free users and
   unconnected members see nothing on humidor/home (the teaser lives
   on /account). */
export function HumidorConditions({ userId }: { userId: string }) {
  const { status } = useGoveeStatus(userId);

  if (!status?.connected) return null;
  if (status.lastTempF === null || status.lastHumidity === null || !status.lastReadingAt) return null;

  const reading: SensorReading = { tempF: status.lastTempF, humidity: status.lastHumidity };
  const cfg = status.thresholds as ThresholdConfig;
  const tempOut     = isMetricOutOfRange(reading, cfg, "temp");
  const humidityOut = isMetricOutOfRange(reading, cfg, "humidity");
  const stale       = Date.now() - Date.parse(status.lastReadingAt) > STALE_AFTER_MS;
  const paused      = status.status !== "active";

  return (
    <section
      aria-label="Humidor conditions"
      style={{
        border: "1px solid var(--border)", borderRadius: 6,
        background: "var(--card)", padding: "12px 14px",
      }}
    >
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.28em",
        textTransform: "uppercase", color: "var(--muted-foreground)",
        display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
      }}>
        <span aria-hidden="true" style={{ width: 18, height: 1, background: "var(--gold)" }} />
        Humidor Conditions
        <span style={{ marginLeft: "auto", letterSpacing: "0.05em", textTransform: "none" }}>
          {paused ? "reconnect needed" : stale ? "sensor not reporting" : agoLabel(status.lastReadingAt)}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Metric label="Temp"     value={`${Math.round(reading.tempF)}°F`}    out={tempOut} />
        <Metric label="Humidity" value={`${Math.round(reading.humidity)}%`} out={humidityOut} />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit** — `git add lib/data/keys.ts components/govee && git commit -m "feat: govee status hook + humidor conditions strip"`

---

### Task 9: Humidor page strip

**Files:**
- Modify: `components/humidor/HumidorClient.tsx` — content container is the `<div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">` at ~line 654 (after the `headerHeight` spacer).

**Interfaces:**
- Consumes: `HumidorConditions` (Task 8). `HumidorClient` already receives `userId` as a prop.

- [ ] **Step 1: Add the import** (with the other component imports at the top)

```tsx
import { HumidorConditions } from "@/components/govee/HumidorConditions";
```

- [ ] **Step 2: Insert as first child of the content container**

```tsx
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        <div style={{ marginBottom: 12 }}>
          <HumidorConditions userId={userId} />
        </div>
        {/* ...existing content unchanged... */}
```

Note: `HumidorConditions` returns null for unconnected users, so the wrapper div renders empty (margin collapses on empty content is NOT guaranteed — use the exact structure above only if the existing first child doesn't already carry top spacing; otherwise put the `marginBottom` inline on the section via a wrapper only when connected. Simplest correct form: wrap in a fragment and let the component carry its own bottom margin — implementer: add `marginBottom: 12` to the `<section>` style in `HumidorConditions` instead of a wrapper div if the empty-wrapper spacing looks off in verification.)

- [ ] **Step 3: Verify** — `npm run build` → `/humidor` still prerenders static (`○`); `npm run check:shells` → green.

- [ ] **Step 4: Commit** — `git add components/humidor/HumidorClient.tsx && git commit -m "feat: humidor page sensor conditions strip"`

---

### Task 10: Account "Humidor Sensor" section

**Files:**
- Create: `components/govee/HumidorSensorSection.tsx`
- Modify: `components/account/AccountClient.tsx` — insert after `<NotificationsSection userId={userId} onToast={setToast} />` (~line 1801); add import.

**Interfaces:**
- Consumes: route contract from Task 6, `useGoveeStatus` (Task 8), `validateThresholds` (Task 2), `GoveeDevice` (Task 3 — import type only), `keyFor` + SWR `mutate`.
- Produces: `<HumidorSensorSection userId={string} tier={string} onToast={(msg: string) => void} />`.

- [ ] **Step 1: Write `components/govee/HumidorSensorSection.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useGoveeStatus } from "./useGoveeStatus";
import { validateThresholds, DEFAULT_THRESHOLDS, type ThresholdConfig } from "@/lib/govee/thresholds";
import type { GoveeDevice } from "@/lib/govee/api";

const card: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--card)", padding: 16,
};
const inputStyle: React.CSSProperties = {
  width: "100%", fontSize: 16, padding: "10px 12px", borderRadius: 6,
  border: "1px solid var(--border)", background: "var(--background)",
  color: "var(--foreground)",
};
const buttonStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, padding: "10px 16px", borderRadius: 6,
  border: "none", background: "var(--primary)", color: "var(--background)",
  cursor: "pointer", minHeight: 44,
};
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
  color: "var(--muted-foreground)", padding: "0 4px", marginBottom: 8,
};

async function postJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Something went wrong.");
  return json as T;
}

export function HumidorSensorSection({
  userId, tier, onToast,
}: { userId: string; tier: string; onToast: (msg: string) => void }) {
  const { status, mutate } = useGoveeStatus(tier !== "free" ? userId : null);

  const [apiKey,  setApiKey]  = useState("");
  const [devices, setDevices] = useState<GoveeDevice[] | null>(null);
  const [busy,    setBusy]    = useState(false);
  const [draft,   setDraft]   = useState<ThresholdConfig | null>(null);

  /* ── Free tier: locked teaser ─────────────────────────────── */
  if (tier === "free") {
    return (
      <div>
        <p style={label}>Humidor Sensor</p>
        <div style={card}>
          <p style={{ fontSize: 14, color: "var(--foreground)", marginBottom: 8 }}>
            Connect a Govee WiFi sensor to see live temperature and humidity for your humidor, with alerts when conditions drift.
          </p>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
            A Member perk. <Link href="/account" style={{ color: "var(--gold)" }}>Upgrade to Member</Link> to connect yours.
          </p>
        </div>
      </div>
    );
  }

  if (status === undefined) {
    return (
      <div>
        <p style={label}>Humidor Sensor</p>
        <div style={{ ...card, minHeight: 72 }} aria-busy="true" />
      </div>
    );
  }

  async function loadDevices() {
    setBusy(true);
    try {
      const { devices } = await postJson<{ devices: GoveeDevice[] }>("/api/govee/devices", "POST", { apiKey });
      if (devices.length === 0) {
        onToast("No supported WiFi sensors found on that Govee account.");
      }
      setDevices(devices);
    } catch (err) { onToast((err as Error).message); }
    finally { setBusy(false); }
  }

  async function connect(d: GoveeDevice) {
    setBusy(true);
    try {
      await postJson("/api/govee/connection", "POST", {
        apiKey, deviceId: d.device, sku: d.sku, deviceName: d.deviceName,
      });
      setApiKey(""); setDevices(null);
      await mutate();
      onToast("Sensor connected.");
    } catch (err) { onToast((err as Error).message); }
    finally { setBusy(false); }
  }

  async function saveThresholds() {
    if (!draft) return;
    if (!validateThresholds(draft)) {
      onToast("Ranges must be within 30 to 90% RH and 40 to 90°F, with min below max.");
      return;
    }
    setBusy(true);
    try {
      await postJson("/api/govee/connection", "PATCH", draft);
      setDraft(null);
      await mutate();
      onToast("Alert ranges saved.");
    } catch (err) { onToast((err as Error).message); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect this sensor? Your readings and alert settings will be removed.")) return;
    setBusy(true);
    try {
      await postJson("/api/govee/connection", "DELETE");
      await mutate();
      onToast("Sensor disconnected.");
    } catch (err) { onToast((err as Error).message); }
    finally { setBusy(false); }
  }

  /* ── Member, not connected: key entry + device picker ─────── */
  if (!status.connected) {
    return (
      <div>
        <p style={label}>Humidor Sensor</p>
        <div style={card}>
          <p style={{ fontSize: 14, color: "var(--foreground)", marginBottom: 6 }}>
            Connect a Govee WiFi thermo hygrometer (H5179 or H5103) to monitor your humidor.
          </p>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 12 }}>
            Get your free API key in the Govee Home app: Settings, About Us, Apply for API Key. Bluetooth only models like the H5075 are not supported.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Govee API key"
              autoComplete="off"
              style={inputStyle}
            />
            <button type="button" style={buttonStyle} disabled={busy || !apiKey.trim()} onClick={loadDevices}>
              {busy ? "Checking..." : "Find My Sensors"}
            </button>
          </div>

          {devices && devices.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {devices.map((d) => (
                <button
                  key={d.device}
                  type="button"
                  disabled={busy}
                  onClick={() => connect(d)}
                  style={{
                    ...inputStyle, cursor: "pointer", textAlign: "left",
                    display: "flex", justifyContent: "space-between",
                  }}
                >
                  <span>{d.deviceName}</span>
                  <span style={{ color: "var(--muted-foreground)" }}>{d.sku}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Connected ────────────────────────────────────────────── */
  const t = draft ?? status.thresholds ?? DEFAULT_THRESHOLDS;
  const needsReconnect = status.status !== "active";

  function bound(key: keyof ThresholdConfig, text: string) {
    return (
      <div>
        <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 4 }}>{text}</p>
        <input
          type="number"
          inputMode="numeric"
          value={t[key]}
          onChange={(e) => setDraft({ ...t, [key]: Number(e.target.value) })}
          style={inputStyle}
        />
      </div>
    );
  }

  return (
    <div>
      <p style={label}>Humidor Sensor</p>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>
            {status.deviceName ?? status.sku}
          </span>
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{status.sku}</span>
        </div>

        {needsReconnect && (
          <p style={{ fontSize: 13, color: "var(--ember)", marginBottom: 10 }}>
            {status.status === "auth_error"
              ? "Govee rejected your API key. Disconnect and reconnect with a fresh key."
              : "Your sensor is no longer on this Govee account. Disconnect and reconnect."}
          </p>
        )}

        {status.lastTempF !== null && status.lastHumidity !== null && (
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 12 }}>
            Latest reading: {Math.round(status.lastTempF)}°F, {Math.round(status.lastHumidity)}% RH
          </p>
        )}

        <p style={{ ...label, padding: 0 }}>Alert Ranges</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {bound("humidityMin", "Humidity min (%)")}
          {bound("humidityMax", "Humidity max (%)")}
          {bound("tempMinF", "Temp min (°F)")}
          {bound("tempMaxF", "Temp max (°F)")}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" style={buttonStyle} disabled={busy || draft === null} onClick={saveThresholds}>
            Save Ranges
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={disconnect}
            style={{ ...buttonStyle, background: "transparent", color: "var(--ember)", border: "1px solid var(--border)" }}
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `components/account/AccountClient.tsx`** — add import `import { HumidorSensorSection } from "@/components/govee/HumidorSensorSection";` and insert after the NotificationsSection line:

```tsx
          <NotificationsSection userId={userId} onToast={setToast} />

          <HumidorSensorSection
            userId={userId}
            tier={membership.currentTier}
            onToast={setToast}
          />
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` → clean; `npm run build` → `/account` stays static (`○`).

- [ ] **Step 4: Commit** — `git add components/govee components/account/AccountClient.tsx && git commit -m "feat: account humidor sensor section (connect, thresholds, disconnect)"`

---

### Task 11: Home dashboard carousel card

**Files:**
- Modify: `app/(app)/home/client-islands.tsx` (add two islands at the end)
- Modify: `app/(app)/home/page.tsx` (swap the inline pager for the island)

**Interfaces:**
- Consumes: `HumidorConditions`, `useGoveeStatus` (Task 8), `useAppSession` (`components/system/app-session`), `DashboardPager` + existing islands.
- Produces: `DashboardPagerIsland` — renders the pager with 3 slides, or 4 when a sensor is connected. `DashboardPager` uses `Children.toArray`, which drops null children, so the conditional child adds/removes a slide (and its dot) cleanly.

- [ ] **Step 1: Add to `app/(app)/home/client-islands.tsx`** (bottom of file; also add these imports at the top: `import { DashboardPager } from "@/components/dashboard/DashboardPager";`, `import { HumidorConditions } from "@/components/govee/HumidorConditions";`, `import { useGoveeStatus } from "@/components/govee/useGoveeStatus";`)

```tsx
/* Govee humidor sensor card — pager slide. */
export function GoveeSensorIsland() {
  const { ready, session } = useAppSession();
  if (!ready || !session) return null;
  return <HumidorConditions userId={session.userId} />;
}

/* Pager wrapper. Composed client-side because the sensor slide only
   exists when a sensor is connected (a null child would otherwise
   still occupy a slide slot server-side). Slide order keeps
   Notifications at initialIndex 1, matching the previous shell. */
export function DashboardPagerIsland() {
  const { ready, session } = useAppSession();
  const userId = ready && session ? session.userId : null;
  const { status } = useGoveeStatus(userId);
  const showSensor =
    status?.connected === true && status.lastTempF !== null && status.lastHumidity !== null;

  return (
    <DashboardPager initialIndex={1}>
      <SmokingConditionsIsland />
      <NotificationsIsland />
      <AgingIsland />
      {showSensor ? <GoveeSensorIsland /> : null}
    </DashboardPager>
  );
}
```

- [ ] **Step 2: Update `app/(app)/home/page.tsx`** — replace the pager block:

```tsx
        {/* 2. Dashboard pager: conditions · notifications · aging · sensor. */}
        <DashboardPagerIsland />
```

Remove from page.tsx: the `DashboardPager` import and the now-unused `SmokingConditionsIsland`, `NotificationsIsland`, `AgingIsland` names from the client-islands import (they're still exported for the island file's internal use). Add `DashboardPagerIsland` to that import list.

- [ ] **Step 3: Verify** — `npm run build` → `/home` still `○`; `npm run check:shells` → green; `npx tsc --noEmit` → clean (no unused-import lint errors in page.tsx).

- [ ] **Step 4: Commit** — `git add 'app/(app)/home' && git commit -m "feat: home dashboard humidor sensor card (shown when connected)"`

---

### Task 12: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Unit tests** — `npm run test:unit` → all PASS (thresholds, api, plus existing suites).
- [ ] **Step 2: Types + build** — `npx tsc --noEmit` clean; `npm run build` succeeds; `/home`, `/humidor`, `/account` all prerender static (`○`); new `/api/govee/*` and `/api/cron/govee-poll` routes listed as dynamic (`ƒ`).
- [ ] **Step 3: Shell + bundle gates** — `npm run check:shells` green; `npm run analyze && npm run check:bundle` within budget (expect a small delta on humidor/home/account client chunks; nothing new in shared).
- [ ] **Step 4: Manual cron smoke** — with dev server running and the table applied (Task 1 gate), `curl -s -X POST http://localhost:3000/api/cron/govee-poll -H "x-sync-secret: $SYNC_SECRET"` → `{"ok":true,"polled":0,...}` (zero rows is the expected pre-hardware state).
- [ ] **Step 5: Commit any fixes** — `git commit -m "fix: <specific issue found in verification>"` per fix, no bundling.

---

### Task 13: Ship gate — live probe + runtime verification (BLOCKED until H5179 arrives + Task 1 SQL applied)

**Files:**
- Possibly modify: `lib/govee/api.ts`, `lib/govee/__tests__/api.test.ts` (fixture reconciliation)

- [ ] **Step 1: Dave applies the Task 1 SQL** in the Supabase SQL editor and confirms via the verify query.
- [ ] **Step 2: Live probe** — Dave generates his API key in the Govee Home app; run `npx tsx scripts/govee-probe.ts <key>`. Compare the printed payloads to the test fixtures in `lib/govee/__tests__/api.test.ts`.
- [ ] **Step 3: Reconcile** — if shapes differ (field names, temperature unit, value wrapping), update the fixtures to the REAL payloads first (RED), then fix `lib/govee/api.ts` parsing (GREEN). If Govee returns Celsius, convert to °F in `fetchSensorReading` (`f = c * 9/5 + 32`) so the rest of the system stays Fahrenheit-only. Commit: `git commit -m "fix: reconcile govee parsing with live api payloads"`.
- [ ] **Step 4: End-to-end on real data** — connect the sensor through /account with Dave's key; confirm the strip on /humidor, the card on /home, and a row in `govee_connections`. Temporarily set a threshold the current reading violates, run the cron manually (`curl` as in Task 12), confirm the push arrives and a second manual run does NOT re-alert (transition-only). Reset thresholds.
- [ ] **Step 5: verify-in-app** — run the `verify-in-app` project skill for /account (sensor section), /humidor (strip), /home (card): logged-in screenshots + console/5xx checks.
- [ ] **Step 6: PR** — push branch, open PR against main (`gh pr list --head feat/govee-humidor-sensor --state all` preflight first). PR body includes the test plan and flags the manual SQL as the pre-deploy gate. Note: `CRON_SECRET` must be set in Vercel env for the new cron (it already is if existing crons run in prod; verify).

---

## Self-Review Notes (completed during planning)

- **Premise freshness:** all consumed signatures verified against the working tree this session: `sendPushToUser(userId, payload, category)`, `createServiceClientFor(callerId, reason)`, `getServerUser()`, `isPaidMember(profile)` with `membership_tier, badge, assigned_badges`, `checkRateLimit(userId, {limit, window, prefix})`, `startCronRun(name, schedule)`/`finishCronRun`, `keyFor` tuple convention + `jsonFetcher`, `NOTIFICATION_CATEGORIES` shape, `AccountClient` section stack (insert point ~line 1801), `HumidorClient` content container (~line 654), `DashboardPager` `Children.toArray` behavior, home `client-islands.tsx` `useAppSession` pattern, vitest `test:unit` scoped to `lib/`, `tsx` available.
- **Spec coverage:** migration (T1), thresholds+cooldown (T2), Govee client + SKU filter (T3), probe (T4/T13), category (T5), routes incl. member gate + rate limits + friendly errors (T6), cron + alert copy + failure isolation (T7), SWR key + strip + stale badge (T8), humidor surface (T9), account section incl. teaser/reconnect states (T10), home card conditional slide (T11), perf/shell/bundle gates (T12), live probe + e2e + verify-in-app + PR (T13). No gaps found.
- **Type consistency:** `ThresholdConfig`/`AlertState`/`SensorReading` names identical across T2/T6/T7/T8/T10; `GoveeStatusResponse` fields match `rowToStatus` output and all client consumers; `keyFor.goveeStatus` used by the single hook only.
- **State lifecycle:** `HumidorSensorSection` — `draft` starts null (displays server thresholds), first edit copies current values, save clears draft and revalidates; `mutate()` after connect/disconnect keeps all three surfaces coherent via the shared key. `DashboardPagerIsland` — slide count change on connect resets nothing (active index 1 stays valid at n=3 or n=4).
