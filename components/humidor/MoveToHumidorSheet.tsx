"use client";

/* MoveToHumidorSheet — relocate one humidor item to a different
   humidor. Always-mounted (BottomSheet contract): local state resets
   in one effect keyed on [open, itemId] so nothing survives across
   opens (the #582 stale-draft bug class). */

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useHumidors } from "@/components/humidor/useHumidors";
import { moveItemsToHumidor, friendlyWriteError } from "@/lib/data/humidor-move";

const card: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--card)", padding: 16,
};
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
  color: "var(--muted-foreground)", padding: "0 4px", marginBottom: 8,
};
const optionStyle = (disabled: boolean): React.CSSProperties => ({
  width: "100%", fontSize: 15, padding: "12px 14px", borderRadius: 6,
  minHeight: 44,
  display: "flex", justifyContent: "space-between", alignItems: "center",
  textAlign: "left",
  border: "1px solid var(--border)",
  background: "transparent",
  color: disabled ? "var(--muted-foreground)" : "var(--foreground)",
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.6 : 1,
});

export interface MoveToHumidorSheetProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  currentHumidorId: string | null;
  itemId: string;
  onMoved: (destId: string) => void;
  onToast: (msg: string) => void;
}

export function MoveToHumidorSheet({
  open, onClose, userId, currentHumidorId, itemId, onMoved, onToast,
}: MoveToHumidorSheetProps) {
  const { humidors } = useHumidors(userId);
  const [busy, setBusy] = useState(false);

  /* Reset local state whenever the sheet opens or the target item
     changes while it's open. Sheet stays mounted the rest of the
     time, so this is the only place state gets derived from props. */
  useEffect(() => {
    if (!open) return;
    setBusy(false);
  }, [open, itemId]);

  async function move(destId: string, destName: string) {
    if (busy) return;
    setBusy(true);
    try {
      await moveItemsToHumidor([itemId], destId);
      onMoved(destId);
      onToast(`Moved to ${destName}.`);
      onClose();
    } catch (err) {
      onToast(friendlyWriteError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel="Move to humidor">
      <div style={{ padding: "4px 20px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700 }}>
          Move to Humidor
        </h2>

        <div>
          <p style={label}>Humidors</p>
          {!humidors ? (
            <div style={{ ...card, minHeight: 60 }} aria-busy="true" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {humidors.map((h) => {
                const isCurrent = h.id === currentHumidorId;
                return (
                  <button
                    key={h.id}
                    type="button"
                    disabled={isCurrent || busy}
                    style={optionStyle(isCurrent)}
                    onClick={() => move(h.id, h.name)}
                  >
                    <span>{h.name}</span>
                    {isCurrent && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>
                        Current
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
