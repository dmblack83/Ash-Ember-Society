/* ------------------------------------------------------------------
   TastingNotesSubSheet

   Second-level slide-up over the PerThirdSheet for selecting flavor
   tags. Sticky Selected (N) row at the top echoes every current pick;
   per-category sections below show the full taxonomy with per-cat
   count badges when something's selected. Single Done button at the
   bottom collapses back to the parent.

   Cancel semantics: the parent (PerThirdSheet) owns the canonical
   tag-ids array. This sub-sheet edits a local mirror and emits
   onDone(ids) on close. If the user backs out without tapping Done
   (e.g. swipe-dismiss / scrim tap), no commit happens -- onClose fires
   without ids.
   ------------------------------------------------------------------ */

"use client";

import React, { useMemo, useState } from "react";

export interface FlavorTag {
  id:       string;
  name:     string;
  category: string;
}

const CATEGORY_ORDER = ["earth", "wood", "spice", "sweet", "cream", "roast", "fruit", "grass", "other"];
const CATEGORY_DISPLAY: Record<string, string> = {
  earth: "Earth", wood: "Wood", spice: "Spice", sweet: "Sweet",
  cream: "Cream", roast: "Roast", fruit: "Fruit", grass: "Grass",
  other: "Other",
};

interface Props {
  open:        boolean;
  flavorTags:  FlavorTag[];
  initialIds:  string[];
  onDone:      (ids: string[]) => void;
  onClose:     () => void;
}

export function TastingNotesSubSheet({
  open, flavorTags, initialIds, onDone, onClose,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialIds));

  const grouped = useMemo(() => {
    return CATEGORY_ORDER.reduce<Record<string, FlavorTag[]>>((acc, cat) => {
      const tags = flavorTags.filter((t) => t.category === cat);
      if (tags.length) acc[cat] = tags;
      return acc;
    }, {});
  }, [flavorTags]);

  const tagById = useMemo(() => {
    const m = new Map<string, FlavorTag>();
    flavorTags.forEach((t) => m.set(t.id, t));
    return m;
  }, [flavorTags]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (!open) return null;

  const selectedIds = Array.from(selected);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tasting Notes"
      className="flex flex-col justify-end sm:justify-center sm:items-center"
      style={{
        position:   "fixed",
        top:        0,
        right:      0,
        bottom:     0,
        left:       "var(--app-content-left, 0px)",
        zIndex:     60,
        background: "rgba(0,0,0,0.55)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="sm:rounded-2xl sm:max-h-[80vh]"
        style={{
          background:           "var(--card)",
          borderTopLeftRadius:  16,
          borderTopRightRadius: 16,
          maxHeight:            "85vh",
          width:                "100%",
          maxWidth:             560,
          marginLeft:           "auto",
          marginRight:          "auto",
          display:              "flex",
          flexDirection:        "column",
          overflow:             "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding:        "14px 16px",
            borderBottom:   "1px solid var(--line)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            background:     "var(--card)",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle:  "italic",
              fontSize:   18,
              fontWeight: 500,
              margin:     0,
            }}
          >
            Tasting Notes
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border:     "none",
              fontSize:   22,
              color:      "var(--paper-mute)",
              cursor:     "pointer",
              padding:    4,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: "14px 16px", flex: 1 }}>
          {selectedIds.length > 0 && (
            <div
              style={{
                padding:      "10px 12px",
                border:       "1px solid rgba(212,160,74,0.35)",
                background:   "rgba(212,160,74,0.06)",
                borderRadius: 8,
                marginBottom: 16,
                position:     "sticky",
                top:          -14,
                zIndex:       1,
              }}
            >
              <p
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      9,
                  fontWeight:    500,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color:         "var(--gold)",
                  margin:        "0 0 6px",
                }}
              >
                Selected ({selectedIds.length})
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {selectedIds.map((id) => {
                  const tag = tagById.get(id);
                  if (!tag) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggle(id)}
                      style={{
                        padding:      "4px 10px",
                        borderRadius: 999,
                        background:   "rgba(193,120,23,0.25)",
                        border:       "1px solid rgba(193,120,23,0.7)",
                        color:        "var(--gold)",
                        fontSize:     12,
                        cursor:       "pointer",
                      }}
                      aria-label={`Deselect ${tag.name}`}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {Object.entries(grouped).map(([cat, tags]) => {
            const catCount = tags.filter((t) => selected.has(t.id)).length;
            return (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "space-between",
                    marginBottom:   6,
                  }}
                >
                  <p
                    style={{
                      fontFamily:    "var(--font-mono)",
                      fontSize:      9,
                      fontWeight:    500,
                      letterSpacing: "0.22em",
                      textTransform: "uppercase",
                      color:         "var(--paper-mute)",
                      margin:        0,
                    }}
                  >
                    {CATEGORY_DISPLAY[cat]}
                  </p>
                  {catCount > 0 && (
                    <span
                      style={{
                        fontFamily:    "var(--font-mono)",
                        fontSize:      9,
                        letterSpacing: "0.12em",
                        color:         "var(--gold)",
                      }}
                    >
                      {catCount} selected
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {tags.map((tag) => {
                    const active = selected.has(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggle(tag.id)}
                        aria-pressed={active}
                        style={{
                          padding:      "6px 12px",
                          borderRadius: 999,
                          background:   active ? "rgba(193,120,23,0.25)" : "rgba(245,230,211,0.06)",
                          border:       `1px solid ${active ? "rgba(193,120,23,0.7)" : "rgba(245,230,211,0.18)"}`,
                          color:        active ? "var(--gold)" : "var(--foreground)",
                          fontSize:     12,
                          cursor:       "pointer",
                        }}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding:    "12px 16px",
            borderTop:  "1px solid var(--line)",
            background: "var(--card)",
          }}
        >
          <button
            type="button"
            onClick={() => onDone(selectedIds)}
            style={{
              width:         "100%",
              padding:       12,
              borderRadius:  8,
              background:    "var(--gold)",
              color:         "#1a1208",
              fontFamily:    "var(--font-mono)",
              fontSize:      11,
              fontWeight:    500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              border:        "none",
              cursor:        "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
