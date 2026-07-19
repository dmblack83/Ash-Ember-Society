import { afterEach, describe, expect, test, vi } from "vitest";
import { listSensorDevices, fetchSensorReading, GoveeAuthError, GoveeApiError, SUPPORTED_SENSOR_SKUS } from "../api";

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
  test("throws GoveeApiError on non-auth failure (500)", async () => {
    mockFetch(500, { code: 500, message: "server error" });
    await expect(listSensorDevices("key")).rejects.toBeInstanceOf(GoveeApiError);
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
