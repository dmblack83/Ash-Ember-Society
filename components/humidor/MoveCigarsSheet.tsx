"use client";

/* MoveCigarsSheet — bulk-move humidor items into a target humidor.
   Always-mounted (BottomSheet contract): local state resets in one
   effect keyed on [open, targetHumidor.id] so nothing survives across
   opens (the #582 stale-draft bug class). */

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useHumidors } from "@/components/humidor/useHumidors";
import { keyFor } from "@/lib/data/keys";
import { fetchHumidorItems } from "@/lib/data/humidor-fetchers";
import { moveItemsToHumidor, friendlyWriteError } from "@/lib/data/humidor-move";
import type { Humidor } from "@/lib/data/humidors";

const card: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--card)", padding: 16,
};
const buttonStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, padding: "10px 16px", borderRadius: 6,
  border: "none", background: "var(--primary)", color: "var(--background)",
  cursor: "pointer", minHeight: 44,
};
const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  minHeight: 44, padding: "10px 12px", borderRadius: 6,
  border: "1px solid var(--border)", cursor: "pointer",
};
const checkboxStyle: React.CSSProperties = {
  width: 18, height: 18, flexShrink: 0, accentColor: "var(--gold)", cursor: "pointer",
};

export interface MoveCigarsSheetProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  targetHumidor: Humidor;
  onMoved: (count: number) => void;
  onToast: (msg: string) => void;
}

export function MoveCigarsSheet({
  open, onClose, userId, targetHumidor, onMoved, onToast,
}: MoveCigarsSheetProps) {
  const { data: items } = useSWR(
    userId ? keyFor.humidorItems(userId) : null,
    () => fetchHumidorItems(userId),
  );
  const { humidors } = useHumidors(userId);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  /* Reset local state whenever the sheet opens or the move target
     changes while it's open. Sheet stays mounted the rest of the
     time, so this is the only place state gets derived from props. */
  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set());
    setBusy(false);
  }, [open, targetHumidor.id]);

  const movable = useMemo(
    () => (items ?? []).filter((item) => item.humidor_id !== targetHumidor.id),
    [items, targetHumidor.id],
  );

  const humidorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of humidors ?? []) map.set(h.id, h.name);
    return map;
  }, [humidors]);

  const allSelected = movable.length > 0 && selectedIds.size === movable.length;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(movable.map((item) => item.id)));
  }

  async function handleMove() {
    if (busy || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setBusy(true);
    try {
      await moveItemsToHumidor(ids, targetHumidor.id);
      onMoved(ids.length);
      onToast(
        ids.length === 1
          ? `1 cigar moved to ${targetHumidor.name}.`
          : `${ids.length} cigars moved to ${targetHumidor.name}.`,
      );
      onClose();
    } catch (err) {
      onToast(friendlyWriteError(err));
    } finally {
      setBusy(false);
    }
  }

  const loading = items === undefined;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      ariaLabel={`Move cigars to ${targetHumidor.name}`}
      footer={
        !loading && movable.length > 0 ? (
          <div style={{ padding: "12px 20px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)" }}>
            <button
              type="button"
              style={{ ...buttonStyle, width: "100%" }}
              disabled={busy || selectedIds.size === 0}
              onClick={handleMove}
            >
              {busy
                ? "Moving..."
                : selectedIds.size === 1
                  ? "Move 1 cigar"
                  : `Move ${selectedIds.size} cigars`}
            </button>
          </div>
        ) : undefined
      }
    >
      <div style={{ padding: "4px 20px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700 }}>
          Move Cigars to {targetHumidor.name}
        </h2>

        {loading ? (
          <div style={{ ...card, minHeight: 60 }} aria-busy="true" />
        ) : movable.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>
            Nothing to move. All your cigars are already here.
          </p>
        ) : (
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "0 4px", marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                style={checkboxStyle}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>Select all</span>
            </label>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {movable.map((item) => {
                const displayName = item.cigar.series ?? item.cigar.format;
                const currentName = item.humidor_id ? humidorNameById.get(item.humidor_id) ?? "" : "";
                return (
                  <label key={item.id} htmlFor={`move-item-${item.id}`} style={rowStyle}>
                    <input
                      type="checkbox"
                      id={`move-item-${item.id}`}
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggle(item.id)}
                      style={checkboxStyle}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.quantity}x {item.cigar.brand} {displayName}
                      </p>
                      {currentName && (
                        <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                          {currentName}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
