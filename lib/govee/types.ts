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
