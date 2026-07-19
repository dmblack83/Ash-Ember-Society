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
