"use client";

import { useEscapeKey } from "@/lib/hooks/use-escape-key";

/* ------------------------------------------------------------------
   LastStickPrompt

   Shown after a Quick Smoke Log drops an entry's quantity to 0.
   Same centered-modal overlay pattern as DeleteDialog in
   HumidorItemClient (scrim z-40, dialog z-50). `onKeep` doubles as
   the escape/scrim dismiss action — "keep at 0" is the safe default
   when the user backs out without choosing.
   ------------------------------------------------------------------ */

interface LastStickPromptProps {
  open:         boolean;
  cigarLabel:   string;
  humidorName:  string;
  busy:         boolean;
  onWishlist:   () => void;
  onKeep:       () => void;
  onRemove:     () => void;
}

export function LastStickPrompt({
  open,
  cigarLabel,
  humidorName,
  busy,
  onWishlist,
  onKeep,
  onRemove,
}: LastStickPromptProps) {
  useEscapeKey(open, onKeep);

  if (!open) return null;

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        onClick={onKeep}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="card w-full max-w-sm space-y-4 animate-fade-in text-center">
          <h3 style={{ fontFamily: "var(--font-serif)" }}>That was your last one</h3>
          <p className="text-sm text-muted-foreground">
            Smoke logged. {cigarLabel} is now at zero in {humidorName}. What would you like to do with the entry?
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="btn btn-primary w-full"
              disabled={busy}
              onClick={onWishlist}
            >
              Add to Wishlist for a re-buy
            </button>
            <button
              type="button"
              className="btn btn-secondary w-full"
              disabled={busy}
              onClick={onKeep}
            >
              Keep at 0 for my records
            </button>
            <button
              type="button"
              className="btn btn-ghost w-full text-sm"
              style={{ color: "#C44536" }}
              disabled={busy}
              onClick={onRemove}
            >
              Remove from Humidor
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
