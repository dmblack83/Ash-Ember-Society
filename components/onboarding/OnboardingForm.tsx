"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

/* ===================================================================
   OnboardingForm — extracted from app/(app)/onboarding/page.tsx so
   the page itself can be a server component with `export const
   dynamic = "force-dynamic"`. All form logic and Supabase client
   calls live here unchanged.
   =================================================================== */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

// Allow birth years from 120 years ago up to exactly 21 years ago.
const CURRENT_YEAR = new Date().getFullYear();
const MAX_BIRTH_YEAR = CURRENT_YEAR - 21;
const MIN_BIRTH_YEAR = CURRENT_YEAR - 120;

const YEARS = Array.from(
  { length: MAX_BIRTH_YEAR - MIN_BIRTH_YEAR + 1 },
  (_, i) => MAX_BIRTH_YEAR - i // descending: most-recent eligible year first
);

/* ===================================================================
   AGE GATE
   =================================================================== */
function calcAge(year: number, month: number, day: number): number {
  const today = new Date();
  const dob = new Date(year, month - 1, day);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age;
}

/* ===================================================================
   LOCAL COMPONENTS
   =================================================================== */

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

const selectClass = "flex-1 input appearance-none cursor-pointer";

/* ===================================================================
   ONBOARDING FORM

   Single-page profile setup. Same form for users who arrived via
   email signup or Google OAuth. The 21+ DOB gate lives here so it
   applies to every account, regardless of provider.
   =================================================================== */
export function OnboardingForm() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Profile fields
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [dobMonth, setDobMonth] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [zip, setZip] = useState("");

  // Validation
  const [nameError, setNameError] = useState<string | null>(null);
  const [dobError, setDobError] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Pre-fill display name from Google profile name OR email prefix
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);

      const meta = user.user_metadata as Record<string, unknown> | null;
      const fullName =
        typeof meta?.full_name === "string" ? meta.full_name :
        typeof meta?.name === "string"      ? meta.name      :
        null;

      if (fullName && fullName.trim()) {
        setDisplayName(fullName.trim());
      } else if (user.email) {
        const prefix = user.email.split("@")[0];
        const name = prefix
          .replace(/[._-]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        setDisplayName(name);
      }

      // Pre-fill avatar from Google profile picture if present
      const pictureUrl =
        typeof meta?.avatar_url === "string" ? meta.avatar_url :
        typeof meta?.picture    === "string" ? meta.picture    :
        null;
      if (pictureUrl) {
        setAvatarPreview(pictureUrl);
      }
    });
  }, []);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatar(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function validate(): boolean {
    let valid = true;

    if (!displayName.trim()) {
      setNameError("Please enter a display name.");
      valid = false;
    } else {
      setNameError(null);
    }

    if (!dobMonth || !dobDay || !dobYear) {
      setDobError("Please enter your full date of birth.");
      valid = false;
    } else {
      const age = calcAge(Number(dobYear), Number(dobMonth), Number(dobDay));
      if (age < 21) {
        setDobError("You must be 21 or older to use Ash & Ember Society.");
        valid = false;
      } else {
        setDobError(null);
      }
    }

    if (!/^\d{5}$/.test(zip.trim())) {
      setZipError("Please enter a valid 5-digit ZIP code.");
      valid = false;
    } else {
      setZipError(null);
    }

    return valid;
  }

  /* Best-effort city/state lookup from ZIP. Mirrors AccountClient's
     usage of the public Zippopotam.us API. If the lookup fails we
     still save the zip — features that need city/state will degrade
     gracefully rather than blocking onboarding completion. */
  async function deriveCityState(z: string): Promise<{ city: string | null; state: string | null }> {
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${z}`);
      if (!res.ok) return { city: null, state: null };
      const data = await res.json();
      return {
        city:  data.places?.[0]?.["place name"]         ?? null,
        state: data.places?.[0]?.["state abbreviation"] ?? null,
      };
    } catch {
      return { city: null, state: null };
    }
  }

  async function handleComplete() {
    setFormError(null);
    if (!validate()) return;
    if (!userId) {
      setFormError("Session not ready. Please try again in a moment.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();

      // Upload avatar if user picked a file (skip for Google-prefilled URLs)
      let avatarUrl: string | null = null;
      if (avatar) {
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
      } else if (avatarPreview && avatarPreview.startsWith("http")) {
        // Google profile picture URL — store as-is
        avatarUrl = avatarPreview;
      }

      const z = zip.trim();
      const { city, state } = await deriveCityState(z);

      const dateOfBirth = `${dobYear}-${String(dobMonth).padStart(2, "0")}-${String(dobDay).padStart(2, "0")}`;

      const { error: profileError } = await supabase.from("profiles").upsert({
        id:                   userId,
        display_name:         displayName.trim(),
        avatar_url:           avatarUrl,
        zip_code:             z,
        city:                 city,
        state:                state,
        onboarding_completed: true,
        updated_at:           new Date().toISOString(),
      });

      if (profileError) {
        setFormError("Could not save your profile. Please try again.");
        setLoading(false);
        return;
      }

      // Stash DOB + onboarding flag in user metadata so the proxy can
      // gate access without an extra DB query per request.
      await supabase.auth.updateUser({
        data: {
          date_of_birth:        dateOfBirth,
          onboarding_completed: true,
        },
      });

      router.refresh();
      router.push("/home");
    } catch (err) {
      console.error("Failed to save profile:", err);
      setFormError("Something went wrong. Please check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="card animate-fade-in">
          <div className="mb-7">
            <h1
              style={{ fontFamily: "var(--font-serif)" }}
              className="text-2xl font-bold text-foreground mb-1"
            >
              Set up your profile
            </h1>
            <p className="text-sm text-muted-foreground">
              A few details and you&apos;re in.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                {avatarPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarPreview}
                    alt="Avatar preview"
                    className="w-20 h-20 rounded-full object-cover border-2 border-border"
                  />
                ) : (
                  <AvatarPlaceholder size={80} />
                )}
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
                  onChange={handleAvatarChange}
                />
              </div>
              <p className="text-xs text-muted-foreground">Photo (optional)</p>
            </div>

            {/* Display name */}
            <Field id="display-name" label="Display Name" error={nameError}>
              <input
                id="display-name"
                type="text"
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How should we call you?"
                autoComplete="nickname"
                disabled={loading}
              />
            </Field>

            {/* Date of birth */}
            <Field
              id="dob-month"
              label="Date of birth"
              error={dobError}
              hint="You must be 21 or older to join."
            >
              <div className="flex gap-2">
                <select
                  id="dob-month"
                  className={selectClass}
                  value={dobMonth}
                  onChange={(e) => setDobMonth(e.target.value)}
                  disabled={loading}
                  style={{ color: dobMonth ? "var(--foreground)" : "var(--muted-foreground)" }}
                >
                  <option value="" disabled>Month</option>
                  {MONTHS.map((name, i) => (
                    <option key={name} value={i + 1}>{name}</option>
                  ))}
                </select>

                <select
                  id="dob-day"
                  className={selectClass}
                  style={{
                    maxWidth: "5rem",
                    color: dobDay ? "var(--foreground)" : "var(--muted-foreground)",
                  }}
                  value={dobDay}
                  onChange={(e) => setDobDay(e.target.value)}
                  disabled={loading}
                >
                  <option value="" disabled>Day</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>

                <select
                  id="dob-year"
                  className={selectClass}
                  style={{
                    maxWidth: "6.5rem",
                    color: dobYear ? "var(--foreground)" : "var(--muted-foreground)",
                  }}
                  value={dobYear}
                  onChange={(e) => setDobYear(e.target.value)}
                  disabled={loading}
                >
                  <option value="" disabled>Year</option>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </Field>

            {/* ZIP code */}
            <Field
              id="zip-code"
              label="ZIP Code"
              error={zipError}
              hint="Used only to enable location-based features (smoking conditions, nearby shops). Not shared, not tracked."
            >
              <input
                id="zip-code"
                type="text"
                inputMode="numeric"
                pattern="\d{5}"
                maxLength={5}
                className="input"
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 84101"
                autoComplete="postal-code"
                disabled={loading}
              />
            </Field>

            {formError && (
              <p role="alert" className="text-sm text-destructive animate-fade-in -mt-1">
                {formError}
              </p>
            )}

            <button
              type="button"
              onClick={handleComplete}
              disabled={loading}
              className="btn btn-primary w-full mt-1 disabled:opacity-60"
            >
              {loading ? "Saving…" : "Start Exploring"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
