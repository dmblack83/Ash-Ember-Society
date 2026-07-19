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
