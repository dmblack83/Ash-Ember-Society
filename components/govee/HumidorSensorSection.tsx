"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { keyFor, jsonFetcher } from "@/lib/data/keys";
import type { GoveeKeyStatus } from "@/lib/govee/types";

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
  const { data: status, mutate } = useSWR<GoveeKeyStatus>(
    tier !== "free" ? keyFor.goveeKey(userId) : null,
    () => jsonFetcher<GoveeKeyStatus>("/api/govee/connection"),
  );

  const [apiKey, setApiKey] = useState("");
  const [busy,   setBusy]   = useState(false);

  /* ── Free tier: locked teaser ─────────────────────────────── */
  if (tier === "free") {
    return (
      <div>
        <p style={label}>Humidor Sensor</p>
        <div style={card}>
          <p style={{ fontSize: 14, color: "var(--foreground)", marginBottom: 8 }}>
            Connect a Govee sensor to monitor your humidors.
          </p>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
            A Member perk. <Link href="/account?tab=membership" style={{ color: "var(--gold)" }}>Upgrade to Member</Link> to connect yours.
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

  async function connect() {
    setBusy(true);
    try {
      await postJson<GoveeKeyStatus>("/api/govee/connection", "POST", { apiKey });
      setApiKey("");
      await mutate();
      onToast("Govee account connected.");
    } catch (err) { onToast((err as Error).message); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect your Govee account? All humidor sensors will stop updating.")) return;
    setBusy(true);
    try {
      await postJson("/api/govee/connection", "DELETE");
      await mutate();
      onToast("Govee account disconnected.");
    } catch (err) { onToast((err as Error).message); }
    finally { setBusy(false); }
  }

  const needsReconnect = status.keyConnected && status.keyStatus === "auth_error";

  /* ── Member, connected + active: manage from My Humidors ─────── */
  if (status.keyConnected && !needsReconnect) {
    return (
      <div>
        <p style={label}>Humidor Sensor</p>
        <div style={card}>
          <p style={{ fontSize: 14, color: "var(--foreground)", marginBottom: 6 }}>
            Govee account connected.
          </p>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 12 }}>
            Assign sensors to humidors from the My Humidors page.
          </p>
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
    );
  }

  /* ── Member, no key or key rejected: explainer + key entry ───── */
  return (
    <div>
      <p style={label}>Humidor Sensor</p>
      <div style={card}>
        {needsReconnect ? (
          <p style={{ fontSize: 14, color: "var(--ember)", marginBottom: 12 }}>
            Govee rejected your API key. Reconnect with a fresh key.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 14, color: "var(--foreground)", marginBottom: 6 }}>
              Connect a Govee WiFi thermo hygrometer (H5179 or H5103) to monitor your humidors.
            </p>
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 12 }}>
              Get your free API key in the Govee Home app: Settings, About Us, Apply for API Key. Bluetooth only models like the H5075 are not supported.
            </p>
          </>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Govee API key"
            autoComplete="off"
            style={inputStyle}
          />
          <button type="button" style={buttonStyle} disabled={busy || !apiKey.trim()} onClick={connect}>
            {busy ? "Connecting..." : "Connect Govee Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
