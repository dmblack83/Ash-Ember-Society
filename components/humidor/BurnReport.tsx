"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import type { BurnReportItem, FlavorTag, PartnerVideo } from "@/app/(app)/humidor/[id]/burn-report/page";
import Image from "next/image";
import { CigarImage } from "@/components/ui/CigarImage";
import { VerdictCard } from "@/components/humidor/VerdictCard";

/* ------------------------------------------------------------------
   Constants
   ------------------------------------------------------------------ */

const STEPS = [
  "The Basics",
  "Pairing",
  "Rating",
  "Flavor Profile",
  "Overall",
  "Summary",
] as const;

const SKIPPABLE = new Set([1, 3]); // Pairing (1), Flavor Profile (3)

const OCCASIONS = [
  "Celebration",
  "Relaxation",
  "Social",
  "Work Break",
  "Special Event",
  "Just Because",
] as const;

const QUICK_PAIRINGS = [
  "Coffee",
  "Bourbon",
  "Scotch",
  "Rum",
  "Wine",
  "Beer",
  "Water",
  "None",
] as const;

const STAR_LABELS = ["", "Poor", "Below Average", "Average", "Good", "Excellent"] as const;

const CATEGORY_ORDER = ["earth", "wood", "spice", "sweet", "cream", "roast", "fruit", "grass", "other"];
const CATEGORY_DISPLAY: Record<string, string> = {
  earth: "Earth",
  wood: "Wood",
  spice: "Spice",
  sweet: "Sweet",
  cream: "Cream",
  roast: "Roast",
  fruit: "Fruit",
  grass: "Grass",
  other: "Other",
};

/* ------------------------------------------------------------------
   Form data shape
   ------------------------------------------------------------------ */

interface FormData {
  smoked_at: string;
  location: string;
  occasion: string;
  pairing_drink: string;
  pairing_food: string;
  draw_rating: number;
  burn_rating: number;
  construction_rating: number;
  flavor_rating: number;
  flavor_tag_ids: string[];
  overall_rating: number;
  review_text: string;
  photo_files: File[];
  smoke_duration_minutes: string;
  content_video_id: string | null;

  /* Thirds — opt-in phased review (first/second/final third). The
     three text fields persist across toggle off→on so users don't
     lose notes when collapsing the section. The verdict card honors
     thirds_enabled on read; we never auto-disable on empty input. */
  thirds_enabled: boolean;
  third_beginning: string;
  third_middle: string;
  third_end: string;
}

function defaultForm(): FormData {
  return {
    smoked_at: new Date().toISOString().split("T")[0],
    location: "",
    occasion: "",
    pairing_drink: "",
    pairing_food: "",
    draw_rating: 0,
    burn_rating: 0,
    construction_rating: 0,
    flavor_rating: 0,
    flavor_tag_ids: [],
    overall_rating: 75,
    review_text: "",
    photo_files: [],
    smoke_duration_minutes: "",
    content_video_id: null,
    thirds_enabled:  false,
    third_beginning: "",
    third_middle:    "",
    third_end:       "",
  };
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function ratingColor(v: number): string {
  if (v <= 40) return "#C44536";
  if (v <= 60) return "#8B6020";
  if (v <= 80) return "#3A6B45";
  return "#D4A04A";
}

function ratingLabel(v: number): string {
  if (v <= 20) return "Poor";
  if (v <= 40) return "Below Average";
  if (v <= 60) return "Average";
  if (v <= 80) return "Good";
  return "Outstanding";
}

/* ------------------------------------------------------------------
   ProgressRail — 6-tick editorial progress, gold-deep done /
   gold current (extra-wide) / line future. Replaces the previous dot
   row for the Burn Report visual refresh.
   ------------------------------------------------------------------ */

function ProgressRail({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
      {STEPS.map((_, i) => {
        const done    = i <  current;
        const active  = i === current;
        return (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width:  active ? 36 : 18,
              height: 3,
              backgroundColor: done
                ? "var(--gold-deep)"
                : active
                  ? "var(--gold)"
                  : "var(--line)",
            }}
          />
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------
   StarRating
   ------------------------------------------------------------------ */

function StarRating({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || value;

  return (
    <div>
      {/* Italic question */}
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle:  "italic",
          fontSize:   19,
          fontWeight: 500,
          color:      "var(--foreground)",
          margin:     0,
          lineHeight: 1.25,
        }}
      >
        {label}
      </p>

      {/* Star row — 24px tall, 4px gap, no padding box */}
      <div
        className="flex items-center"
        style={{ gap: 4, marginTop: 12 }}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= display;
          // Tap-same-star-again to clear, otherwise set rating.
          const handleClick = () => onChange(value === star ? 0 : star);
          return (
            <button
              key={star}
              type="button"
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onClick={handleClick}
              className="transition-transform duration-100 active:scale-90"
              style={{
                padding:    0,
                background: "transparent",
                border:     "none",
                cursor:     "pointer",
                lineHeight: 0,
              }}
              aria-label={`${star} star${star === 1 ? "" : "s"}`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  fill={filled ? "var(--gold)" : "rgba(245,230,211,0.18)"}
                />
              </svg>
            </button>
          );
        })}
      </div>

      {/* Rating word — fixed 12px height to prevent layout shift on empty */}
      <p
        style={{
          fontFamily:    "var(--font-mono)",
          fontSize:      10,
          fontWeight:    500,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color:         "var(--gold-deep)",
          height:        12,
          marginTop:     8,
          marginBottom:  0,
          lineHeight:    1,
        }}
      >
        {display > 0 ? STAR_LABELS[display] : ""}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------
   CigarContext — shown at top of every step
   ------------------------------------------------------------------ */

function CigarContext({ item }: { item: BurnReportItem }) {
  const c = item.cigar;
  return (
    <div
      className="flex items-center gap-3 mb-6"
      style={{
        padding:        "10px 12px",
        backgroundColor: "var(--card)",
        border:          "1px solid var(--line)",
        borderRadius:    4,
      }}
    >
      <div
        className="overflow-hidden flex-shrink-0"
        style={{ width: 44, height: 44, borderRadius: 3, backgroundColor: "var(--muted)" }}
      >
        <CigarImage
          imageUrl={c.image_url}
          wrapper={c.wrapper}
          alt={c.series ?? c.format ?? ""}
          width={44}
          height={44}
          sizes="44px"
          quality={75}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
      <div className="min-w-0">
        <p
          style={{
            fontFamily:    "var(--font-mono)",
            fontSize:      9,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color:         "var(--gold)",
            margin:        0,
            lineHeight:    1.2,
          }}
        >
          {c.brand}
        </p>
        <p
          className="truncate"
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontSize:   17,
            fontWeight: 500,
            color:      "var(--foreground)",
            margin:     "2px 0 0",
            lineHeight: 1.15,
          }}
        >
          {c.series ?? c.format}
        </p>
        {c.format && c.series && (
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle:  "italic",
              fontSize:   13,
              color:      "var(--paper-mute)",
              margin:     "1px 0 0",
              lineHeight: 1.2,
            }}
          >
            {c.format}
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Eyebrow — mono uppercase letterspaced label. Reused above
   inputs and chip groups across Steps 1, 2, 4, 5.
   ------------------------------------------------------------------ */

function Eyebrow({
  children,
  htmlFor,
  optional = false,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  optional?: boolean;
}) {
  const Tag = (htmlFor ? "label" : "p") as "label" | "p";
  return (
    <Tag
      htmlFor={htmlFor}
      style={{
        display:        "block",
        fontFamily:     "var(--font-mono)",
        fontSize:       10,
        fontWeight:     500,
        letterSpacing:  "0.22em",
        textTransform:  "uppercase",
        color:          "var(--paper-mute)",
        margin:         0,
        marginBottom:   8,
      }}
    >
      {children}
      {optional && (
        <span style={{ marginLeft: 6, letterSpacing: "0.04em", textTransform: "none", color: "var(--paper-dim)" }}>
          (optional)
        </span>
      )}
    </Tag>
  );
}

/* ------------------------------------------------------------------
   Chip — pill toggle. Selected = solid gold fill on dark text;
   unselected = transparent with gold-tint hairline.
   ------------------------------------------------------------------ */

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="transition-all duration-150 active:scale-95"
      style={{
        padding:        "7px 14px",
        borderRadius:   999,
        fontFamily:     "var(--font-sans)",
        fontSize:       13,
        fontWeight:     500,
        lineHeight:     1,
        cursor:         "pointer",
        background:     active ? "var(--gold)" : "transparent",
        color:          active ? "#1a1208" : "var(--paper-mute)",
        border:         active ? "1px solid var(--gold)" : "1px solid var(--line-strong)",
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------
   Step 1 — The Basics
   ------------------------------------------------------------------ */

function Step1({
  form,
  update,
  item,
}: {
  form: FormData;
  update: (f: Partial<FormData>) => void;
  item: BurnReportItem;
}) {
  const today = new Date().toISOString().split("T")[0];
  return (
    <div className="space-y-6">
      <CigarContext item={item} />

      <div>
        <Eyebrow htmlFor="br-date">Date Smoked</Eyebrow>
        <input
          id="br-date"
          type="date"
          className="input"
          value={form.smoked_at}
          max={today}
          onChange={(e) => update({ smoked_at: e.target.value })}
        />
      </div>

      <div>
        <Eyebrow htmlFor="br-location">Location</Eyebrow>
        <input
          id="br-location"
          type="text"
          className="input"
          placeholder="Where are you smoking?"
          value={form.location}
          onChange={(e) => update({ location: e.target.value })}
        />
      </div>

      <div>
        <Eyebrow optional>Occasion</Eyebrow>
        <div className="flex flex-wrap gap-2">
          {OCCASIONS.map((occ) => (
            <Chip
              key={occ}
              active={form.occasion === occ}
              onClick={() => update({ occasion: form.occasion === occ ? "" : occ })}
            >
              {occ}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Step 2 — Pairing
   ------------------------------------------------------------------ */

function Step2({
  form,
  update,
  item,
}: {
  form: FormData;
  update: (f: Partial<FormData>) => void;
  item: BurnReportItem;
}) {
  return (
    <div className="space-y-6">
      <CigarContext item={item} />

      <div>
        <Eyebrow>Quick-select drink</Eyebrow>
        <div className="flex flex-wrap gap-2">
          {QUICK_PAIRINGS.map((p) => (
            <Chip
              key={p}
              active={form.pairing_drink === p}
              onClick={() => update({ pairing_drink: form.pairing_drink === p ? "" : p })}
            >
              {p}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <Eyebrow htmlFor="br-drink" optional>Pairing Drink</Eyebrow>
        <input
          id="br-drink"
          type="text"
          className="input"
          placeholder="What are you drinking?"
          value={form.pairing_drink}
          onChange={(e) => update({ pairing_drink: e.target.value })}
        />
      </div>

      <div>
        <Eyebrow htmlFor="br-food" optional>Pairing Food</Eyebrow>
        <input
          id="br-food"
          type="text"
          className="input"
          placeholder="Any food pairing?"
          value={form.pairing_food}
          onChange={(e) => update({ pairing_food: e.target.value })}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Step 3 — Rating
   ------------------------------------------------------------------ */

function Step3({
  form,
  update,
  item,
}: {
  form: FormData;
  update: (f: Partial<FormData>) => void;
  item: BurnReportItem;
}) {
  const hairline = (
    <div style={{ height: 1, background: "var(--line)", margin: "22px 0" }} aria-hidden="true" />
  );
  return (
    <div>
      <CigarContext item={item} />
      <StarRating
        value={form.draw_rating}
        onChange={(v) => update({ draw_rating: v })}
        label="How was the draw?"
      />
      {hairline}
      <StarRating
        value={form.burn_rating}
        onChange={(v) => update({ burn_rating: v })}
        label="How even was the burn?"
      />
      {hairline}
      <StarRating
        value={form.construction_rating}
        onChange={(v) => update({ construction_rating: v })}
        label="How was the construction?"
      />
      {hairline}
      <StarRating
        value={form.flavor_rating}
        onChange={(v) => update({ flavor_rating: v })}
        label="How was the flavor?"
      />
    </div>
  );
}

/* ------------------------------------------------------------------
   Step 4 — Flavor Profile
   ------------------------------------------------------------------ */

function Step4({
  form,
  update,
  flavorTags,
  item,
}: {
  form: FormData;
  update: (f: Partial<FormData>) => void;
  flavorTags: FlavorTag[];
  item: BurnReportItem;
}) {
  const grouped = CATEGORY_ORDER.reduce<Record<string, FlavorTag[]>>((acc, cat) => {
    const tags = flavorTags.filter((t) => t.category === cat);
    if (tags.length) acc[cat] = tags;
    return acc;
  }, {});

  function toggleTag(id: string) {
    const ids = form.flavor_tag_ids.includes(id)
      ? form.flavor_tag_ids.filter((t) => t !== id)
      : [...form.flavor_tag_ids, id];
    update({ flavor_tag_ids: ids });
  }

  return (
    <div className="space-y-6">
      <CigarContext item={item} />

      {Object.entries(grouped).map(([cat, tags]) => (
        <div key={cat}>
          <Eyebrow>{CATEGORY_DISPLAY[cat]}</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Chip
                key={tag.id}
                active={form.flavor_tag_ids.includes(tag.id)}
                onClick={() => toggleTag(tag.id)}
              >
                {tag.name}
              </Chip>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------
   Step 5 — Overall
   ------------------------------------------------------------------ */

function Step5({
  form,
  update,
  item,
}: {
  form: FormData;
  update: (f: Partial<FormData>) => void;
  item: BurnReportItem;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const label = ratingLabel(form.overall_rating);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const next = [...form.photo_files];
    for (let i = 0; i < files.length && next.length < 3; i++) {
      next.push(files[i]);
    }
    update({ photo_files: next });
  }

  function removePhoto(i: number) {
    update({ photo_files: form.photo_files.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-6">
      <CigarContext item={item} />

      {/* ── Overall rating ─────────────────────────────────────────── */}
      <div>
        <Eyebrow>Overall Rating</Eyebrow>

        {/* 88px italic numeral + grade word */}
        <div className="text-center" style={{ paddingTop: 4, paddingBottom: 8 }}>
          <p
            style={{
              fontFamily:    "var(--font-serif)",
              fontStyle:     "italic",
              fontWeight:    500,
              fontSize:      88,
              lineHeight:    0.9,
              letterSpacing: "-0.02em",
              color:         "var(--gold)",
              margin:        0,
            }}
          >
            {form.overall_rating}
          </p>
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle:  "italic",
              fontSize:   18,
              fontWeight: 500,
              color:      "var(--paper-mute)",
              margin:     "4px 0 0",
            }}
          >
            {label}
          </p>
        </div>

        {/* Slider with gold-fill track via custom property --p */}
        <div style={{ paddingLeft: 4, paddingRight: 4, marginTop: 4 }}>
          <input
            type="range"
            min={1}
            max={100}
            value={form.overall_rating}
            onChange={(e) => update({ overall_rating: parseInt(e.target.value) })}
            className="burn-report-slider"
            style={{
              ["--p" as string]: `${form.overall_rating}%`,
              width: "100%",
            }}
          />
          {/* 5-tick scale row */}
          <div
            className="flex justify-between"
            style={{
              fontFamily:    "var(--font-mono)",
              fontSize:      9,
              fontWeight:    500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color:         "var(--paper-dim)",
              marginTop:     10,
            }}
          >
            <span>Poor</span>
            <span>Below</span>
            <span>Average</span>
            <span>Good</span>
            <span>Outstanding</span>
          </div>
        </div>
      </div>

      {/* ── Enable Thirds toggle ───────────────────────────────────── */}
      {/* Full-width pill row. When on, reveals three labeled textareas
          below for first/second/final third notes. Toggling off
          collapses the textareas but preserves their text in state. */}
      <div>
        <button
          type="button"
          role="switch"
          aria-checked={form.thirds_enabled}
          onClick={() => update({ thirds_enabled: !form.thirds_enabled })}
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            width:          "100%",
            padding:        "12px 14px",
            borderRadius:   12,
            border:         form.thirds_enabled
              ? "1px solid var(--gold)"
              : "1px solid var(--line-strong)",
            background:     form.thirds_enabled
              ? "linear-gradient(135deg, rgba(212,160,74,0.12) 0%, rgba(212,160,74,0.04) 100%)"
              : "var(--card)",
            cursor:         "pointer",
            textAlign:      "left",
          }}
        >
          <div>
            <span
              style={{
                display:    "block",
                fontFamily: "var(--font-serif)",
                fontStyle:  "italic",
                fontSize:   17,
                fontWeight: 500,
                color:      "var(--foreground)",
                lineHeight: 1.2,
              }}
            >
              Enable Thirds
            </span>
            <span
              style={{
                display:       "block",
                fontFamily:    "var(--font-mono)",
                fontSize:      9,
                fontWeight:    500,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color:         "var(--paper-mute)",
                marginTop:     4,
              }}
            >
              Break your review into phases
            </span>
          </div>
          {/* iOS-style switch — 42×24 with 18px knob */}
          <span
            aria-hidden="true"
            style={{
              position:       "relative",
              display:        "inline-block",
              flexShrink:     0,
              width:          42,
              height:         24,
              borderRadius:   999,
              background:     form.thirds_enabled ? "var(--gold)" : "rgba(245,230,211,0.12)",
              transition:     "background 200ms ease",
            }}
          >
            <span
              style={{
                position:     "absolute",
                top:          3,
                left:         form.thirds_enabled ? 21 : 3,
                width:        18,
                height:       18,
                borderRadius: 999,
                background:   form.thirds_enabled ? "#1a1208" : "var(--foreground)",
                boxShadow:    "0 1px 3px rgba(0,0,0,0.4)",
                transition:   "left 200ms ease, background 200ms ease",
              }}
            />
          </span>
        </button>

        {/* Three thirds — only rendered when toggled on. We deliberately
            unmount when off rather than CSS-hide, so the input order in
            the DOM stays linear when navigating with a keyboard. State
            for the three text fields lives on `form` so it survives
            toggle off→on cycles. */}
        {form.thirds_enabled && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            {([
              { id: "br-third-beginning", key: "third_beginning", tag: "First Third · Beginning",
                placeholder: "Opening notes, light, first impressions…" },
              { id: "br-third-middle",    key: "third_middle",    tag: "Second Third · Middle",
                placeholder: "How it's developing — flavor shifts, draw, burn…" },
              { id: "br-third-end",       key: "third_end",       tag: "Final Third · End",
                placeholder: "Finish, complexity, lingering notes…" },
            ] as const).map(({ id, key, tag, placeholder }) => {
              const value      = form[key];
              const hasContent = value.trim().length > 0;
              return (
                <div
                  key={id}
                  style={{
                    position:    "relative",
                    paddingLeft: 14,
                    borderLeft:  "2px solid var(--line)",
                  }}
                >
                  {/* 8px circular indicator — fills gold once any text */}
                  <span
                    aria-hidden="true"
                    style={{
                      position:     "absolute",
                      top:          0,
                      left:         -5,
                      width:        8,
                      height:       8,
                      borderRadius: 999,
                      background:   hasContent ? "var(--gold)" : "var(--line-strong)",
                      transition:   "background 200ms ease",
                    }}
                  />
                  <Eyebrow htmlFor={id}>{tag}</Eyebrow>
                  <textarea
                    id={id}
                    className="input resize-y"
                    placeholder={placeholder}
                    rows={2}
                    style={{ minHeight: 64 }}
                    value={value}
                    onChange={(e) => update({ [key]: e.target.value } as Partial<FormData>)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Review text ────────────────────────────────────────────── */}
      <div>
        <Eyebrow htmlFor="br-review">Review</Eyebrow>
        <textarea
          id="br-review"
          className="input resize-y"
          placeholder={
            form.thirds_enabled
              ? "Overall recap — pull it together…"
              : "Share your thoughts on this cigar…"
          }
          rows={4}
          style={{ minHeight: 100 }}
          value={form.review_text}
          onChange={(e) => update({ review_text: e.target.value })}
        />
      </div>

      {/* ── Smoke duration — italic Playfair numeral inside field ── */}
      <div>
        <Eyebrow htmlFor="br-duration">Smoke Duration (minutes)</Eyebrow>
        <input
          id="br-duration"
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="e.g. 90"
          className="input"
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontSize:   22,
          }}
          value={form.smoke_duration_minutes}
          onChange={(e) => update({ smoke_duration_minutes: e.target.value })}
        />
      </div>

      {/* ── Photo upload — 3-column square grid ───────────────────── */}
      <div>
        <Eyebrow optional>Photos (up to 3)</Eyebrow>
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap:                 10,
          }}
        >
          {[0, 1, 2].map((i) => {
            const file = form.photo_files[i];
            if (file) {
              return (
                <div
                  key={i}
                  className="relative overflow-hidden"
                  style={{
                    aspectRatio:  "1 / 1",
                    borderRadius: 4,
                    border:       "1px solid var(--line-strong)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={URL.createObjectURL(file)}
                    alt={`Photo ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
                    aria-label="Remove photo"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 2L8 8M8 2L2 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              );
            }
            // empty slot — only the next-up empty is interactive; later
            // empties render visually but tap also opens the picker
            return (
              <button
                key={i}
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center transition-colors duration-150"
                style={{
                  aspectRatio:  "1 / 1",
                  borderRadius: 4,
                  background:   "transparent",
                  border:       "1px dashed var(--line-strong)",
                  cursor:       "pointer",
                  color:        "var(--paper-dim)",
                }}
                aria-label={`Add photo ${i + 1}`}
              >
                <span
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize:   28,
                    lineHeight: 1,
                    color:      "var(--gold)",
                  }}
                >
                  +
                </span>
                <span
                  style={{
                    fontFamily:    "var(--font-mono)",
                    fontSize:      9,
                    fontWeight:    500,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    marginTop:     6,
                    color:         "var(--paper-dim)",
                  }}
                >
                  Add
                </span>
              </button>
            );
          })}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => addPhotos(e.target.files)}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Step 6 — Summary (Verdict Card)
   The card itself is the shared <VerdictCard /> component; this
   step adds the in-flight Edit / Share-to-Lounge action row below.
   ------------------------------------------------------------------ */

function SummaryStep({
  form,
  flavorTags,
  item,
  partnerVideos,
  update,
  displayName,
  city,
  reportNumber,
  onEdit,
}: {
  form: FormData;
  flavorTags: FlavorTag[];
  item: BurnReportItem;
  partnerVideos: PartnerVideo[];
  update: (f: Partial<FormData>) => void;
  displayName: string | null;
  city: string | null;
  reportNumber: number;
  onEdit: () => void;
}) {
  const selectedTagNames = flavorTags
    .filter((t) => form.flavor_tag_ids.includes(t.id))
    .map((t) => t.name);

  // In-flight callers carry photos as File objects (no URL yet);
  // VerdictCard expects URL strings. Convert at the boundary so the
  // shared component stays simple. Blob URLs are fine for the
  // preview lifetime — they're discarded once the user navigates.
  const photoUrls = form.photo_files.map((f) => URL.createObjectURL(f));

  return (
    <div>
      <VerdictCard
        cigar={item.cigar}
        reportNumber={reportNumber}
        smokedAt={form.smoked_at}
        overallRating={form.overall_rating}
        drawRating={form.draw_rating}
        burnRating={form.burn_rating}
        constructionRating={form.construction_rating}
        flavorRating={form.flavor_rating}
        reviewText={form.review_text}
        smokeDurationMinutes={form.smoke_duration_minutes}
        pairingDrink={form.pairing_drink}
        occasion={form.occasion}
        flavorTagNames={selectedTagNames}
        photoUrls={photoUrls}
        thirdsEnabled={form.thirds_enabled}
        thirdBeginning={form.third_beginning}
        thirdMiddle={form.third_middle}
        thirdEnd={form.third_end}
        displayName={displayName}
        city={city}
      />

      {/* Action row — Edit pill (functional) + Share to Lounge (placeholder) */}
      <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "center" }}>
        <button
          type="button"
          onClick={onEdit}
          style={{
            fontFamily:    "var(--font-mono)",
            fontSize:      11,
            fontWeight:    500,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color:         "var(--paper-mute)",
            background:    "transparent",
            border:        "1px solid var(--line-strong)",
            borderRadius:  999,
            padding:       "10px 22px",
            cursor:         "pointer",
          }}
        >
          Edit
        </button>
        {/* Share-to-Lounge from this preview is a placeholder — the
            existing post-submit success screen handles real sharing. */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Share once your report is filed"
          style={{
            fontFamily:    "var(--font-mono)",
            fontSize:      11,
            fontWeight:    500,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color:         "var(--gold)",
            background:    "transparent",
            border:        "1px solid var(--gold)",
            borderRadius:  999,
            padding:       "10px 22px",
            cursor:         "not-allowed",
            opacity:        0.55,
          }}
        >
          Share to Lounge
        </button>
      </div>

      {/* Partner video picker — only shown for Partner badge holders */}
      {partnerVideos.length > 0 && (
        <div className="space-y-3" style={{ marginTop: 28 }}>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
              Link a Video
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Attach one of your channel videos to this burn report. Optional.
            </p>
          </div>
          <div className="space-y-2">
            {partnerVideos.map((v) => {
              const selected = form.content_video_id === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => update({ content_video_id: selected ? null : v.id })}
                  style={{
                    width:           "100%",
                    display:         "flex",
                    alignItems:      "center",
                    gap:             10,
                    padding:         "8px 10px",
                    borderRadius:    10,
                    border:          `1px solid ${selected ? "var(--primary)" : "rgba(255,255,255,0.08)"}`,
                    backgroundColor: selected ? "rgba(193,120,23,0.1)" : "var(--secondary)",
                    cursor:          "pointer",
                    textAlign:       "left",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {v.thumbnail_url && (
                    <Image
                      src={v.thumbnail_url}
                      alt=""
                      width={72}
                      height={41}
                      sizes="72px"
                      quality={70}
                      style={{ objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                    />
                  )}
                  <span style={{ flex: 1, fontSize: 13, color: "var(--foreground)", lineHeight: 1.4 }}>
                    {v.title}
                  </span>
                  {selected && (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <circle cx="9" cy="9" r="8" fill="var(--primary)" />
                      <path d="M5.5 9l2.5 2.5 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
          {form.content_video_id && (
            <button
              type="button"
              onClick={() => update({ content_video_id: null })}
              className="text-xs text-muted-foreground"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Success screen
   ------------------------------------------------------------------ */

function SuccessScreen({
  overallRating,
  quantityAfter,
  humidorItemId,
  cigarBrand,
  cigarName,
  reviewText,
  smokeLogId,
  onRemoveFromHumidor,
}: {
  overallRating:       number;
  quantityAfter:       number;
  humidorItemId:       string;
  cigarBrand:          string | null;
  cigarName:           string | null;
  reviewText:          string;
  smokeLogId:          string | null;
  onRemoveFromHumidor: () => void;
}) {
  const router   = useRouter();
  const color    = ratingColor(overallRating);
  const supabase = createClient();

  const [sharing, setSharing] = useState(false);
  const [shared,  setShared]  = useState(false);
  const [shareErr, setShareErr] = useState<string | null>(null);

  async function handleShareToFeed() {
    if (sharing || shared) return;
    setSharing(true);
    setShareErr(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSharing(false); return; }

    const { data: category } = await supabase
      .from("forum_categories")
      .select("id")
      .eq("slug", "burn-reports")
      .single();

    if (!category) { setShareErr("Could not find Burn Reports category."); setSharing(false); return; }

    const cigarLabel = [cigarBrand, cigarName].filter(Boolean).join(" ");
    const title      = `${cigarLabel} — ${overallRating}/100`;
    const content    = reviewText.trim() || `Rating: ${overallRating}/100`;

    const payload: Record<string, unknown> = { user_id: user.id, category_id: category.id, title, content };
    if (smokeLogId) payload.smoke_log_id = smokeLogId;

    const { error } = await supabase.from("forum_posts").insert(payload);

    setSharing(false);
    if (error) { setShareErr(error.message); return; }
    setShared(true);
    setTimeout(() => router.push("/lounge"), 1200);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16 animate-fade-in">
      {/* Score */}
      <div className="text-center space-y-3 mb-10">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
          Burn Report Filed
        </p>
        <p
          className="text-9xl font-bold leading-none"
          style={{ fontFamily: "var(--font-serif)", color }}
        >
          {overallRating}
        </p>
        <p className="text-lg font-medium" style={{ color }}>{ratingLabel(overallRating)}</p>
      </div>

      {/* Quantity notice */}
      {quantityAfter <= 0 && (
        <div
          className="w-full max-w-sm rounded-xl p-4 mb-8 text-center space-y-3"
          style={{ backgroundColor: "var(--secondary)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm text-foreground font-medium">
            You&apos;re out of this cigar.
          </p>
          <p className="text-xs text-muted-foreground">Remove it from your humidor or leave it at 0.</p>
          <button
            type="button"
            onClick={onRemoveFromHumidor}
            className="btn btn-ghost text-sm w-full"
            style={{ color: "#C44536" }}
          >
            Remove from Humidor
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="w-full max-w-sm space-y-3">
        <Link href="/humidor" className="btn btn-primary w-full block text-center">
          Back to Humidor
        </Link>
        {shareErr && (
          <p className="text-xs text-center" style={{ color: "#E8642C" }}>{shareErr}</p>
        )}
        <button
          type="button"
          onClick={handleShareToFeed}
          disabled={sharing || shared}
          className="btn btn-secondary w-full"
        >
          {shared ? "Shared! Opening Lounge..." : sharing ? "Sharing..." : "Share to Lounge"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Main BurnReport component
   ------------------------------------------------------------------ */

export function BurnReport({
  item,
  flavorTags,
  partnerVideos = [],
  displayName,
  city,
  reportNumber,
}: {
  item: BurnReportItem;
  flavorTags: FlavorTag[];
  partnerVideos?: PartnerVideo[];
  displayName: string | null;
  city: string | null;
  reportNumber: number;
}) {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [form, setForm] = useState<FormData>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stepError,   setStepError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [quantityAfter, setQuantityAfter] = useState(0);
  const [smokeLogId, setSmokeLogId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLElement>(null);
  const [shadowTop,    setShadowTop]    = useState(false);
  const [shadowBottom, setShadowBottom] = useState(false);

  /* Scroll to top + recalculate shadows on every step change */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    const raf = requestAnimationFrame(() => {
      setShadowTop(false);
      setShadowBottom(el.scrollHeight > el.clientHeight + 8);
    });
    return () => cancelAnimationFrame(raf);
  }, [step]);

  function handleScroll(e: React.UIEvent<HTMLElement>) {
    const el = e.currentTarget;
    setShadowTop(el.scrollTop > 8);
    setShadowBottom(el.scrollTop + el.clientHeight < el.scrollHeight - 8);
  }

  const update = useCallback((partial: Partial<FormData>) => {
    setForm((prev) => ({ ...prev, ...partial }));
    setStepError(null);
  }, []);

  function validateStep(s: number): string | null {
    if (s === 0) {
      if (!form.location.trim()) return "Location is required.";
    }
    if (s === 2) {
      if (form.draw_rating === 0)        return "Please rate the draw.";
      if (form.burn_rating === 0)        return "Please rate the burn.";
      if (form.construction_rating === 0) return "Please rate the construction.";
      if (form.flavor_rating === 0)      return "Please rate the flavor.";
    }
    if (s === 4) {
      if (!form.review_text.trim()) return "Review is required.";
      const mins = parseInt(form.smoke_duration_minutes);
      if (!form.smoke_duration_minutes.trim() || isNaN(mins) || mins <= 0)
        return "Smoke duration is required.";
    }
    return null;
  }

  /* Navigation */
  function goNext() {
    const err = validateStep(step);
    if (err) { setStepError(err); return; }
    setStepError(null);
    setDirection("forward");
    setStep((s) => s + 1);
  }

  function goBack() {
    setStepError(null);
    if (step === 0) {
      router.push(`/humidor/${item.id}`);
      return;
    }
    setDirection("back");
    setStep((s) => s - 1);
  }

  /* Upload photos → return public URLs */
  async function uploadPhotos(): Promise<string[]> {
    if (form.photo_files.length === 0) return [];
    const urls: string[] = [];
    for (const file of form.photo_files) {
      const fd = new FormData();
      fd.append("file",   file);
      fd.append("folder", "burn-reports");
      const res = await fetch("/api/upload/image", { method: "POST", body: fd });
      if (res.ok) {
        const { url } = await res.json();
        urls.push(url);
      } else {
        const { error } = await res.json().catch(() => ({ error: "Upload failed." }));
        throw new Error(error ?? "Upload failed.");
      }
    }
    return urls;
  }

  /* Submit */
  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSubmitError("Not authenticated.");
      setSubmitting(false);
      return;
    }

    /* Upload photos first */
    let photoUrls: string[] = [];
    try {
      photoUrls = await uploadPhotos();
    } catch (err) {
      const msg = err instanceof Error ? err.message : null;
      setSubmitError(msg ?? "Photo upload failed. Please try again.");
      setSubmitting(false);
      return;
    }

    /* Guard: cigar_id must be a valid catalog reference */
    if (!item.cigar_id) {
      setSubmitError("This humidor item is missing a cigar reference. Please remove and re-add it from the catalog.");
      setSubmitting(false);
      return;
    }

    /* Build insert payload */
    const payload: Record<string, unknown> = {
      user_id: user.id,
      cigar_id: item.cigar_id,
      humidor_item_id: item.id,
      smoked_at: form.smoked_at,
      overall_rating: form.overall_rating,
    };

    if (form.location.trim()) payload.location = form.location.trim();
    if (form.occasion) payload.occasion = form.occasion;
    if (form.pairing_drink.trim()) payload.pairing_drink = form.pairing_drink.trim();
    if (form.pairing_food.trim()) payload.pairing_food = form.pairing_food.trim();
    if (form.draw_rating > 0) payload.draw_rating = form.draw_rating;
    if (form.burn_rating > 0) payload.burn_rating = form.burn_rating;
    if (form.construction_rating > 0) payload.construction_rating = form.construction_rating;
    if (form.flavor_rating > 0) payload.flavor_rating = form.flavor_rating;
    if (form.flavor_tag_ids.length > 0) payload.flavor_tag_ids = form.flavor_tag_ids;
    if (form.review_text.trim()) payload.review_text = form.review_text.trim();
    if (photoUrls.length > 0) payload.photo_urls = photoUrls;
    if (form.smoke_duration_minutes.trim()) {
      const mins = parseInt(form.smoke_duration_minutes);
      if (!isNaN(mins) && mins > 0) payload.smoke_duration_minutes = mins;
    }
    if (form.content_video_id) payload.content_video_id = form.content_video_id;

    /* Insert smoke log. smoke_logs is the broad descriptive log;
       burn-report-only fields (Thirds) live on the burn_reports
       child table inserted below, NOT on smoke_logs. */
    const { data: logData, error: logError } = await supabase
      .from("smoke_logs")
      .insert(payload)
      .select("id")
      .single();
    if (logError) {
      setSubmitError(logError.message);
      setSubmitting(false);
      return;
    }

    setSmokeLogId(logData?.id ?? null);

    /* Insert the matching burn_reports row. Always created (1:1 with
       smoke_logs from this flow) so future burn-report-only fields
       have somewhere to live. third_* text is written even when the
       toggle is off so re-opening with the toggle on shows prior
       notes. We deliberately do NOT roll back the smoke_logs insert
       on failure here — the smoke_log itself is still a valid
       descriptive record; we just lose the thirds metadata. */
    if (logData?.id) {
      const burnPayload: Record<string, unknown> = {
        smoke_log_id:   logData.id,
        user_id:        user.id,
        thirds_enabled: form.thirds_enabled,
      };
      if (form.third_beginning.trim()) burnPayload.third_beginning = form.third_beginning.trim();
      if (form.third_middle.trim())    burnPayload.third_middle    = form.third_middle.trim();
      if (form.third_end.trim())       burnPayload.third_end       = form.third_end.trim();

      const { error: brError } = await supabase
        .from("burn_reports")
        .insert(burnPayload);
      if (brError) {
        // Log to console so it surfaces in dev; don't block the
        // success flow over a child-row failure.
        console.error("burn_reports insert failed:", brError.message);
      }
    }

    /* Decrement quantity */
    const newQty = Math.max(0, item.quantity - 1);
    await supabase
      .from("humidor_items")
      .update({ quantity: newQty })
      .eq("id", item.id);

    setQuantityAfter(newQty);
    setSubmitting(false);
    setSuccess(true);
  }

  /* Remove from humidor after 0-qty */
  async function handleRemoveFromHumidor() {
    const supabase = createClient();
    await supabase.from("humidor_items").delete().eq("id", item.id);
    router.push("/humidor");
  }

  /* ── Success screen ─────────────────────────────────────────────── */
  if (success) {
    return (
      <SuccessScreen
        overallRating={form.overall_rating}
        quantityAfter={quantityAfter}
        humidorItemId={item.id}
        cigarBrand={item.cigar.brand}
        cigarName={item.cigar.series ?? item.cigar.format}
        reviewText={form.review_text}
        smokeLogId={smokeLogId}
        onRemoveFromHumidor={handleRemoveFromHumidor}
      />
    );
  }

  /* ── Step content ───────────────────────────────────────────────── */
  const isSummary = step === STEPS.length - 1;

  const stepContent = () => {
    switch (step) {
      case 0: return <Step1 form={form} update={update} item={item} />;
      case 1: return <Step2 form={form} update={update} item={item} />;
      case 2: return <Step3 form={form} update={update} item={item} />;
      case 3: return <Step4 form={form} update={update} flavorTags={flavorTags} item={item} />;
      case 4: return <Step5 form={form} update={update} item={item} />;
      case 5: return (
        <SummaryStep
          form={form}
          flavorTags={flavorTags}
          item={item}
          partnerVideos={partnerVideos}
          update={update}
          displayName={displayName}
          city={city}
          reportNumber={reportNumber}
          onEdit={goBack}
        />
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* ── Header ────────────────────────────────────────────────── */}
      <header
        className="flex-shrink-0 px-4 pt-safe"
        style={{ backgroundColor: "var(--background)", borderBottom: "1px solid var(--line)" }}
      >
        <div className="max-w-lg mx-auto">
          {/* 3-column grid: back · centered eyebrow+title · counter */}
          <div
            className="pt-2 pb-3"
            style={{
              display:            "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems:         "center",
              gap:                12,
              minHeight:          56,
            }}
          >
            {/* Back / Cancel */}
            <button
              type="button"
              onClick={goBack}
              className="btn btn-ghost p-2 -ml-2 flex items-center gap-1.5"
              style={{
                justifySelf:    "start",
                fontFamily:     "var(--font-mono)",
                fontSize:       11,
                letterSpacing:  "0.18em",
                textTransform:  "uppercase",
                color:          "var(--paper-mute)",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {step === 0 ? "Cancel" : "Back"}
            </button>

            {/* Centered eyebrow + italic title */}
            <div className="text-center">
              <p
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      9,
                  letterSpacing: "0.32em",
                  textTransform: "uppercase",
                  color:         "var(--gold)",
                  margin:        0,
                }}
              >
                Step {step + 1}
              </p>
              <p
                style={{
                  fontFamily:    "var(--font-serif)",
                  fontStyle:     "italic",
                  fontSize:      18,
                  fontWeight:    500,
                  color:         "var(--foreground)",
                  margin:        "2px 0 0",
                  lineHeight:    1.1,
                }}
              >
                {STEPS[step]}
              </p>
            </div>

            {/* Step counter */}
            <p
              style={{
                justifySelf:    "end",
                fontFamily:     "var(--font-mono)",
                fontSize:       10,
                letterSpacing:  "0.2em",
                textTransform:  "uppercase",
                color:          "var(--paper-dim)",
                margin:         0,
              }}
            >
              {step + 1} of {STEPS.length}
            </p>
          </div>

          {/* 6-tick progress rail */}
          <div className="pb-3">
            <ProgressRail current={step} />
          </div>
        </div>
      </header>

      {/* ── Scrollable content with scroll shadows ───────────────── */}
      <div className="flex-1 relative overflow-hidden min-h-0">

        {/* Top shadow + caret — fades in when scrolled down */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 z-10 pointer-events-none transition-opacity duration-200"
          style={{
            height:     52,
            opacity:    shadowTop ? 1 : 0,
            background: "linear-gradient(to bottom, #1A1210 0%, transparent 100%)",
          }}
        />
        {/* Up caret — mobile only */}
        <div
          aria-hidden="true"
          className="absolute top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none sm:hidden transition-opacity duration-200"
          style={{ opacity: shadowTop ? 1 : 0 }}
        >
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 26, height: 26,
              background: "rgba(212,160,74,0.12)",
              border: "1px solid rgba(212,160,74,0.2)",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
              <path d="M2 7.5l3.5-4 3.5 4" stroke="#D4A04A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <main
          ref={scrollRef}
          className="h-full overflow-y-auto overscroll-contain"
          onScroll={handleScroll}
        >
          <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
            <div
              key={`${step}-${direction}`}
              className={direction === "forward" ? "animate-slide-in-right" : "animate-slide-in-left"}
            >
              {stepContent()}
            </div>
          </div>
        </main>

        {/* Bottom shadow + caret — fades in when more content below */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 z-10 pointer-events-none transition-opacity duration-200"
          style={{
            height:     52,
            opacity:    shadowBottom ? 1 : 0,
            background: "linear-gradient(to top, #1A1210 0%, transparent 100%)",
          }}
        />
        {/* Down caret — mobile only */}
        <div
          aria-hidden="true"
          className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none sm:hidden transition-opacity duration-200"
          style={{ opacity: shadowBottom ? 1 : 0 }}
        >
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 26, height: 26,
              background: "rgba(212,160,74,0.12)",
              border: "1px solid rgba(212,160,74,0.2)",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
              <path d="M2 3.5l3.5 4 3.5-4" stroke="#D4A04A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

      </div>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer
        className="flex-shrink-0 px-4 pt-4"
        style={{
          backgroundColor: "var(--background)",
          borderTop:       "1px solid var(--border)",
          paddingBottom:   "calc(env(safe-area-inset-bottom) + 24px)",
        }}
      >
        <div className="max-w-lg mx-auto space-y-2">
          {/* Validation / submit error */}
          {(stepError || submitError) && (
            <p className="text-sm text-destructive text-center">{stepError ?? submitError}</p>
          )}

          {/* Summary submit */}
          {isSummary ? (
            <>
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "Filing report…" : "File Burn Report"}
              </button>
              <button
                type="button"
                className="btn btn-ghost w-full text-sm text-muted-foreground"
                onClick={goBack}
                disabled={submitting}
              >
                Go Back and Edit
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3">
              {/* Skip — editorial text button with mono uppercase letterspacing */}
              {SKIPPABLE.has(step) && (
                <button
                  type="button"
                  onClick={goNext}
                  style={{
                    fontFamily:    "var(--font-mono)",
                    fontSize:      11,
                    fontWeight:    500,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color:         "var(--paper-mute)",
                    background:    "transparent",
                    border:        "none",
                    padding:       "0 12px",
                    cursor:        "pointer",
                  }}
                >
                  Skip
                </button>
              )}

              {/* Next */}
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={goNext}
              >
                {step === STEPS.length - 2 ? "Review" : "Next"}
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
