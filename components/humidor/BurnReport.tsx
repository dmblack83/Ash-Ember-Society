"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import type { BurnReportItem, FlavorTag } from "@/app/(app)/humidor/[id]/burn-report/page";
import { getCigarImage } from "@/lib/cigar-default-image";

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
   ProgressDots
   ------------------------------------------------------------------ */

function ProgressDots({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
      {STEPS.map((_, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width: i === current ? "20px" : "6px",
            height: "6px",
            backgroundColor:
              i < current
                ? "var(--primary)"
                : i === current
                ? "var(--ember)"
                : "var(--muted-foreground)",
            opacity: i > current ? 0.4 : 1,
          }}
        />
      ))}
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
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => onChange(star)}
            className="p-1 -m-1 transition-transform duration-100 active:scale-90"
            aria-label={`${star} star`}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                fill={star <= display ? "var(--primary)" : "none"}
                stroke={star <= display ? "var(--primary)" : "var(--border)"}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ))}
      </div>
      <p
        className="text-xs font-medium transition-colors duration-150"
        style={{ color: display > 0 ? "var(--primary)" : "var(--muted-foreground)" }}
      >
        {display > 0 ? STAR_LABELS[display] : "Tap to rate"}
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
      className="flex items-center gap-3 p-3 rounded-xl mb-6"
      style={{ backgroundColor: "var(--muted)", border: "1px solid var(--border)" }}
    >
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-card flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getCigarImage(c.image_url, c.wrapper)}
          alt={c.name}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
          {c.brand}
        </p>
        <p
          className="text-sm font-semibold text-foreground truncate"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {c.series ?? c.name}
        </p>
        {c.format && <p className="text-xs text-muted-foreground">{c.format}</p>}
      </div>
    </div>
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

      <div className="space-y-1.5">
        <label htmlFor="br-date" className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
          Date Smoked
        </label>
        <input
          id="br-date"
          type="date"
          className="input"
          value={form.smoked_at}
          max={today}
          onChange={(e) => update({ smoked_at: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="br-location" className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
          Location
        </label>
        <input
          id="br-location"
          type="text"
          className="input"
          placeholder="Where are you smoking?"
          value={form.location}
          onChange={(e) => update({ location: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
          Occasion <span className="normal-case tracking-normal font-normal">(optional)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {OCCASIONS.map((occ) => (
            <button
              key={occ}
              type="button"
              onClick={() => update({ occasion: form.occasion === occ ? "" : occ })}
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150 active:scale-95"
              style={
                form.occasion === occ
                  ? { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }
                  : { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }
              }
            >
              {occ}
            </button>
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

      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
          Quick-select drink
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_PAIRINGS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => update({ pairing_drink: form.pairing_drink === p ? "" : p })}
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150 active:scale-95"
              style={
                form.pairing_drink === p
                  ? { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }
                  : { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }
              }
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="br-drink" className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
          Pairing Drink <span className="normal-case tracking-normal font-normal">(optional)</span>
        </label>
        <input
          id="br-drink"
          type="text"
          className="input"
          placeholder="What are you drinking?"
          value={form.pairing_drink}
          onChange={(e) => update({ pairing_drink: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="br-food" className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
          Pairing Food <span className="normal-case tracking-normal font-normal">(optional)</span>
        </label>
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
  return (
    <div className="space-y-6">
      <CigarContext item={item} />
      <StarRating
        value={form.draw_rating}
        onChange={(v) => update({ draw_rating: v })}
        label="How was the draw?"
      />
      <div className="h-px bg-border" />
      <StarRating
        value={form.burn_rating}
        onChange={(v) => update({ burn_rating: v })}
        label="How even was the burn?"
      />
      <div className="h-px bg-border" />
      <StarRating
        value={form.construction_rating}
        onChange={(v) => update({ construction_rating: v })}
        label="How was the construction?"
      />
      <div className="h-px bg-border" />
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

  const selectedNames = flavorTags
    .filter((t) => form.flavor_tag_ids.includes(t.id))
    .map((t) => t.name);

  return (
    <div className="space-y-6">
      <CigarContext item={item} />

      {Object.entries(grouped).map(([cat, tags]) => (
        <div key={cat} className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
            {CATEGORY_DISPLAY[cat]}
          </p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const active = form.flavor_tag_ids.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150 active:scale-95"
                  style={
                    active
                      ? { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }
                      : { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }
                  }
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {selectedNames.length > 0 && (
        <div
          className="p-3 rounded-xl space-y-1"
          style={{ backgroundColor: "var(--muted)", border: "1px solid var(--border)" }}
        >
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            Selected flavors
          </p>
          <p className="text-sm text-foreground">{selectedNames.join(" · ")}</p>
        </div>
      )}
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
  const color = ratingColor(form.overall_rating);
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

      {/* Overall rating slider */}
      <div className="space-y-4">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
          Overall Rating
        </p>

        {/* Large number */}
        <div className="text-center py-4">
          <p
            className="text-8xl font-bold leading-none transition-colors duration-300"
            style={{ fontFamily: "var(--font-serif)", color }}
          >
            {form.overall_rating}
          </p>
          <p
            className="text-base font-medium mt-2 transition-colors duration-300"
            style={{ color }}
          >
            {label}
          </p>
        </div>

        {/* Slider */}
        <div className="px-1 space-y-2">
          <input
            type="range"
            min={1}
            max={100}
            value={form.overall_rating}
            onChange={(e) => update({ overall_rating: parseInt(e.target.value) })}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, ${color} ${form.overall_rating}%, var(--muted) ${form.overall_rating}%)`,
              accentColor: color,
            }}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>1</span>
            <span>Poor</span>
            <span>Average</span>
            <span>Good</span>
            <span>100</span>
          </div>
        </div>
      </div>

      {/* Review text */}
      <div className="space-y-1.5">
        <label htmlFor="br-review" className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
          Review
        </label>
        <textarea
          id="br-review"
          className="input resize-none"
          placeholder="Share your thoughts on this cigar…"
          rows={4}
          value={form.review_text}
          onChange={(e) => update({ review_text: e.target.value })}
        />
      </div>

      {/* Smoke duration */}
      <div className="space-y-1.5">
        <label htmlFor="br-duration" className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
          Smoke Duration <span className="normal-case tracking-normal font-normal">(minutes)</span>
        </label>
        <input
          id="br-duration"
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="e.g. 90"
          className="input"
          value={form.smoke_duration_minutes}
          onChange={(e) => update({ smoke_duration_minutes: e.target.value })}
        />
      </div>

      {/* Photo upload */}
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
          Photos <span className="normal-case tracking-normal font-normal">(optional, up to 3)</span>
        </p>

        <div className="flex items-center gap-3">
          {form.photo_files.map((file, i) => (
            <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(file)}
                alt={`Photo ${i + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
                aria-label="Remove photo"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8M8 2L2 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}

          {form.photo_files.length < 3 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-20 h-20 rounded-lg flex flex-col items-center justify-center gap-1 flex-shrink-0 transition-colors duration-150"
              style={{
                backgroundColor: "var(--muted)",
                border: "1.5px dashed var(--border)",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M10 4v12M4 10h12" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="text-[10px] text-muted-foreground">Add</span>
            </button>
          )}
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
   Step 6 — Summary
   ------------------------------------------------------------------ */

function SummaryStep({
  form,
  flavorTags,
  item,
}: {
  form: FormData;
  flavorTags: FlavorTag[];
  item: BurnReportItem;
}) {
  const c = item.cigar;
  const color = ratingColor(form.overall_rating);
  const selectedTagNames = flavorTags
    .filter((t) => form.flavor_tag_ids.includes(t.id))
    .map((t) => t.name);

  function Row({ label, value }: { label: string; value: string }) {
    return (
      <div className="flex items-start justify-between gap-4 py-2.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium flex-shrink-0">{label}</span>
        <span className="text-sm text-foreground text-right">{value}</span>
      </div>
    );
  }

  function StarsSummary({ val }: { val: number }) {
    return (
      <span className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              fill={s <= val ? "var(--primary)" : "none"}
              stroke={s <= val ? "var(--primary)" : "var(--border)"}
              strokeWidth="1.5"
            />
          </svg>
        ))}
        <span className="text-xs text-muted-foreground ml-1">{STAR_LABELS[val]}</span>
      </span>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cigar + overall score hero */}
      <div
        className="rounded-2xl p-5 text-center space-y-2"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
          {c.brand}
        </p>
        <p className="text-lg font-semibold text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
          {c.series ?? c.name}
        </p>
        <p
          className="text-6xl font-bold leading-none mt-3"
          style={{ fontFamily: "var(--font-serif)", color }}
        >
          {form.overall_rating}
        </p>
        <p className="text-sm font-medium" style={{ color }}>{ratingLabel(form.overall_rating)}</p>
      </div>

      {/* Details */}
      <div
        className="rounded-xl px-4"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        <Row
          label="Date"
          value={form.smoked_at
            ? new Date(form.smoked_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
            : "N/A"}
        />
        <Row label="Location" value={form.location.trim() || "N/A"} />
        <Row label="Occasion" value={form.occasion || "N/A"} />
        <Row label="Drink"    value={form.pairing_drink.trim() || "N/A"} />
        <Row label="Food"     value={form.pairing_food.trim() || "N/A"} />
        <Row label="Duration" value={form.smoke_duration_minutes.trim() ? `${form.smoke_duration_minutes} min` : "N/A"} />

        {(["Draw", "Burn", "Construction", "Flavor"] as const).map((lbl, i) => {
          const val = [form.draw_rating, form.burn_rating, form.construction_rating, form.flavor_rating][i];
          const isLast = i === 3;
          return (
            <div
              key={lbl}
              className={`flex items-center justify-between gap-4 py-2.5 ${isLast ? "" : "border-b"}`}
              style={{ borderColor: "var(--border)" }}
            >
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">{lbl}</span>
              {val > 0
                ? <StarsSummary val={val} />
                : <span className="text-sm text-muted-foreground">N/A</span>}
            </div>
          );
        })}
      </div>

      {/* Flavor tags */}
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Flavor Profile</p>
        {selectedTagNames.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selectedTagNames.map((name) => (
              <span
                key={name}
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: "var(--secondary)", color: "var(--foreground)" }}
              >
                {name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">N/A</p>
        )}
      </div>

      {/* Review */}
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Review</p>
        <p className="text-sm text-foreground leading-relaxed">{form.review_text.trim() || "N/A"}</p>
      </div>

      {/* Photos */}
      {form.photo_files.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
            Photos ({form.photo_files.length})
          </p>
          <div className="flex gap-2">
            {form.photo_files.map((file, i) => (
              <div key={i} className="w-20 h-20 rounded-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
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
  cigarName:           string;
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
}: {
  item: BurnReportItem;
  flavorTags: FlavorTag[];
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
  async function uploadPhotos(supabase: ReturnType<typeof createClient>): Promise<string[]> {
    if (form.photo_files.length === 0) return [];
    const { data: { user } } = await supabase.auth.getUser();
    const urls: string[] = [];
    for (const file of form.photo_files) {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `burn-reports/${user?.id ?? "anon"}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("post-images").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from("post-images").getPublicUrl(path);
        urls.push(publicUrl);
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
      photoUrls = await uploadPhotos(supabase);
    } catch {
      // non-fatal — continue without photos
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

    /* Insert smoke log */
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
        cigarName={item.cigar.name}
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
      case 5: return <SummaryStep form={form} flavorTags={flavorTags} item={item} />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* ── Header ────────────────────────────────────────────────── */}
      <header
        className="flex-shrink-0 px-4 pt-safe"
        style={{ backgroundColor: "var(--background)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between h-14">
            {/* Back / Close */}
            <button
              type="button"
              onClick={goBack}
              className="btn btn-ghost p-2 -ml-2 flex items-center gap-1.5 text-sm text-muted-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {step === 0 ? "Cancel" : "Back"}
            </button>

            {/* Title */}
            <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
              {STEPS[step]}
            </p>

            {/* Step counter */}
            <p className="text-xs text-muted-foreground w-16 text-right">
              {step + 1} of {STEPS.length}
            </p>
          </div>

          {/* Progress dots */}
          <div className="pb-3">
            <ProgressDots current={step} />
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
            <div className="flex gap-3">
              {/* Skip (only for skippable steps) */}
              {SKIPPABLE.has(step) && (
                <button
                  type="button"
                  className="btn btn-ghost text-sm text-muted-foreground"
                  onClick={goNext}
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
