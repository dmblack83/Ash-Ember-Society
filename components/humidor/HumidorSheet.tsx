"use client";

/* HumidorSheet — create / edit / delete a humidor, with inline Govee
   sensor assignment. Always-mounted (BottomSheet contract): every
   piece of local state re-derives from props in one effect keyed on
   [open, editing?.id] so nothing survives across opens (the #582
   stale-draft bug class). */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  createHumidor,
  updateHumidor,
  deleteHumidor,
  HumidorLimitReachedError,
  type Humidor,
} from "@/lib/data/humidors";
import { validateThresholds, DEFAULT_THRESHOLDS, type ThresholdConfig } from "@/lib/govee/thresholds";

interface GoveeDevice {
  sku: string;
  device: string;
  deviceName: string;
  assignedHumidorId: string | null;
}

type SensorSelection = { device: string; sku: string; deviceName: string } | "none";

const HUMIDOR_TYPES: { value: Humidor["type"]; label: string }[] = [
  { value: "humidor", label: "Humidor" },
  { value: "tupperdor", label: "Tupperdor" },
  { value: "cooler", label: "Cooler" },
  { value: "travel", label: "Travel" },
];

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
const chipStyle = (active: boolean): React.CSSProperties => ({
  fontSize: 13, padding: "8px 14px", borderRadius: 999,
  border: `1px solid ${active ? "var(--gold)" : "var(--border)"}`,
  background: active ? "var(--secondary)" : "transparent",
  color: active ? "var(--foreground)" : "var(--muted-foreground)",
  cursor: "pointer", whiteSpace: "nowrap",
});
const optionStyle = (selected: boolean): React.CSSProperties => ({
  ...inputStyle,
  display: "flex", justifyContent: "space-between", alignItems: "center",
  textAlign: "left", cursor: "pointer",
  border: `1px solid ${selected ? "var(--gold)" : "var(--border)"}`,
  color: selected ? "var(--foreground)" : "var(--muted-foreground)",
});

async function postJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((json as { error?: string }).error ?? "Something went wrong.") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json as T;
}

function sameSelection(a: SensorSelection, b: SensorSelection): boolean {
  if (a === "none" || b === "none") return a === b;
  return a.device === b.device;
}

export interface HumidorSheetProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  tier: string;
  humidors: Humidor[];
  editing: Humidor | null;
  deleteCount?: number;
  onChanged: () => Promise<unknown>;
  onToast: (msg: string) => void;
  /** Called with the newly created humidor right after createHumidor
      succeeds (before/independent of sensor assignment outcome). Lets
      callers auto-filter to the new (empty) humidor. */
  onCreated?: (humidor: Humidor) => void;
}

export function HumidorSheet({
  open, onClose, userId, tier, humidors, editing, deleteCount = 0, onChanged, onToast, onCreated,
}: HumidorSheetProps) {
  const isEdit = editing !== null;

  const [name, setName]           = useState("");
  const [type, setType]           = useState<Humidor["type"]>("humidor");
  const [sensorSel, setSensorSel] = useState<SensorSelection>("none");
  const [initialSensorSel, setInitialSensorSel] = useState<SensorSelection>("none");
  const [devices, setDevices]     = useState<GoveeDevice[] | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [noKey, setNoKey]         = useState(false);
  /* One device fetch per sheet-open, tracked in a ref: state-in-deps
     was the bug class here — setting loading state inside the effect
     re-ran the effect, whose cleanup cancelled the in-flight fetch,
     leaving a permanent skeleton. The ref never triggers a re-run;
     the reset effect re-arms it on the next open. */
  const fetchStartedRef = useRef(false);
  const [draftRanges, setDraftRanges] = useState<ThresholdConfig | null>(null);
  const [deleteOpen, setDeleteOpen]   = useState(false);
  const [destId, setDestId]           = useState<string | null>(null);
  const [busy, setBusy]               = useState(false);
  const [upsell, setUpsell]           = useState(false);

  /* Reset ALL local state whenever the sheet opens (or the humidor
     being edited changes while it's open). Sheet stays mounted the
     rest of the time, so this is the only place state gets derived
     from props. */
  useEffect(() => {
    if (!open) return;

    setName(editing?.name ?? "");
    setType(editing?.type ?? "humidor");
    const initial: SensorSelection = editing?.device_id
      ? { device: editing.device_id, sku: editing.sku ?? "", deviceName: editing.device_name ?? "" }
      : "none";
    setSensorSel(initial);
    setInitialSensorSel(initial);
    setDevices(null);
    setDevicesLoading(false);
    fetchStartedRef.current = false;
    setNoKey(false);
    setDraftRanges(null);
    setDeleteOpen(false);
    setDestId(null);
    setBusy(false);
    setUpsell(tier === "free" && !editing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  /* Lazily load the account's Govee devices for a connected Member,
     once per open (skipped entirely for free tier / the upsell body).
     Deps are open/tier/upsell only — never the state this effect sets,
     so the effect can't re-run and cancel its own fetch. `stale` only
     flips when the sheet closes (open -> false runs the cleanup),
     discarding a fetch that resolves after close; the reopen resets
     fetchStartedRef and fires a fresh one. */
  useEffect(() => {
    if (!open || tier === "free" || upsell || fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    let stale = false;
    setDevicesLoading(true);
    postJson<{ devices: GoveeDevice[] }>("/api/govee/devices", "POST")
      .then(({ devices: fetched }) => {
        if (stale) return;
        setDevices(fetched);
      })
      .catch((err: Error & { status?: number }) => {
        if (stale) return;
        if (err.status === 409) {
          setNoKey(true);
        } else {
          onToast(err.message);
        }
      })
      .finally(() => {
        if (stale) return;
        setDevicesLoading(false);
      });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tier, upsell, editing?.id]);

  /* ── Free tier, create mode: upsell only, no form. ────────────── */
  if (upsell) {
    return (
      <BottomSheet open={open} onClose={onClose} ariaLabel="Add a humidor">
        <div style={{ padding: "4px 20px 28px" }}>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, marginBottom: 10 }}>
            More humidors, more room
          </h2>
          <p style={{ fontSize: 14, color: "var(--foreground)", lineHeight: 1.5, marginBottom: 8 }}>
            Organize your collection across cabinets, tupperdors, coolers and travel cases, each with its own sensor and alerts.
          </p>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 18 }}>
            Multiple humidors is a Member perk.
          </p>
          <Link
            href="/account?tab=membership"
            style={{ ...buttonStyle, display: "block", textAlign: "center", textDecoration: "none" }}
          >
            Upgrade to Member
          </Link>
        </div>
      </BottomSheet>
    );
  }

  const otherHumidors = editing
    ? humidors
        .filter((h) => h.id !== editing.id)
        .slice()
        .sort((a, b) => Number(b.is_default) - Number(a.is_default))
    : [];
  const effectiveDestId = destId ?? otherHumidors.find((h) => h.is_default)?.id ?? otherHumidors[0]?.id ?? null;

  const visibleDevices = (devices ?? []).filter(
    (d) => d.assignedHumidorId === null || d.assignedHumidorId === editing?.id,
  );

  function selectSensor(sel: SensorSelection) {
    setSensorSel(sel);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      onToast("Give this humidor a name.");
      return;
    }

    let ranges: ThresholdConfig | null = null;
    if (isEdit && draftRanges !== null) {
      ranges = validateThresholds(draftRanges);
      if (!ranges) {
        onToast("Ranges must be within 30 to 90% RH and 40 to 90°F, with min below max.");
        return;
      }
    }

    setBusy(true);
    try {
      let humidorId: string;
      if (isEdit && editing) {
        humidorId = editing.id;
        await updateHumidor(editing.id, {
          name: trimmed,
          type,
          /* ThresholdConfig keys are camelCase; the humidors columns
             are snake_case. Map explicitly — a spread compiles (TS
             skips excess-property checks on spreads) but PostgREST
             rejects the unknown camelCase columns at runtime. */
          ...(ranges
            ? {
                humidity_min: ranges.humidityMin,
                humidity_max: ranges.humidityMax,
                temp_min_f:   ranges.tempMinF,
                temp_max_f:   ranges.tempMaxF,
              }
            : {}),
        });
      } else {
        try {
          const created = await createHumidor(userId, trimmed, type);
          humidorId = created.id;
          onCreated?.(created);
        } catch (err) {
          if (err instanceof HumidorLimitReachedError) {
            setUpsell(true);
            setBusy(false);
            return;
          }
          throw err;
        }
      }

      if (!sameSelection(sensorSel, initialSensorSel)) {
        try {
          if (sensorSel === "none") {
            await postJson("/api/govee/assign", "DELETE", { humidorId });
          } else {
            await postJson("/api/govee/assign", "POST", {
              humidorId, deviceId: sensorSel.device, sku: sensorSel.sku, deviceName: sensorSel.deviceName,
            });
          }
        } catch (err) {
          onToast((err as Error).message);
        }
      }

      await onChanged();
      onToast(isEdit ? `${trimmed} saved` : `${trimmed} created`);
      onClose();
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!editing || !effectiveDestId) return;
    setBusy(true);
    try {
      await deleteHumidor(editing.id, effectiveDestId);
      await onChanged();
      onToast(`${editing.name} deleted`);
      onClose();
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function bound(key: keyof ThresholdConfig, text: string) {
    const t = draftRanges ?? {
      humidityMin: editing?.humidity_min ?? DEFAULT_THRESHOLDS.humidityMin,
      humidityMax: editing?.humidity_max ?? DEFAULT_THRESHOLDS.humidityMax,
      tempMinF: editing?.temp_min_f ?? DEFAULT_THRESHOLDS.tempMinF,
      tempMaxF: editing?.temp_max_f ?? DEFAULT_THRESHOLDS.tempMaxF,
    };
    return (
      <div>
        <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 4 }}>{text}</p>
        <input
          type="number"
          inputMode="numeric"
          value={t[key]}
          onChange={(e) => setDraftRanges({ ...t, [key]: Number(e.target.value) })}
          style={inputStyle}
        />
      </div>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel={isEdit ? "Edit humidor" : "New humidor"}>
      <div style={{ padding: "4px 20px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700 }}>
          {isEdit ? "Edit Humidor" : "New Humidor"}
        </h2>

        <div>
          <p style={label}>Name</p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Desk Tupperdor"
            style={inputStyle}
          />
        </div>

        <div>
          <p style={label}>Type</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {HUMIDOR_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                style={chipStyle(type === t.value)}
                onClick={() => setType(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tier !== "free" && (
          <div>
            <p style={label}>Govee Sensor</p>
            {noKey ? (
              <div style={card}>
                <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                  Connect your Govee account first. <Link href="/account" style={{ color: "var(--gold)" }}>Set it up in Account</Link>.
                </p>
              </div>
            ) : devicesLoading ? (
              <div style={{ ...card, minHeight: 60 }} aria-busy="true" />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {visibleDevices.map((d) => {
                  const selected = sensorSel !== "none" && sensorSel.device === d.device;
                  return (
                    <button
                      key={d.device}
                      type="button"
                      style={optionStyle(selected)}
                      onClick={() => selectSensor({ device: d.device, sku: d.sku, deviceName: d.deviceName })}
                    >
                      <span>{d.deviceName} <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>{d.sku}</span></span>
                      {selected && <span style={{ color: "var(--gold)" }}>✓</span>}
                    </button>
                  );
                })}
                <button
                  type="button"
                  style={optionStyle(sensorSel === "none")}
                  onClick={() => selectSensor("none")}
                >
                  <span>{isEdit ? "No sensor" : "No sensor for now"}</span>
                  {sensorSel === "none" && <span style={{ color: "var(--gold)" }}>✓</span>}
                </button>
                {!isEdit && (
                  <p style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                    Sensors already assigned to another humidor do not appear here.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {isEdit && (
          <div>
            <p style={label}>Alert Ranges</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {bound("humidityMin", "Humidity min (%)")}
              {bound("humidityMax", "Humidity max (%)")}
              {bound("tempMinF", "Temp min (°F)")}
              {bound("tempMaxF", "Temp max (°F)")}
            </div>
          </div>
        )}

        <button type="button" style={buttonStyle} disabled={busy || !name.trim()} onClick={save}>
          {busy ? "Saving..." : isEdit ? "Save Changes" : "Create Humidor"}
        </button>

        {isEdit && editing && !editing.is_default && (
          <div style={{ textAlign: "center" }}>
            <button
              type="button"
              onClick={() => setDeleteOpen((v) => !v)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--ember)", fontSize: 14, fontWeight: 600,
              }}
            >
              Delete Humidor
            </button>
            <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>
              Burn history is always kept.
            </p>

            {deleteOpen && (
              <div style={{
                marginTop: 12, textAlign: "left", background: "var(--background)",
                border: "1px solid rgba(232,100,44,0.4)", borderRadius: 10, padding: 12,
              }}>
                {otherHumidors.length === 1 ? (
                  /* One possible destination: no picker, just the
                     confirm text (approved-mockup behavior). */
                  <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 12 }}>
                    Its {deleteCount} {deleteCount === 1 ? "cigar moves" : "cigars move"} to {otherHumidors[0].name}.
                  </p>
                ) : (
                  <>
                    <p style={{ ...label, padding: 0, marginBottom: 8 }}>
                      Move {deleteCount} {deleteCount === 1 ? "cigar" : "cigars"} to
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                      {otherHumidors.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          style={optionStyle(effectiveDestId === h.id)}
                          onClick={() => setDestId(h.id)}
                        >
                          <span>
                            {h.name}
                            {h.is_default && (
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", marginLeft: 6 }}>
                                default
                              </span>
                            )}
                          </span>
                          {effectiveDestId === h.id && <span style={{ color: "var(--gold)" }}>✓</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <button
                  type="button"
                  disabled={busy || !effectiveDestId}
                  onClick={confirmDelete}
                  style={{ ...buttonStyle, width: "100%", background: "var(--ember)" }}
                >
                  {busy ? "Moving..." : "Move Cigars & Delete"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
