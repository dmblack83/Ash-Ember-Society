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
