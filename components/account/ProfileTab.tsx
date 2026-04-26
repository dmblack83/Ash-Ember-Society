"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Toast } from "@/components/ui/toast";
import type { ProfileData } from "@/components/account/AccountClient";

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function getInitials(displayName: string | null, firstName: string | null, email: string): string {
  if (firstName) return firstName.charAt(0).toUpperCase();
  if (displayName) return displayName.charAt(0).toUpperCase();
  return email.charAt(0).toUpperCase();
}

function hashColor(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) { hash = (hash << 5) - hash + s.charCodeAt(i); hash |= 0; }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 18%, 20%)`;
}

/* ------------------------------------------------------------------
   Sub-components
   ------------------------------------------------------------------ */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] uppercase tracking-widest font-medium text-muted-foreground mb-1.5">
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  readOnly,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      readOnly={readOnly}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition-colors"
      style={{
        backgroundColor: readOnly ? "var(--muted)" : "var(--secondary)",
        border: "1px solid var(--border)",
        minHeight: 44,
        opacity: readOnly ? 0.7 : 1,
      }}
    />
  );
}

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

interface Props {
  userId:         string;
  email:          string;
  initialProfile: ProfileData;
}

export function ProfileTab({ userId, email, initialProfile }: Props) {
  /* ── Form state ──────────────────────────────────────────────── */
  const [displayName, setDisplayName] = useState(initialProfile.display_name ?? "");
  const [firstName,   setFirstName]   = useState(initialProfile.first_name   ?? "");
  const [lastName,    setLastName]    = useState(initialProfile.last_name    ?? "");
  const [phone,       setPhone]       = useState(initialProfile.phone        ?? "");
  const [city,        setCity]        = useState(initialProfile.city         ?? "");
  const [state,       setState]       = useState(initialProfile.state        ?? "");
  const [avatarUrl,   setAvatarUrl]   = useState(initialProfile.avatar_url   ?? "");

  /* ── Email change ────────────────────────────────────────────── */
  const [showEmailChange, setShowEmailChange] = useState(false);
  const [newEmail,         setNewEmail]        = useState("");
  const [emailChanging,    setEmailChanging]   = useState(false);

  /* ── Avatar upload ───────────────────────────────────────────── */
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const [uploading,    setUploading]   = useState(false);
  const [uploadPct,    setUploadPct]   = useState(0);

  /* ── Save / status ───────────────────────────────────────────── */
  const [saving,     setSaving]   = useState(false);
  const [toast,      setToast]    = useState<string | null>(null);
  const [saveError,  setSaveError] = useState<string | null>(null);

  /* ── Avatar upload handler ───────────────────────────────────── */
  const handleAvatarChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setToast("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setToast("Image must be under 5 MB.");
      return;
    }

    setUploading(true);
    setUploadPct(10);

    const supabase = createClient();
    const ext      = file.name.split(".").pop() ?? "jpg";
    const path     = `${userId}/avatar.${ext}`;

    try {
      setUploadPct(30);

      // Remove any existing avatar files so the subsequent upload is always an INSERT
      const { data: existing } = await supabase.storage.from("avatars").list(userId);
      if (existing && existing.length > 0) {
        await supabase.storage
          .from("avatars")
          .remove(existing.map((f) => `${userId}/${f.name}`));
      }

      setUploadPct(50);
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: false, contentType: file.type });

      if (uploadError) throw uploadError;
      setUploadPct(80);

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", userId);
      setAvatarUrl(publicUrl + `?t=${Date.now()}`); // cache-bust
      setUploadPct(100);
      setToast("Profile photo updated.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      setUploadPct(0);
      e.target.value = "";
    }
  }, [userId]);

  /* ── Email change handler ────────────────────────────────────── */
  async function handleEmailChange() {
    if (!newEmail.trim()) return;
    setEmailChanging(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailChanging(false);
    if (error) {
      setToast(error.message);
    } else {
      setShowEmailChange(false);
      setNewEmail("");
      setToast("Confirmation email sent to " + newEmail.trim() + ". Check your inbox.");
    }
  }

  /* ── Password reset handler ──────────────────────────────────── */
  async function handlePasswordReset() {
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) {
      setToast(error.message);
    } else {
      setToast("Password reset email sent. Check your inbox.");
    }
  }

  /* ── Save profile handler ────────────────────────────────────── */
  async function handleSave() {
    if (!displayName.trim()) {
      setSaveError("Display name is required.");
      return;
    }
    setSaveError(null);
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || null,
        first_name:   firstName.trim()   || null,
        last_name:    lastName.trim()    || null,
        phone:        phone.trim()       || null,
        city:         city.trim()        || null,
        state:        state.trim()       || null,
      })
      .eq("id", userId);

    setSaving(false);
    if (error) {
      setSaveError(error.message);
    } else {
      setToast("Profile saved.");
    }
  }

  const initials   = getInitials(displayName || null, firstName || null, email);
  const bgColor    = hashColor(displayName || email);

  return (
    <div className="space-y-8 animate-fade-in pb-10">

      {/* ── Avatar ─────────────────────────────────────────────── */}
      <section className="flex flex-col items-center gap-4 pt-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="relative rounded-full overflow-hidden focus:outline-none group"
          style={{ width: 88, height: 88, flexShrink: 0, touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
          aria-label="Change profile photo"
        >
          {/* Avatar image or initials */}
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Profile photo"
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-3xl font-semibold select-none"
              style={{ backgroundColor: bgColor, color: "var(--foreground)", fontFamily: "var(--font-serif)" }}
            >
              {initials}
            </div>
          )}
          {/* Hover/tap overlay */}
          <div
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-150"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <path d="M4 17h1.5l9-9-1.5-1.5-9 9V17zm13.7-11.3a1 1 0 000-1.4l-2-2a1 1 0 00-1.4 0L13 3.6l3.4 3.4 1.3-1.3z"
                fill="white" />
            </svg>
          </div>
          {/* Upload progress ring */}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
              <span className="text-xs font-bold text-white">{uploadPct}%</span>
            </div>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleAvatarChange}
        />
        <p className="text-xs text-muted-foreground">Tap to change photo · Max 5 MB</p>
      </section>

      {/* ── Profile form ───────────────────────────────────────── */}
      <section className="space-y-5">

        {/* Display Name */}
        <div>
          <FieldLabel>Display Name *</FieldLabel>
          <TextInput value={displayName} onChange={setDisplayName} placeholder="How you appear to others" />
        </div>

        {/* First + Last Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel>First Name</FieldLabel>
            <TextInput value={firstName} onChange={setFirstName} placeholder="First" />
          </div>
          <div>
            <FieldLabel>Last Name</FieldLabel>
            <TextInput value={lastName} onChange={setLastName} placeholder="Last" />
          </div>
        </div>

        {/* Email */}
        <div>
          <FieldLabel>Email</FieldLabel>
          <div className="flex gap-3 items-start">
            <div className="flex-1">
              <TextInput value={email} readOnly />
            </div>
            <button
              type="button"
              onClick={() => setShowEmailChange(v => !v)}
              className="btn btn-ghost text-sm flex-shrink-0"
              style={{ minHeight: 44, touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            >
              Change
            </button>
          </div>
          {showEmailChange && (
            <div className="mt-3 flex gap-3 items-center animate-slide-up">
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="New email address"
                className="flex-1 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
                style={{ backgroundColor: "var(--secondary)", border: "1px solid var(--primary)", minHeight: 44 }}
                onKeyDown={e => e.key === "Enter" && handleEmailChange()}
              />
              <button
                type="button"
                onClick={handleEmailChange}
                disabled={emailChanging || !newEmail.trim()}
                className="btn btn-primary text-sm flex-shrink-0"
                style={{ minHeight: 44, touchAction: "manipulation" }}
              >
                {emailChanging ? "Sending…" : "Send link"}
              </button>
            </div>
          )}
        </div>

        {/* Phone */}
        <div>
          <FieldLabel>Phone Number</FieldLabel>
          <TextInput value={phone} onChange={setPhone} placeholder="(555) 555-5555" type="tel" />
        </div>

        {/* Location */}
        <div>
          <FieldLabel>Location</FieldLabel>
          <p className="text-xs text-muted-foreground mb-2">
            Used for local shop and event discovery. Only city/state is shared.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <TextInput value={city} onChange={setCity} placeholder="City" />
            <TextInput value={state} onChange={setState} placeholder="State" />
          </div>
        </div>

      </section>

      {/* ── Danger zone ────────────────────────────────────────── */}
      <section
        className="rounded-2xl p-5 space-y-3"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
          Security
        </p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Password</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Receive a reset link via email
            </p>
          </div>
          <button
            type="button"
            onClick={handlePasswordReset}
            className="btn btn-ghost text-sm"
            style={{ minHeight: 44, touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
          >
            Reset
          </button>
        </div>
      </section>

      {/* ── Save error ─────────────────────────────────────────── */}
      {saveError && (
        <p className="text-sm text-destructive animate-slide-up">{saveError}</p>
      )}

      {/* ── Save button ────────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full btn btn-primary"
        style={{
          minHeight: 52,
          fontSize: "0.9rem",
          fontWeight: 600,
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
          background: saving ? "var(--muted)" : "var(--ember, #E8642C)",
          borderColor: saving ? "transparent" : "var(--ember, #E8642C)",
        }}
      >
        {saving ? "Saving…" : "Save Changes"}
      </button>

      {/* ── Toast ──────────────────────────────────────────────── */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
