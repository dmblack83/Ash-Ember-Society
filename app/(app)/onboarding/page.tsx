"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

/* ===================================================================
   CONSTANTS
   =================================================================== */

const US_STATES = [
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
] as const;

const EXPERIENCE_LEVELS = [
  {
    id: "newcomer",
    label: "Newcomer",
    desc: "Just getting started with cigars",
  },
  {
    id: "casual",
    label: "Casual",
    desc: "I enjoy a cigar now and then",
  },
  {
    id: "enthusiast",
    label: "Enthusiast",
    desc: "Cigars are a regular part of my life",
  },
  {
    id: "aficionado",
    label: "Aficionado",
    desc: "Deep knowledge, curated collection",
  },
] as const;

const WRAPPER_TYPES = [
  "Connecticut",
  "Habano",
  "Maduro",
  "Oscuro",
  "Corojo",
  "Cameroon",
  "Sumatra",
  "Candela",
] as const;

const SMOKING_FREQUENCIES = ["Daily", "Weekly", "Monthly", "Occasional"] as const;

const TOTAL_STEPS = 3;

/* ===================================================================
   LOCAL COMPONENTS
   =================================================================== */

/** Labelled form field with optional error and hint text. */
function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string | null;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs uppercase tracking-widest text-muted-foreground font-medium"
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive animate-fade-in">
          {error}
        </p>
      )}
    </div>
  );
}

/** Radio card for experience level — full-width tappable label. */
function ExperienceCard({
  id,
  label,
  desc,
  selected,
  onSelect,
}: {
  id: string;
  label: string;
  desc: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 p-4 rounded-xl border cursor-pointer select-none transition-all duration-200",
        "bg-card",
        selected
          ? "border-primary"
          : "border-border hover:border-primary/30"
      )}
      style={
        selected
          ? { boxShadow: "0 0 20px rgba(232, 100, 44, 0.15)" }
          : undefined
      }
    >
      {/* Visually hidden native radio keeps keyboard / a11y working */}
      <input
        type="radio"
        name="experience-level"
        value={id}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      {/* Custom radio dot */}
      <span
        className={cn(
          "mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 transition-colors duration-150",
          selected ? "border-primary bg-primary" : "border-border bg-transparent"
        )}
      />
      <span className="flex flex-col">
        <span className="text-sm font-medium text-foreground leading-tight">
          {label}
        </span>
        <span className="text-xs text-muted-foreground mt-0.5">{desc}</span>
      </span>
    </label>
  );
}

/** Wrapper chip — toggles on/off selection. */
function WrapperChip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 border",
        selected
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

/** Frequency radio row. */
function FrequencyOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <input
        type="radio"
        name="smoking-frequency"
        value={label}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        className={cn(
          "w-4 h-4 rounded-full border-2 transition-colors duration-150 flex-shrink-0",
          selected ? "border-primary bg-primary" : "border-border group-hover:border-primary/50"
        )}
      />
      <span
        className={cn(
          "text-sm transition-colors duration-150",
          selected ? "text-foreground font-medium" : "text-muted-foreground group-hover:text-foreground"
        )}
      >
        {label}
      </span>
    </label>
  );
}

/** Default avatar placeholder SVG. */
function AvatarPlaceholder({ size = 80 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-muted border-2 border-border flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.45}
        height={size * 0.45}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="16" cy="12" r="6" fill="var(--muted-foreground)" opacity="0.45" />
        <path
          d="M4 28c0-6.627 5.373-12 12-12s12 5.373 12 12"
          stroke="var(--muted-foreground)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.45"
        />
      </svg>
    </div>
  );
}

/* ===================================================================
   STEP CONTENTS
   Each step receives only the slice of state it needs.
   =================================================================== */

function Step1Content({
  displayName, setDisplayName,
  city, setCity,
  stateVal, setStateVal,
  avatarPreview, onAvatarChange,
  error,
}: {
  displayName: string; setDisplayName: (v: string) => void;
  city: string; setCity: (v: string) => void;
  stateVal: string; setStateVal: (v: string) => void;
  avatarPreview: string | null; onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2
          style={{ fontFamily: "var(--font-serif)" }}
          className="text-xl font-bold text-foreground mb-1"
        >
          About You
        </h2>
        <p className="text-sm text-muted-foreground">
          Let&apos;s set up your profile
        </p>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center gap-2">
        <div className="relative">
          {avatarPreview ? (
            <img
              src={avatarPreview}
              alt="Avatar preview"
              className="w-20 h-20 rounded-full object-cover border-2 border-border"
            />
          ) : (
            <AvatarPlaceholder size={80} />
          )}
          {/* Upload trigger */}
          <label
            htmlFor="avatar-upload"
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary flex items-center justify-center cursor-pointer hover:brightness-110 transition-all duration-150"
            title="Upload photo"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M6 1v10M1 6h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="sr-only">Upload avatar</span>
          </label>
          <input
            id="avatar-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onAvatarChange}
          />
        </div>
        <p className="text-xs text-muted-foreground">Photo (optional)</p>
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-4">
        <Field id="display-name" label="Display Name" error={error}>
          <input
            id="display-name"
            type="text"
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How should we call you?"
            autoComplete="nickname"
          />
        </Field>

        <Field id="city" label="City">
          <input
            id="city"
            type="text"
            className="input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Chicago"
            autoComplete="address-level2"
          />
        </Field>

        <Field id="state" label="State">
          <select
            id="state"
            className="input"
            value={stateVal}
            onChange={(e) => setStateVal(e.target.value)}
            style={{
              color: stateVal ? "var(--foreground)" : "var(--muted-foreground)",
            }}
          >
            <option value="">Select a state</option>
            {US_STATES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

function Step2Content({
  experienceLevel, setExperienceLevel,
  preferredWrappers, toggleWrapper,
  smokingFrequency, setSmokingFrequency,
  error,
}: {
  experienceLevel: string; setExperienceLevel: (v: string) => void;
  preferredWrappers: string[]; toggleWrapper: (w: string) => void;
  smokingFrequency: string; setSmokingFrequency: (v: string) => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2
          style={{ fontFamily: "var(--font-serif)" }}
          className="text-xl font-bold text-foreground mb-1"
        >
          Your Preferences
        </h2>
        <p className="text-sm text-muted-foreground">
          Help us personalise your experience
        </p>
      </div>

      {/* Experience level */}
      <div className="flex flex-col gap-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          Experience Level
        </p>
        <div className="flex flex-col gap-2">
          {EXPERIENCE_LEVELS.map((level) => (
            <ExperienceCard
              key={level.id}
              id={level.id}
              label={level.label}
              desc={level.desc}
              selected={experienceLevel === level.id}
              onSelect={() => setExperienceLevel(level.id)}
            />
          ))}
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive animate-fade-in">
            {error}
          </p>
        )}
      </div>

      {/* Wrapper preferences */}
      <div className="flex flex-col gap-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          Preferred Wrappers{" "}
          <span className="normal-case tracking-normal">(select all that apply)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {WRAPPER_TYPES.map((w) => (
            <WrapperChip
              key={w}
              label={w}
              selected={preferredWrappers.includes(w)}
              onToggle={() => toggleWrapper(w)}
            />
          ))}
        </div>
      </div>

      {/* Smoking frequency */}
      <div className="flex flex-col gap-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          How often do you smoke?
        </p>
        <div className="flex flex-col gap-3">
          {SMOKING_FREQUENCIES.map((f) => (
            <FrequencyOption
              key={f}
              label={f}
              selected={smokingFrequency === f}
              onSelect={() => setSmokingFrequency(f)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Step3Content({
  displayName,
  city,
  stateVal,
  avatarPreview,
  experienceLevel,
  preferredWrappers,
  smokingFrequency,
}: {
  displayName: string;
  city: string;
  stateVal: string;
  avatarPreview: string | null;
  experienceLevel: string;
  preferredWrappers: string[];
  smokingFrequency: string;
}) {
  const experienceLabel =
    EXPERIENCE_LEVELS.find((l) => l.id === experienceLevel)?.label ?? "—";

  const stateLabel =
    US_STATES.find((s) => s.value === stateVal)?.label ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2
          style={{ fontFamily: "var(--font-serif)" }}
          className="text-xl font-bold text-foreground mb-1"
        >
          Welcome to the Society
        </h2>
        <p className="text-sm text-muted-foreground">
          Here&apos;s a summary of your profile
        </p>
      </div>

      {/* Summary card */}
      <div
        className="rounded-xl border border-border p-5 flex flex-col gap-4"
        style={{ backgroundColor: "var(--muted)" }}
      >
        {/* Identity row */}
        <div className="flex items-center gap-4">
          {avatarPreview ? (
            <img
              src={avatarPreview}
              alt={displayName}
              className="w-14 h-14 rounded-full object-cover border-2 border-border flex-shrink-0"
            />
          ) : (
            <AvatarPlaceholder size={56} />
          )}
          <div>
            <p className="font-medium text-foreground">
              {displayName || "—"}
            </p>
            {(city || stateLabel) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {[city, stateLabel].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-border" />

        {/* Details grid */}
        <div className="flex flex-col gap-3">
          <SummaryRow label="Experience" value={experienceLabel} />
          <SummaryRow
            label="Wrappers"
            value={
              preferredWrappers.length > 0
                ? preferredWrappers.join(", ")
                : "None selected"
            }
          />
          <SummaryRow
            label="Frequency"
            value={smokingFrequency || "Not specified"}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        You can update any of this from your profile settings.
      </p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium flex-shrink-0">
        {label}
      </span>
      <span className="text-sm text-foreground text-right">{value}</span>
    </div>
  );
}

/* ===================================================================
   PAGE
   =================================================================== */

type StepTransition = { step: number; dir: "right" | "left" | "none" };

export default function OnboardingPage() {
  const router = useRouter();

  // Step navigation state — dir drives which slide animation fires
  const [transition, setTransition] = useState<StepTransition>({
    step: 1,
    dir: "none",
  });
  const step = transition.step;

  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // ── Step 1 ──────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [step1Error, setStep1Error] = useState<string | null>(null);

  // ── Step 2 ──────────────────────────────────────────────────────
  const [experienceLevel, setExperienceLevel] = useState("");
  const [preferredWrappers, setPreferredWrappers] = useState<string[]>([]);
  const [smokingFrequency, setSmokingFrequency] = useState("");
  const [step2Error, setStep2Error] = useState<string | null>(null);

  // Pre-fill display name from email prefix on mount
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      if (user.email) {
        const prefix = user.email.split("@")[0];
        const name = prefix
          .replace(/[._-]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        setDisplayName(name);
      }
    });
  }, []);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatar(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function toggleWrapper(wrapper: string) {
    setPreferredWrappers((prev) =>
      prev.includes(wrapper) ? prev.filter((w) => w !== wrapper) : [...prev, wrapper]
    );
  }

  // ── Navigation ──────────────────────────────────────────────────

  function goNext() {
    if (step === 1) {
      if (!displayName.trim()) {
        setStep1Error("Please enter a display name.");
        return;
      }
      setStep1Error(null);
    }
    if (step === 2) {
      if (!experienceLevel) {
        setStep2Error("Please select your experience level.");
        return;
      }
      setStep2Error(null);
    }
    setTransition({ step: step + 1, dir: "right" });
  }

  function goBack() {
    setTransition({ step: step - 1, dir: "left" });
  }

  const skip = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.updateUser({ data: { onboarding_completed: true } });
    router.refresh();
    router.push("/dashboard");
  }, [router]);

  const handleComplete = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();

      // Upload avatar if provided
      let avatarUrl: string | null = null;
      if (avatar && userId) {
        const ext = avatar.name.split(".").pop() ?? "jpg";
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(`${userId}/avatar.${ext}`, avatar, { upsert: true });

        if (!uploadError && uploadData) {
          const {
            data: { publicUrl },
          } = supabase.storage.from("avatars").getPublicUrl(uploadData.path);
          avatarUrl = publicUrl;
        }
      }

      // Upsert profile row
      await supabase.from("profiles").upsert({
        id: userId,
        display_name: displayName.trim() || (await supabase.auth.getUser()).data.user?.email?.split("@")[0] || "Member",
        city: city.trim() || null,
        state: stateVal || null,
        avatar_url: avatarUrl,
        experience_level: experienceLevel || null,
        preferred_wrappers: preferredWrappers,
        smoking_frequency: smokingFrequency || null,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      });

      // Write onboarding_completed into user metadata so the proxy
      // can check it without an extra DB query on every request.
      await supabase.auth.updateUser({
        data: { onboarding_completed: true },
      });

      router.refresh();
      router.push("/dashboard");
    } catch (err) {
      console.error("Failed to save profile:", err);
      setLoading(false);
    }
  }, [
    avatar, userId, displayName, city, stateVal,
    experienceLevel, preferredWrappers, smokingFrequency, router,
  ]);

  // ── Animation class ─────────────────────────────────────────────
  // Using key={step} causes React to remount the step wrapper,
  // which restarts the CSS animation. dir determines which direction.
  const animClass =
    transition.dir === "right"
      ? "slide-in-right"
      : transition.dir === "left"
      ? "slide-in-left"
      : "animate-fade-in";

  const progress = Math.round((step / TOTAL_STEPS) * 100);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">

        {/* ── Progress ─────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
              Step {step} of {TOTAL_STEPS}
            </span>
            <button
              type="button"
              onClick={skip}
              className="text-xs text-muted-foreground hover:text-primary transition-colors duration-150"
            >
              Skip for now
            </button>
          </div>
          {/* Track */}
          <div className="h-0.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* ── Step card with slide transition ─────────────────── */}
        {/*
         * key={step} remounts the div when the step changes,
         * firing the CSS animation fresh on each transition.
         */}
        <div key={step} className={cn("card", animClass)}>
          {step === 1 && (
            <Step1Content
              displayName={displayName}
              setDisplayName={setDisplayName}
              city={city}
              setCity={setCity}
              stateVal={stateVal}
              setStateVal={setStateVal}
              avatarPreview={avatarPreview}
              onAvatarChange={handleAvatarChange}
              error={step1Error}
            />
          )}
          {step === 2 && (
            <Step2Content
              experienceLevel={experienceLevel}
              setExperienceLevel={setExperienceLevel}
              preferredWrappers={preferredWrappers}
              toggleWrapper={toggleWrapper}
              smokingFrequency={smokingFrequency}
              setSmokingFrequency={setSmokingFrequency}
              error={step2Error}
            />
          )}
          {step === 3 && (
            <Step3Content
              displayName={displayName}
              city={city}
              stateVal={stateVal}
              avatarPreview={avatarPreview}
              experienceLevel={experienceLevel}
              preferredWrappers={preferredWrappers}
              smokingFrequency={smokingFrequency}
            />
          )}
        </div>

        {/* ── Navigation ───────────────────────────────────────── */}
        <div className="flex items-center justify-between mt-6">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 1}
            className="btn btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Back
          </button>

          {step < TOTAL_STEPS ? (
            <button type="button" onClick={goNext} className="btn btn-primary">
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleComplete}
              disabled={loading}
              className="btn btn-primary disabled:opacity-60"
            >
              {loading ? "Saving…" : "Start Exploring"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
