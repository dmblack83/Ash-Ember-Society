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
