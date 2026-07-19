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
