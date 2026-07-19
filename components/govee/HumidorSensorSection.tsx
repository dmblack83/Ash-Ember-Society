"use client";

import { useState } from "react";
import Link from "next/link";
import { useGoveeStatus } from "./useGoveeStatus";
import { validateThresholds, DEFAULT_THRESHOLDS, type ThresholdConfig } from "@/lib/govee/thresholds";
import type { GoveeDevice } from "@/lib/govee/api";

const card: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--card)", padding: 16,
};
const inputStyle: React.CSSProperties = {
  width: "100%", fontSize: 16, padding: "10px 12px", borderRadius: 6,
  border: "1px solid var(--border)", background: "var(--background)",
  color: "var(--foreground)",
};
const buttonStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, padding: "10px 16px", borderRadius: 6,
  border: "none", background: "var(--primary)", color: "var(--background)",
  cursor: "pointer", minHeight: 44,
};
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
  color: "var(--muted-foreground)", padding: "0 4px", marginBottom: 8,
};

async function postJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Something went wrong.");
  return json as T;
}

export function HumidorSensorSection({
  userId, tier, onToast,
}: { userId: string; tier: string; onToast: (msg: string) => void }) {
  const { status, mutate } = useGoveeStatus(tier !== "free" ? userId : null);

  const [apiKey,  setApiKey]  = useState("");
  const [devices, setDevices] = useState<GoveeDevice[] | null>(null);
  const [busy,    setBusy]    = useState(false);
  const [draft,   setDraft]   = useState<ThresholdConfig | null>(null);

  /* ── Free tier: locked teaser ─────────────────────────────── */
  if (tier === "free") {
    return (
      <div>
        <p style={label}>Humidor Sensor</p>
        <div style={card}>
          <p style={{ fontSize: 14, color: "var(--foreground)", marginBottom: 8 }}>
            Connect a Govee WiFi sensor to see live temperature and humidity for your humidor, with alerts when conditions drift.
          </p>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
            A Member perk. <Link href="/account" style={{ color: "var(--gold)" }}>Upgrade to Member</Link> to connect yours.
          </p>
        </div>
      </div>
    );
  }

  if (status === undefined) {
    return (
      <div>
        <p style={label}>Humidor Sensor</p>
        <div style={{ ...card, minHeight: 72 }} aria-busy="true" />
      </div>
    );
  }

  async function loadDevices() {
    setBusy(true);
    try {
      const { devices } = await postJson<{ devices: GoveeDevice[] }>("/api/govee/devices", "POST", { apiKey });
      if (devices.length === 0) {
        onToast("No supported WiFi sensors found on that Govee account.");
      }
      setDevices(devices);
    } catch (err) { onToast((err as Error).message); }
    finally { setBusy(false); }
  }

  async function connect(d: GoveeDevice) {
    setBusy(true);
    try {
      await postJson("/api/govee/connection", "POST", {
        apiKey, deviceId: d.device, sku: d.sku, deviceName: d.deviceName,
      });
      setApiKey(""); setDevices(null);
      await mutate();
      onToast("Sensor connected.");
    } catch (err) { onToast((err as Error).message); }
    finally { setBusy(false); }
  }

  async function saveThresholds() {
    if (!draft) return;
    if (!validateThresholds(draft)) {
      onToast("Ranges must be within 30 to 90% RH and 40 to 90°F, with min below max.");
      return;
    }
    setBusy(true);
    try {
      await postJson("/api/govee/connection", "PATCH", draft);
      setDraft(null);
      await mutate();
      onToast("Alert ranges saved.");
    } catch (err) { onToast((err as Error).message); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect this sensor? Your readings and alert settings will be removed.")) return;
    setBusy(true);
    try {
      await postJson("/api/govee/connection", "DELETE");
      await mutate();
      onToast("Sensor disconnected.");
    } catch (err) { onToast((err as Error).message); }
    finally { setBusy(false); }
  }

  /* ── Member, not connected: key entry + device picker ─────── */
  if (!status.connected) {
    return (
      <div>
        <p style={label}>Humidor Sensor</p>
        <div style={card}>
          <p style={{ fontSize: 14, color: "var(--foreground)", marginBottom: 6 }}>
            Connect a Govee WiFi thermo hygrometer (H5179 or H5103) to monitor your humidor.
          </p>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 12 }}>
            Get your free API key in the Govee Home app: Settings, About Us, Apply for API Key. Bluetooth only models like the H5075 are not supported.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Govee API key"
              autoComplete="off"
              style={inputStyle}
            />
            <button type="button" style={buttonStyle} disabled={busy || !apiKey.trim()} onClick={loadDevices}>
              {busy ? "Checking..." : "Find My Sensors"}
            </button>
          </div>

          {devices && devices.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {devices.map((d) => (
                <button
                  key={d.device}
                  type="button"
                  disabled={busy}
                  onClick={() => connect(d)}
                  style={{
                    ...inputStyle, cursor: "pointer", textAlign: "left",
                    display: "flex", justifyContent: "space-between",
                  }}
                >
                  <span>{d.deviceName}</span>
                  <span style={{ color: "var(--muted-foreground)" }}>{d.sku}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Connected ────────────────────────────────────────────── */
  const t = draft ?? status.thresholds ?? DEFAULT_THRESHOLDS;
  const needsReconnect = status.status !== "active";

  function bound(key: keyof ThresholdConfig, text: string) {
    return (
      <div>
        <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 4 }}>{text}</p>
        <input
          type="number"
          inputMode="numeric"
          value={t[key]}
          onChange={(e) => setDraft({ ...t, [key]: Number(e.target.value) })}
          style={inputStyle}
        />
      </div>
    );
  }

  return (
    <div>
      <p style={label}>Humidor Sensor</p>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>
            {status.deviceName ?? status.sku}
          </span>
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{status.sku}</span>
        </div>

        {needsReconnect && (
          <p style={{ fontSize: 13, color: "var(--ember)", marginBottom: 10 }}>
            {status.status === "auth_error"
              ? "Govee rejected your API key. Disconnect and reconnect with a fresh key."
              : "Your sensor is no longer on this Govee account. Disconnect and reconnect."}
          </p>
        )}

        {status.lastTempF !== null && status.lastHumidity !== null && (
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 12 }}>
            Latest reading: {Math.round(status.lastTempF)}°F, {Math.round(status.lastHumidity)}% RH
          </p>
        )}

        <p style={{ ...label, padding: 0 }}>Alert Ranges</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {bound("humidityMin", "Humidity min (%)")}
          {bound("humidityMax", "Humidity max (%)")}
          {bound("tempMinF", "Temp min (°F)")}
          {bound("tempMaxF", "Temp max (°F)")}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" style={buttonStyle} disabled={busy || draft === null} onClick={saveThresholds}>
            Save Ranges
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={disconnect}
            style={{ ...buttonStyle, background: "transparent", color: "var(--ember)", border: "1px solid var(--border)" }}
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
