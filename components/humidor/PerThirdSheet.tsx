/* ------------------------------------------------------------------
   PerThirdSheet

   Full-screen slide-up per third. Header shows the third tag
   (verbatim from today's eyebrows). Body collects:
   - Notes (required, auto-grow textarea)
   - Ratings: Draw / Burn / Build / Flavor -- 1-5 stars each, required
   - Tasting Notes: tap-row opens TastingNotesSubSheet
   - 1 Photo (optional, X to remove, + Add)

   Cancel discards in-sheet edits. Save commits to in-memory form
   via onSave(payload).
   ------------------------------------------------------------------ */

"use client";

import React, { useRef, useState } from "react";
import { StarRating } from "./StarRating";
import { TastingNotesSubSheet, type FlavorTag } from "./TastingNotesSubSheet";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import type { PerThirdData } from "@/lib/burn-report/thirds";
import { ratingWord } from "@/lib/format";

const TAGS_BY_INDEX: Record<1 | 2 | 3, { eyebrow: string; placeholder: string }> = {
  1: { eyebrow: "First Third · Beginning",  placeholder: "Opening notes, light, first impressions…" },
  2: { eyebrow: "Second Third · Middle",    placeholder: "How it's developing, flavor shifts, draw, burn…" },
  3: { eyebrow: "Final Third · End",        placeholder: "Finish, complexity, lingering notes…" },
};

interface SaveLocalPayload {
  notes:                string;
  draw_rating:          number;
  burn_rating:          number;
  construction_rating:  number;
  flavor_rating:        number;
  flavor_tag_ids:       string[];
  photo_file?:          File | null;
}

interface Props {
  open:        boolean;
  index:       1 | 2 | 3;
  initial:     PerThirdData | null;
  initialPhoto?: File | null;
  flavorTags:  FlavorTag[];
  onCancel:    () => void;
  onSave:      (payload: SaveLocalPayload) => void;
}

export function PerThirdSheet({
  open, index, initial, initialPhoto = null, flavorTags, onCancel, onSave,
}: Props) {
  const tag = TAGS_BY_INDEX[index];

  /* Local in-sheet state. Initialized on mount from `initial`. Cancel
     discards by simply unmounting (parent doesn't commit). */
  const [notes,    setNotes]    = useState(initial?.notes ?? "");
  const [draw,     setDraw]     = useState(initial?.draw_rating ?? 0);
  const [burn,     setBurn]     = useState(initial?.burn_rating ?? 0);
  const [build,    setBuild]    = useState(initial?.construction_rating ?? 0);
  const [flavor,   setFlavor]   = useState(initial?.flavor_rating ?? 0);
  const [tagIds,   setTagIds]   = useState<string[]>(initial?.flavor_tag_ids ?? []);
  const [photo,    setPhoto]    = useState<File | null>(initialPhoto);
  const [subOpen,  setSubOpen]  = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const canSave = notes.trim().length > 0 && draw > 0 && burn > 0 && build > 0 && flavor > 0;

  if (!open) return null;

  const tagPreview = tagIds.length === 0
    ? "Add tasting notes"
    : flavorTags
        .filter((t) => tagIds.includes(t.id))
        .map((t) => t.name)
        .join(", ");

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tag.eyebrow}
        className="flex flex-col justify-end sm:justify-center sm:items-center"
        style={{
          position:   "fixed",
          top:        0,
          right:      0,
          bottom:     0,
          left:       "var(--app-content-left, 0px)",
          zIndex:     50,
          background: "rgba(0,0,0,0.55)",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      >
        <div
          className="sm:rounded-2xl sm:max-h-[90vh]"
          style={{
            background:           "var(--background, #1A1210)",
            borderTopLeftRadius:  16,
            borderTopRightRadius: 16,
            maxHeight:            "95vh",
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
              padding:      "14px 16px",
              borderBottom: "1px solid var(--line)",
              background:   "var(--card)",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <p
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      9,
                  fontWeight:    500,
                  letterSpacing: "0.28em",
                  textTransform: "uppercase",
                  color:         "var(--gold)",
                  margin:        0,
                }}
              >
                {tag.eyebrow}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              style={{ background: "none", border: "none", fontSize: 22, color: "var(--paper-mute)", cursor: "pointer", padding: 4 }}
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", padding: 16, flex: 1 }}>
            {/* Notes */}
            <div style={{ marginBottom: 18 }}>
              <p
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      9,
                  fontWeight:    500,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color:         "var(--paper-mute)",
                  margin:        "0 0 6px",
                }}
              >
                Notes
              </p>
              <AutoGrowTextarea
                value={notes}
                onChange={setNotes}
                placeholder={tag.placeholder}
                rows={4}
                style={{ width: "100%" }}
              />
            </div>

            {/* Ratings */}
            <div style={{ marginBottom: 18 }}>
              <p
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      9,
                  fontWeight:    500,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color:         "var(--paper-mute)",
                  margin:        "0 0 8px",
                }}
              >
                Ratings
              </p>
              {([
                ["How was the draw?",          draw,   setDraw],
                ["How even was the burn?",      burn,   setBurn],
                ["How was the construction?",   build,  setBuild],
                ["How was the flavor?",         flavor, setFlavor],
              ] as const).map(([label, val, set]) => (
                <div key={label} style={{ marginBottom: 12 }}>
                  <p
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontStyle:  "italic",
                      fontSize:   15,
                      color:      "var(--foreground)",
                      margin:     "0 0 6px",
                    }}
                  >
                    {label}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <StarRating mode="input" value={val} size={22} onChange={set} ariaLabel={label} />
                    <span
                      style={{
                        fontFamily:    "var(--font-mono)",
                        fontSize:      9,
                        fontWeight:    500,
                        letterSpacing: "0.22em",
                        textTransform: "uppercase",
                        color:         val > 0 ? "var(--gold)" : "var(--paper-dim)",
                      }}
                    >
                      {ratingWord(val)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Tasting Notes tap-row */}
            <div style={{ marginBottom: 18 }}>
              <p
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      9,
                  fontWeight:    500,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color:         "var(--paper-mute)",
                  margin:        "0 0 6px",
                }}
              >
                Tasting Notes
              </p>
              <button
                type="button"
                onClick={() => setSubOpen(true)}
                style={{
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "space-between",
                  width:          "100%",
                  padding:        "12px 14px",
                  borderRadius:   8,
                  border:         "1px solid var(--line-strong)",
                  background:     "var(--card)",
                  cursor:         "pointer",
                  textAlign:      "left",
                }}
                aria-label="Edit tasting notes"
              >
                <span
                  style={{
                    flex:          1,
                    overflow:      "hidden",
                    textOverflow:  "ellipsis",
                    whiteSpace:    "nowrap",
                    color:         tagIds.length ? "var(--foreground)" : "var(--paper-dim)",
                    fontSize:      13,
                  }}
                >
                  {tagPreview}
                </span>
                {tagIds.length > 0 && (
                  <span
                    style={{
                      marginLeft:    8,
                      padding:       "2px 8px",
                      borderRadius:  999,
                      background:    "rgba(212,160,74,0.18)",
                      border:        "1px solid rgba(212,160,74,0.5)",
                      color:         "var(--gold)",
                      fontFamily:    "var(--font-mono)",
                      fontSize:      10,
                      letterSpacing: "0.08em",
                    }}
                  >
                    {tagIds.length}
                  </span>
                )}
                <span style={{ marginLeft: 8, color: "var(--paper-mute)" }}>›</span>
              </button>
            </div>

            {/* Photo */}
            <div>
              <p
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      9,
                  fontWeight:    500,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color:         "var(--paper-mute)",
                  margin:        "0 0 6px",
                }}
              >
                Photo
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
              {photo ? (
                <div style={{ position: "relative", width: 96, aspectRatio: "1 / 1", borderRadius: 4, overflow: "hidden", border: "1px solid var(--line-strong)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(photo)} alt="Per-third photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    aria-label="Remove photo"
                    style={{
                      position:     "absolute",
                      top:          6,
                      right:        6,
                      width:        24,
                      height:       24,
                      background:   "rgba(0,0,0,0.7)",
                      border:       "none",
                      borderRadius: "50%",
                      color:        "#fff",
                      cursor:       "pointer",
                    }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  style={{
                    width:          96,
                    aspectRatio:    "1 / 1",
                    border:         "1px dashed var(--line-strong)",
                    borderRadius:   4,
                    display:        "flex",
                    flexDirection:  "column",
                    alignItems:     "center",
                    justifyContent: "center",
                    cursor:         "pointer",
                    background:     "transparent",
                    color:          "var(--paper-dim)",
                  }}
                  aria-label="Add photo"
                >
                  <span style={{ fontFamily: "var(--font-serif)", fontSize: 28, color: "var(--gold)", lineHeight: 1 }}>+</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", marginTop: 4 }}>Add</span>
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)", background: "var(--card)", display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex:          1,
                padding:       12,
                borderRadius:  8,
                background:    "transparent",
                border:        "1px solid var(--line-strong)",
                color:         "var(--foreground)",
                fontFamily:    "var(--font-mono)",
                fontSize:      11,
                fontWeight:    500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                cursor:        "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={() => onSave({
                notes,
                draw_rating:         draw,
                burn_rating:         burn,
                construction_rating: build,
                flavor_rating:       flavor,
                flavor_tag_ids:      tagIds,
                photo_file:          photo,
              })}
              style={{
                flex:          1,
                padding:       12,
                borderRadius:  8,
                background:    canSave ? "var(--gold)" : "rgba(212,160,74,0.3)",
                color:         "#1a1208",
                border:        "none",
                fontFamily:    "var(--font-mono)",
                fontSize:      11,
                fontWeight:    500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                cursor:        canSave ? "pointer" : "not-allowed",
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>

      <TastingNotesSubSheet
        open={subOpen}
        flavorTags={flavorTags}
        initialIds={tagIds}
        onDone={(ids) => { setTagIds(ids); setSubOpen(false); }}
        onClose={() => setSubOpen(false)}
      />
    </>
  );
}
