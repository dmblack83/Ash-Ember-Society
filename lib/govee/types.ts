/* Client-safe Govee account-level status. Per-humidor sensor data
   now lives on the humidors table (own-row RLS) and is read directly
   by the client — see lib/data/humidors.ts. */
export interface GoveeKeyStatus {
  keyConnected: boolean;
  keyStatus: "active" | "auth_error" | null;
}
