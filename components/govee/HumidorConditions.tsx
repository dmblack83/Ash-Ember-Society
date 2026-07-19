"use client";

import { useState } from "react";
import { useHumidors } from "@/components/humidor/useHumidors";
import { deriveOverview, isHumidorOut } from "@/lib/humidor/overview";
import { isMetricOutOfRange, type SensorReading, type ThresholdConfig } from "@/lib/govee/thresholds";
import type { Humidor } from "@/lib/data/humidors";

const STALE_AFTER_MS = 45 * 60_000;

function agoLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function cfgOf(h: Humidor): ThresholdConfig {
  return { humidityMin: h.humidity_min, humidityMax: h.humidity_max, tempMinF: h.temp_min_f, tempMaxF: h.temp_max_f };
}
function readingOf(h: Humidor): SensorReading | null {
  if (h.last_temp_f === null || h.last_humidity === null) return null;
  return { tempF: h.last_temp_f, humidity: h.last_humidity };
}
function metaLabel(h: Humidor): string {
  if (h.sensor_status !== "active") return "reconnect needed";
  if (!h.last_reading_at) return "";
  if (Date.now() - Date.parse(h.last_reading_at) > STALE_AFTER_MS) return "sensor not reporting";
  return `as of ${agoLabel(h.last_reading_at)}`;
}

const eyebrowStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.28em",
  textTransform: "uppercase", color: "var(--muted-foreground)",
  display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
};
const sectionStyle: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 6,
  background: "var(--card)", padding: "12px 14px",
};
const pillStyle = (bad: boolean): React.CSSProperties => ({
  fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
  color: bad ? "var(--ember)" : "var(--moss, #8fa36a)",
  background: bad ? "rgba(232,100,44,0.14)" : "rgba(143,163,106,0.12)",
});

function Metric({ label, value, out }: { label: string; value: string; out: boolean }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em",
                    textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, lineHeight: 1,
                    color: out ? "var(--ember)" : "var(--foreground)" }}>
        {value}
      </div>
    </div>
  );
}

function EditPencil({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Edit humidor"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ background: "none", border: "none", color: "var(--muted-foreground)",
               fontSize: 14, cursor: "pointer", padding: "4px 6px" }}
    >
      ✎
    </button>
  );
}

function SingleStrip({ h, onEdit }: { h: Humidor; onEdit?: (id: string) => void }) {
  const reading = readingOf(h);
  const hasSensor = h.device_id !== null;
  const out = isHumidorOut(h);
  return (
    <section aria-label="Humidor conditions" style={sectionStyle}>
      <div style={eyebrowStyle}>
        <span aria-hidden="true" style={{ width: 18, height: 1, background: "var(--gold)" }} />
        Humidor Conditions
        <span style={{ marginLeft: "auto", letterSpacing: "0.05em", textTransform: "none" }}>
          {hasSensor ? metaLabel(h) : ""}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 19, color: "var(--foreground)" }}>
          {h.name}
        </span>
        <span style={{ display: "flex", alignItems: "center" }}>
          {hasSensor && reading ? (
            <span style={pillStyle(out)}>{out ? "Needs attention" : "In range"}</span>
          ) : hasSensor ? (
            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>awaiting first reading</span>
          ) : (
            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>No sensor</span>
          )}
          {onEdit && <EditPencil onClick={() => onEdit(h.id)} />}
        </span>
      </div>
      {hasSensor && reading && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, paddingTop: 12 }}>
          <Metric label="Temp" value={`${Math.round(reading.tempF)}°F`}
                  out={isMetricOutOfRange(reading, cfgOf(h), "temp")} />
          <Metric label="Humidity" value={`${Math.round(reading.humidity)}%`}
                  out={isMetricOutOfRange(reading, cfgOf(h), "humidity")} />
        </div>
      )}
    </section>
  );
}

export function HumidorConditions({
  userId, humidorId, onEdit, onSelect, counts,
}: {
  userId: string;
  humidorId?: string | null;
  onEdit?: (humidorId: string) => void;
  onSelect?: (humidorId: string) => void;
  counts?: Map<string, number>;
}) {
  const { humidors } = useHumidors(userId);
  const [expanded, setExpanded] = useState(false);
  if (!humidors || humidors.length === 0) return null;

  if (humidorId) {
    const h = humidors.find((x) => x.id === humidorId);
    return h ? <SingleStrip h={h} onEdit={onEdit} /> : null;
  }

  const v = deriveOverview(humidors);
  if (humidors.length === 1) {
    /* one humidor: single strip only once a reading exists, else nothing
       (matches the pre-multi-humidor behavior exactly) */
    return readingOf(humidors[0]) !== null ? <SingleStrip h={humidors[0]} onEdit={onEdit} /> : null;
  }
  if (v.sensored === 0 && !onEdit) return null; // home: nothing to show

  function toggleExpanded() {
    setExpanded((e) => !e);
  }

  return (
    <section aria-label="Humidor conditions" style={sectionStyle}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggleExpanded}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleExpanded();
          }
        }}
        style={{ cursor: "pointer" }}
      >
        <div style={eyebrowStyle}>
          <span aria-hidden="true" style={{ width: 18, height: 1, background: "var(--gold)" }} />
          Humidor Conditions
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 19, color: "var(--foreground)" }}>
            {v.total} humidors
          </span>
          <span>
            {v.pill && <span style={pillStyle(v.pill === "bad")}>{v.pillLabel}</span>}
            <span aria-hidden="true" style={{ color: "var(--muted-foreground)", fontSize: 12, marginLeft: 8,
              display: "inline-block", transition: "transform .25s",
              transform: expanded ? "rotate(180deg)" : "none" }}>▾</span>
          </span>
        </div>
      </div>
      {expanded && (
        <div style={{ paddingTop: 10 }}>
          {humidors.map((h) => {
            const reading = readingOf(h);
            const out = isHumidorOut(h);
            return (
              <div
                key={h.id}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(h.id); } : undefined}
                onKeyDown={onSelect ? (e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(h.id);
                  }
                } : undefined}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 2px",
                         borderTop: "1px solid var(--border)",
                         cursor: onSelect ? "pointer" : "default" }}
              >
                <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 17,
                               flex: "1 1 auto", minWidth: 0, color: "var(--foreground)" }}>
                  {h.name}
                </span>
                {counts && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>
                    {counts.get(h.id) ?? 0} cigars
                  </span>
                )}
                {h.device_id && reading ? (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--foreground)" }}>
                    {Math.round(reading.tempF)}°F ·{" "}
                    <span style={{ color: out ? "var(--ember)" : undefined, fontWeight: out ? 700 : 400 }}>
                      {Math.round(reading.humidity)}%
                    </span>
                  </span>
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>
                    no sensor
                  </span>
                )}
                {onEdit && <EditPencil onClick={() => onEdit(h.id)} />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
