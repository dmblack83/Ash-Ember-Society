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
