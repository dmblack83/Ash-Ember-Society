"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Toast } from "@/components/ui/toast";
import { MembershipTab } from "@/components/account/MembershipTab";
import { LegalTab } from "@/components/account/LegalTab";

/* InstallSheet (360 lines) only mounts when the user taps "Install".
   Conditional render means the chunk fetches lazily. */
const InstallSheet = dynamic(
  () => import("@/components/account/InstallSheet").then((m) => ({ default: m.InstallSheet })),
  { ssr: false },
);
import { AvatarFrame } from "@/components/ui/AvatarFrame";
import { ScrollCarets } from "@/components/ui/ScrollCarets";
import { getInstallState, useBeforeInstallPrompt, type InstallState } from "@/lib/install-prompt";
import { resolveBadge, getBadgeOptions } from "@/lib/badge";
import type { MembershipTier } from "@/lib/stripe";

/* ─── Types ──────────────────────────────────────────────────────────── */

export interface ProfileData {
  display_name: string | null;
  first_name:   string | null;
  last_name:    string | null;
  phone:        string | null;
  city:         string | null;
  state:        string | null;
  zip_code:     string | null;
  avatar_url:   string | null;
}

export interface MembershipData {
  currentTier:       MembershipTier;
  hasStripeCustomer: boolean;
  nextBillingDate:   string | null;
  billingInterval:   "month" | "year" | null;
  currentPeriodEnd:  number | null;
  priceIds: {
    memberMonthly:  string;
    memberAnnual:   string;
    premiumMonthly: string;
    premiumAnnual:  string;
  };
}

export interface LegalData {
  termsContent: string;
  eulaContent:  string;
}

interface Props {
  userId:      string;
  email:       string;
  profile:     ProfileData;
  membership:  MembershipData;
  legal:       LegalData;
  memberSince: string | null;
  badge:       string | null;
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

const BLOCKED = [
  "fuck","shit","bitch","cunt","dick","cock","pussy",
  "nigger","nigga","faggot","fag","whore","slut","asshole",
];

function hasProfanity(s: string): boolean {
  const words = s.toLowerCase().split(/[\s\d_\-\.]+/);
  return BLOCKED.some(bad => words.some(w => w.startsWith(bad)));
}

function getInitials(name: string | null, email: string): string {
  if (name) return name.charAt(0).toUpperCase();
  return email.charAt(0).toUpperCase();
}

function hashColor(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) { hash = (hash << 5) - hash + s.charCodeAt(i); hash |= 0; }
  return `hsl(${Math.abs(hash) % 360}, 18%, 20%)`;
}

function tierLabel(tier: MembershipTier): string {
  if (tier === "premium") return "Premium";
  if (tier === "member")  return "Member";
  return "Free";
}

function tierColor(tier: MembershipTier): string {
  if (tier === "premium") return "var(--accent, #D4A04A)";
  if (tier === "member")  return "var(--primary, #C17817)";
  return "var(--muted-foreground)";
}

function formatPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length <= 3)  return `(${d}`;
  if (d.length <= 6)  return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/* ─── Shared UI ──────────────────────────────────────────────────────── */

function FieldInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      readOnly={!onChange}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      style={{
        display: "block",
        width: "100%",
        fontSize: 16,
        padding: "12px 16px",
        borderRadius: 12,
        border: "1px solid var(--border)",
        backgroundColor: disabled ? "rgba(255,255,255,0.04)" : "var(--secondary)",
        color: disabled ? "var(--muted-foreground)" : "var(--foreground)",
        opacity: disabled ? 0.55 : 1,
        outline: "none",
        boxSizing: "border-box",
        WebkitTapHighlightColor: "transparent",
      } as React.CSSProperties}
    />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: "var(--muted-foreground)",
      padding: "0 4px",
      marginBottom: 8,
    }}>
      {children}
    </p>
  );
}

function RowDivider() {
  return <div style={{ height: 1, backgroundColor: "var(--border)" }} />;
}

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M5 3L9 7L5 11" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"
      style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
    >
      <path d="M3 5L7 9L11 5" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function SaveButton({
  loading,
  onClick,
  label = "Save",
}: {
  loading: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      style={{
        width: "100%",
        padding: "13px 0",
        borderRadius: 12,
        backgroundColor: loading ? "var(--muted)" : "var(--ember, #E8642C)",
        border: "none",
        color: "#fff",
        fontSize: 14,
        fontWeight: 600,
        cursor: loading ? "not-allowed" : "pointer",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
        opacity: loading ? 0.7 : 1,
      } as React.CSSProperties}
    >
      {loading ? "Saving…" : label}
    </button>
  );
}

/* ─── Bottom Sheet ───────────────────────────────────────────────────── */

function BottomSheet({
  title,
  onClose,
  children,
}: {
  title:    string;
  onClose:  () => void;
  children: React.ReactNode;
}) {
  const scrollRef                       = useRef<HTMLDivElement>(null);
  const [canScrollUp,   setCanScrollUp]   = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);

    // Body scroll lock — position:fixed trick required for iOS Safari.
    // Plain overflow:hidden doesn't stop momentum/rubber-band scrolling.
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top      = `-${scrollY}px`;
    document.body.style.width    = "100%";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top      = "";
      document.body.style.width    = "";
      window.scrollTo(0, scrollY);
    };
  }, [onClose]);

  function checkScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 12);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 12);
  }

  useEffect(() => {
    const t = setTimeout(checkScroll, 60);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);

  const caretBase: React.CSSProperties = {
    position:        "absolute",
    left:            "50%",
    transform:       "translateX(-50%)",
    width:           28,
    height:          28,
    borderRadius:    "50%",
    backgroundColor: "rgba(26,18,16,0.88)",
    border:          "1px solid var(--border)",
    display:         "flex",
    alignItems:      "center",
    justifyContent:  "center",
    pointerEvents:   "none",
    backdropFilter:  "blur(6px)",
    zIndex:          10,
    transition:      "opacity 0.25s ease",
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/70 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed z-50 flex flex-col overflow-hidden rounded-2xl animate-fade-in"
        style={{
          top:             "50%",
          left:            "50%",
          transform:       "translate(-50%, -50%)",
          width:           "calc(100% - 32px)",
          maxWidth:        520,
          maxHeight:       "85vh",
          backgroundColor: "var(--card)",
          border:          "1px solid var(--border)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, fontFamily: "var(--font-serif)", color: "var(--foreground)" }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 36, height: 36,
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: "50%",
              backgroundColor: "var(--secondary)",
              border: "none",
              cursor: "pointer",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            } as React.CSSProperties}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2L12 12M12 2L2 12" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body with carets */}
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <div style={{ ...caretBase, top: 8, opacity: canScrollUp ? 1 : 0 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 8L6 4L10 8" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <div
            ref={scrollRef}
            onScroll={checkScroll}
            className="px-5 py-5"
            style={{ height: "100%", overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
          >
            {children}
          </div>

          <div style={{ ...caretBase, bottom: 8, opacity: canScrollDown ? 1 : 0 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 4L6 8L10 4" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Avatar Upload ──────────────────────────────────────────────────── */

interface AvatarProps {
  userId:    string;
  avatarUrl: string | null;
  initials:  string;
  bgColor:   string;
  badge:     string | null;
  tier:      MembershipTier;
  onUpdated: (url: string) => void;
  onToast:   (msg: string) => void;
}

function AvatarUpload({ userId, avatarUrl, initials, bgColor, badge, tier, onUpdated, onToast }: AvatarProps) {
  const router    = useRouter();
  const fileRef   = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pct,       setPct]       = useState(0);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { onToast("Please select an image file."); return; }
    if (file.size > 5 * 1024 * 1024)    { onToast("Image must be under 5 MB."); return; }

    setUploading(true); setPct(20);

    try {
      const body = new FormData();
      body.append("file", file);

      setPct(50);
      const res  = await fetch("/api/avatar", { method: "POST", body });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error ?? "Upload failed.");

      const url = `${json.url}?t=${Date.now()}`;
      onUpdated(url);
      setPct(100);
      onToast("Profile photo updated.");
      // Invalidate the Next.js router cache so navigating away and back
      // shows the new avatar immediately without a hard reload.
      router.refresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false); setPct(0); e.target.value = "";
    }
  }, [onUpdated, onToast, router]);

  const resolvedBadge = resolveBadge(badge, tier);

  return (
    <>
      <AvatarFrame badge={resolvedBadge} size={72}>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="relative rounded-full overflow-hidden group flex-shrink-0"
        style={{ width: 72, height: 72, touchAction: "manipulation", WebkitTapHighlightColor: "transparent" } as React.CSSProperties}
        aria-label="Change profile photo"
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt="Profile photo"
            width={72}
            height={72}
            quality={75}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            backgroundColor: bgColor,
            fontSize: 28, fontWeight: 600,
            fontFamily: "var(--font-serif)",
            color: "var(--foreground)",
            userSelect: "none",
          }}>
            {initials}
          </div>
        )}

        {/* Hover/tap overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 15.5h1.4l8-8L11 6.1l-8 8V15.5zm11.8-9.8a.9.9 0 000-1.4l-1.1-1a.9.9 0 00-1.3 0l-1.1 1.1 2.4 2.4 1.1-1.1z" fill="white"/>
          </svg>
        </div>

        {/* Upload progress */}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.65)" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{pct}%</span>
          </div>
        )}
      </button>
      </AvatarFrame>
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={handleFile} />
    </>
  );
}

/* ─── Profile Card ───────────────────────────────────────────────────── */

interface ProfileCardProps {
  userId:      string;
  initialName: string | null;
  tier:        MembershipTier;
  badge:       string | null;
  memberSince: string | null;
  initials:    string;
  bgColor:     string;
  avatarUrl:   string | null;
  onToast:     (msg: string) => void;
}

function ProfileCard({
  userId, initialName, tier, badge, memberSince,
  initials, bgColor, avatarUrl: initialAvatarUrl, onToast,
}: ProfileCardProps) {
  const [avatarUrl,  setAvatarUrl]  = useState(initialAvatarUrl);
  const [editing,    setEditing]    = useState(false);
  const [nameInput,  setNameInput]  = useState(initialName ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameError,  setNameError]  = useState<string | null>(null);

  const year = memberSince ? new Date(memberSince).getFullYear() : null;

  async function saveDisplayName() {
    const trimmed = nameInput.trim();
    if (!trimmed)          { setNameError("Display name is required."); return; }
    if (trimmed.length < 3)  { setNameError("At least 3 characters."); return; }
    if (trimmed.length > 30) { setNameError("Max 30 characters."); return; }
    if (hasProfanity(trimmed)) { setNameError("Display name contains inappropriate language."); return; }

    setSavingName(true);
    setNameError(null);

    try {
      const supabase = createClient();

      // Uniqueness check
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .ilike("display_name", trimmed)
        .neq("id", userId)
        .limit(1);

      if (existing && existing.length > 0) {
        setNameError("That display name is already taken.");
        setSavingName(false);
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ display_name: trimmed })
        .eq("id", userId);

      if (error) throw error;
      onToast("Display name updated.");
      setEditing(false);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSavingName(false);
    }
  }

  function cancelEdit() {
    setEditing(false);
    setNameInput(initialName ?? "");
    setNameError(null);
  }

  return (
    <div style={{
      borderRadius: 20,
      backgroundColor: "var(--card)",
      border: "1px solid var(--border)",
      padding: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Avatar */}
        <AvatarUpload
          userId={userId}
          avatarUrl={avatarUrl}
          initials={initials}
          bgColor={bgColor}
          badge={badge}
          tier={tier}
          onUpdated={setAvatarUrl}
          onToast={onToast}
        />

        {/* Name + tier */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div>
              <input
                type="text"
                value={nameInput}
                autoFocus
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter")  saveDisplayName();
                  if (e.key === "Escape") cancelEdit();
                }}
                maxLength={30}
                style={{
                  fontSize: 16, width: "100%",
                  backgroundColor: "var(--secondary)",
                  border: "1px solid var(--primary)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  color: "var(--foreground)",
                  outline: "none",
                  boxSizing: "border-box",
                } as React.CSSProperties}
              />
              {nameError && (
                <p style={{ fontSize: 12, color: "#C44536", marginTop: 4 }}>{nameError}</p>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={cancelEdit}
                  style={{
                    flex: 1, fontSize: 13, padding: "8px 0", borderRadius: 8,
                    backgroundColor: "var(--secondary)", border: "1px solid var(--border)",
                    color: "var(--muted-foreground)", cursor: "pointer",
                    touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
                  } as React.CSSProperties}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveDisplayName}
                  disabled={savingName}
                  style={{
                    flex: 1, fontSize: 13, padding: "8px 0", borderRadius: 8,
                    backgroundColor: "var(--ember, #E8642C)", border: "none",
                    color: "#fff", cursor: "pointer",
                    touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
                    opacity: savingName ? 0.7 : 1,
                  } as React.CSSProperties}
                >
                  {savingName ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 18, fontWeight: 600,
                  fontFamily: "var(--font-serif)",
                  color: "var(--foreground)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {nameInput || "Set display name"}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label="Edit display name"
                  style={{
                    flexShrink: 0, width: 28, height: 28,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: 8,
                    backgroundColor: "var(--secondary)",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                    touchAction: "manipulation",
                    WebkitTapHighlightColor: "transparent",
                  } as React.CSSProperties}
                >
                  {/* Pencil icon */}
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M1.5 10h1.2l6.5-6.5-1.2-1.2L1.5 8.8V10zm10.7-8.3a.8.8 0 000-1.2l-1-1a.8.8 0 00-1.2 0L8.8 1l2.2 2.2 1.2-1.5z" fill="var(--muted-foreground)"/>
                  </svg>
                </button>
              </div>
              <p style={{ fontSize: 13, color: tierColor(tier), marginTop: 3 }}>
                {tierLabel(tier)}{year ? ` since ${year}` : ""}
              </p>
            </>
          )}
        </div>
      </div>

      {!editing && (
        <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 12 }}>
          Tap pencil to edit display name
        </p>
      )}
    </div>
  );
}

/* ─── Badge Picker ───────────────────────────────────────────────────── */

interface BadgePickerProps {
  userId:        string;
  tier:          MembershipTier;
  badgeCol:      string | null;
  initials:      string;
  bgColor:       string;
  avatarUrl:     string | null;
  onToast:       (msg: string) => void;
  onBadgeChange: (newBadge: string | null) => void;
}

function BadgePicker({ userId, tier, badgeCol, initials, bgColor, avatarUrl, onToast, onBadgeChange }: BadgePickerProps) {
  const [saving, setSaving] = useState(false);
  const options         = getBadgeOptions(tier, badgeCol);
  // Active = the badge type currently displayed on this user's avatar
  const activeBadgeType = resolveBadge(badgeCol, tier);

  async function select(opt: typeof options[number]) {
    if (opt.locked) return;
    if (opt.type === activeBadgeType) return; // already active
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ badge: opt.storeAs })
        .eq("id", userId);
      if (error) throw error;
      onBadgeChange(opt.storeAs);
      onToast("Badge updated.");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      borderRadius: 20,
      backgroundColor: "var(--card)",
      border: "1px solid var(--border)",
      padding: "16px 20px 20px",
    }}>
      <SectionLabel>Display Badge</SectionLabel>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 16 }}>
        Choose which badge frame appears on your avatar throughout the app.
      </p>
      <div style={{
        display:                 "flex",
        gap:                     12,
        overflowX:               "auto",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth:          "none",
        msOverflowStyle:         "none",
        paddingBottom:           4,
      } as React.CSSProperties}>
        {options.map(opt => {
          const isActive = opt.type === activeBadgeType;
          return (
            <button
              key={opt.type ?? "no-badge"}
              type="button"
              disabled={saving || opt.locked}
              onClick={() => select(opt)}
              style={{
                flexShrink:               0,
                display:                  "flex",
                flexDirection:            "column",
                alignItems:               "center",
                gap:                      8,
                padding:                  "12px 10px 10px",
                borderRadius:             14,
                backgroundColor:          isActive ? "rgba(212,160,74,0.1)" : "transparent",
                border:                   isActive ? "1.5px solid var(--accent, #D4A04A)" : "1.5px solid transparent",
                cursor:                   (saving || opt.locked) ? "default" : "pointer",
                touchAction:              "manipulation",
                WebkitTapHighlightColor:  "transparent",
                opacity:                  opt.locked ? 0.35 : saving ? 0.7 : 1,
                minWidth:                 68,
              } as React.CSSProperties}
            >
              <AvatarFrame badge={opt.type} size={48}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt=""
                      width={48}
                      height={48}
                      quality={70}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{
                      width: "100%", height: "100%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      backgroundColor: bgColor,
                      fontSize: 18, fontWeight: 600,
                      fontFamily: "var(--font-serif)",
                      color: "var(--foreground)",
                      userSelect: "none",
                    }}>
                      {initials}
                    </div>
                  )}
                </div>
              </AvatarFrame>
              <span style={{
                fontSize:   11,
                fontWeight: isActive ? 600 : 500,
                color:      isActive ? "var(--accent, #D4A04A)" : "var(--muted-foreground)",
                textAlign:  "center",
                lineHeight: 1.3,
              }}>
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Personal Info Section ──────────────────────────────────────────── */

type InfoPanel = "name" | "email" | "phone" | "location";

interface PersonalInfoProps {
  userId:  string;
  email:   string;
  profile: ProfileData;
  onToast: (msg: string) => void;
}

function PersonalInfoSection({ userId, email, profile, onToast }: PersonalInfoProps) {
  const [open, setOpen] = useState<InfoPanel | null>(null);

  // Name
  const [firstName,   setFirstName]   = useState(profile.first_name ?? "");
  const [lastName,    setLastName]    = useState(profile.last_name  ?? "");
  const [savingName,  setSavingName]  = useState(false);

  // Email
  const [newEmail,    setNewEmail]    = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  // Phone
  const [phone,       setPhone]       = useState(formatPhone(profile.phone ?? ""));
  const [savingPhone, setSavingPhone] = useState(false);

  // Location
  const [zip,           setZip]         = useState(profile.zip_code ?? "");
  const [city,          setCity]         = useState(profile.city ?? "");
  const [stateAbbr,     setStateAbbr]   = useState(profile.state ?? "");
  const [lookingUpZip,  setLookingUpZip] = useState(false);
  const [savingLoc,     setSavingLoc]   = useState(false);

  function toggle(panel: InfoPanel) {
    setOpen(prev => prev === panel ? null : panel);
  }

  // Auto-populate city/state from zip
  useEffect(() => {
    if (zip.length !== 5 || !/^\d{5}$/.test(zip)) return;
    let cancelled = false;
    setLookingUpZip(true);
    fetch(`https://api.zippopotam.us/us/${zip}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (cancelled) return;
        setCity(data.places?.[0]?.["place name"] ?? "");
        setStateAbbr(data.places?.[0]?.["state abbreviation"] ?? "");
      })
      .catch(() => {
        if (cancelled) return;
        setCity("");
        setStateAbbr("");
      })
      .finally(() => { if (!cancelled) setLookingUpZip(false); });
    return () => { cancelled = true; };
  }, [zip]);

  async function saveName() {
    if (!firstName.trim() || !lastName.trim()) {
      onToast("First and last name are required.");
      return;
    }
    setSavingName(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ first_name: firstName.trim(), last_name: lastName.trim() })
        .eq("id", userId);
      if (error) throw error;
      onToast("Name saved.");
      setOpen(null);
    } catch { onToast("Save failed."); }
    finally { setSavingName(false); }
  }

  async function sendEmailChange() {
    if (!newEmail.trim()) return;
    setSendingEmail(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
      onToast(`Confirmation sent to ${newEmail.trim()}. Check your inbox.`);
      setNewEmail("");
      setOpen(null);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Email change failed.");
    } finally { setSendingEmail(false); }
  }

  async function savePhone() {
    setSavingPhone(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ phone: phone.trim() || null })
        .eq("id", userId);
      if (error) throw error;
      onToast("Phone saved.");
      setOpen(null);
    } catch { onToast("Save failed."); }
    finally { setSavingPhone(false); }
  }

  async function saveLocation() {
    if (!zip.trim()) { onToast("Zip code is required."); return; }
    setSavingLoc(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ zip_code: zip.trim(), city: city.trim() || null, state: stateAbbr.trim() || null })
        .eq("id", userId);
      if (error) throw error;
      onToast("Location saved.");
      setOpen(null);
    } catch { onToast("Save failed."); }
    finally { setSavingLoc(false); }
  }

  const nameSummary = [firstName, lastName].filter(Boolean).join(" ");
  const locSummary  = [city, stateAbbr].filter(Boolean).join(", ");

  const rowBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    cursor: "pointer",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    background: "none",
    border: "none",
    width: "100%",
    textAlign: "left",
    minHeight: 56,
  };

  const panelPad: React.CSSProperties = {
    padding: "0 20px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };

  const miniLabel: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--muted-foreground)",
    marginBottom: 6,
  };

  return (
    <div>
      <SectionLabel>Personal Info</SectionLabel>
      <div style={{
        borderRadius: 20,
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        overflow: "hidden",
      }}>

        {/* Name */}
        <button type="button" onClick={() => toggle("name")} style={rowBase}>
          <div style={{ textAlign: "left" }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>Name</p>
            {nameSummary && (
              <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 1 }}>{nameSummary}</p>
            )}
          </div>
          <ChevronDown open={open === "name"} />
        </button>
        {open === "name" && (
          <div style={panelPad}>
            <FieldInput value={firstName} onChange={setFirstName} placeholder="First name" />
            <FieldInput value={lastName}  onChange={setLastName}  placeholder="Last name" />
            <SaveButton loading={savingName} onClick={saveName} />
          </div>
        )}

        <RowDivider />

        {/* Email */}
        <button type="button" onClick={() => toggle("email")} style={rowBase}>
          <div style={{ textAlign: "left", minWidth: 0, flex: 1, marginRight: 12 }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>Email</p>
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {email}
            </p>
          </div>
          <ChevronDown open={open === "email"} />
        </button>
        {open === "email" && (
          <div style={panelPad}>
            <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              Enter a new address. A confirmation link will be sent to it.
            </p>
            <FieldInput value={newEmail} onChange={setNewEmail} placeholder="New email address" type="email" />
            <SaveButton loading={sendingEmail} onClick={sendEmailChange} label="Send Confirmation" />
          </div>
        )}

        <RowDivider />

        {/* Phone */}
        <button type="button" onClick={() => toggle("phone")} style={rowBase}>
          <div style={{ textAlign: "left" }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>Phone Number</p>
            {phone && (
              <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 1 }}>{phone}</p>
            )}
          </div>
          <ChevronDown open={open === "phone"} />
        </button>
        {open === "phone" && (
          <div style={panelPad}>
            <FieldInput value={phone} onChange={v => setPhone(formatPhone(v))} placeholder="(555) 555-5555" type="tel" />
            <SaveButton loading={savingPhone} onClick={savePhone} />
          </div>
        )}

        <RowDivider />

        {/* Location */}
        <button type="button" onClick={() => toggle("location")} style={rowBase}>
          <div style={{ textAlign: "left" }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>Location</p>
            {locSummary && (
              <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 1 }}>{locSummary}</p>
            )}
          </div>
          <ChevronDown open={open === "location"} />
        </button>
        {open === "location" && (
          <div style={panelPad}>
            <div>
              <p style={miniLabel}>Zip Code *</p>
              <FieldInput
                value={zip}
                onChange={v => setZip(v.replace(/\D/g, "").slice(0, 5))}
                placeholder="84101"
                type="tel"
              />
              {lookingUpZip && (
                <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>Looking up zip…</p>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <p style={miniLabel}>City</p>
                <FieldInput value={city} placeholder="Auto-populated" disabled />
              </div>
              <div>
                <p style={miniLabel}>State</p>
                <FieldInput value={stateAbbr} placeholder="Auto-populated" disabled />
              </div>
            </div>
            <SaveButton loading={savingLoc} onClick={saveLocation} />
          </div>
        )}

      </div>
    </div>
  );
}

/* ─── Account Section ────────────────────────────────────────────────── */

interface AccountSectionProps {
  userId:     string;
  email:      string;
  membership: MembershipData;
  legal:      LegalData;
  onToast:    (msg: string) => void;
}

function AccountSection({ userId, email, membership, legal, onToast }: AccountSectionProps) {
  const [sheet,     setSheet]    = useState<"membership" | "privacy" | null>(null);
  const [pwOpen,    setPwOpen]   = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw,     setNewPw]    = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw,  setSavingPw]  = useState(false);

  /* ── Install affordance ────────────────────────────────────── */
  // Runtime detection (window/navigator only available client-side).
  // Hidden on Android, desktop, and when running standalone.
  const [installState,    setInstallState]    = useState<InstallState | null>(null);
  const [showInstallSheet, setShowInstallSheet] = useState(false);
  const { available: androidPromptAvailable, trigger: triggerAndroidPrompt } =
    useBeforeInstallPrompt();
  useEffect(() => { setInstallState(getInstallState()); }, []);

  async function handlePasswordChange() {
    if (!currentPw) { onToast("Enter your current password."); return; }
    if (newPw.length < 8) { onToast("New password must be at least 8 characters."); return; }
    if (newPw !== confirmPw) { onToast("Passwords don't match."); return; }

    setSavingPw(true);
    try {
      const supabase = createClient();

      // Verify current password
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: currentPw });
      if (authErr) { onToast("Current password is incorrect."); setSavingPw(false); return; }

      // Set new password
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) throw updateErr;

      onToast("Password updated.");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setPwOpen(false);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Password update failed.");
    } finally {
      setSavingPw(false);
    }
  }

  const rowBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    cursor: "pointer",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    background: "none",
    border: "none",
    width: "100%",
    textAlign: "left",
    minHeight: 56,
  };

  const panelPad: React.CSSProperties = {
    padding: "0 20px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };

  return (
    <>
      <div>
        <SectionLabel>Account</SectionLabel>
        <div style={{
          borderRadius: 20,
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}>
          {/* Reset Password */}
          <button type="button" onClick={() => setPwOpen(v => !v)} style={rowBase}>
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>Reset Password</p>
            <ChevronDown open={pwOpen} />
          </button>
          {pwOpen && (
            <div style={panelPad}>
              <FieldInput
                value={currentPw}
                onChange={setCurrentPw}
                placeholder="Current password"
                type="password"
              />
              <FieldInput
                value={newPw}
                onChange={setNewPw}
                placeholder="New password (min 8 characters)"
                type="password"
              />
              <FieldInput
                value={confirmPw}
                onChange={setConfirmPw}
                placeholder="Confirm new password"
                type="password"
              />
              <SaveButton loading={savingPw} onClick={handlePasswordChange} label="Update Password" />
            </div>
          )}

          <RowDivider />

          {/* Membership */}
          <button type="button" onClick={() => setSheet("membership")} style={rowBase}>
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>Membership</p>
            <ChevronRight />
          </button>

          <RowDivider />

          {/* Privacy */}
          <button type="button" onClick={() => setSheet("privacy")} style={rowBase}>
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>Privacy</p>
            <ChevronRight />
          </button>

          {/* Pin to Home Screen — iOS + Android, hidden when standalone or unsupported */}
          {installState?.supported && (
            <>
              <RowDivider />
              <div
                style={{
                  ...rowBase,
                  cursor: "default",
                  alignItems: "center",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>
                    Pin Ash &amp; Ember to your home screen
                  </p>
                  <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
                    Mobile app experience.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInstallSheet(true)}
                  className="rounded-full"
                  style={{
                    flexShrink:              0,
                    marginLeft:              12,
                    padding:                 "8px 16px",
                    background:              "var(--secondary)",
                    color:                   "var(--foreground)",
                    border:                  "1px solid var(--border)",
                    fontSize:                13,
                    fontWeight:              600,
                    minHeight:               36,
                    cursor:                  "pointer",
                    touchAction:             "manipulation",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  Install
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showInstallSheet && installState && (
        <InstallSheet
          platform={installState.platform}
          onClose={() => setShowInstallSheet(false)}
          androidPromptAvailable={androidPromptAvailable}
          onPromptInstall={triggerAndroidPrompt}
        />
      )}

      {sheet === "membership" && (
        <BottomSheet title="Membership" onClose={() => setSheet(null)}>
          <MembershipTab userId={userId} {...membership} />
        </BottomSheet>
      )}

      {sheet === "privacy" && (
        <BottomSheet title="Privacy & Legal" onClose={() => setSheet(null)}>
          <LegalTab termsContent={legal.termsContent} eulaContent={legal.eulaContent} />
        </BottomSheet>
      )}
    </>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────── */

export function AccountClient({ userId, email, profile, membership, legal, memberSince, badge }: Props) {
  const router = useRouter();
  const [toast,         setToast]       = useState<string | null>(null);
  const [signingOut,    setSigningOut]  = useState(false);
  const [currentBadge,  setCurrentBadge] = useState<string | null>(badge);

  const initials = getInitials(profile.display_name, email);
  const bgColor  = hashColor(profile.display_name ?? email);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--background)" }}>

      {/* Fixed header */}
      <div
        className="sticky top-0 z-30"
        style={{
          backgroundColor: "rgba(26,18,16,0.97)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
          minHeight: 56,
          display: "flex",
          alignItems: "center",
        }}
      >
        <div style={{ width: "100%", maxWidth: 640, margin: "0 auto", padding: "0 20px" }}>
          <h1 style={{
            fontSize: 18,
            fontWeight: 700,
            fontFamily: "var(--font-serif)",
            color: "var(--foreground)",
          }}>
            Account
          </h1>
        </div>
      </div>

      {/* Scroll carets — mobile only */}
      <ScrollCarets />

      {/* Page body */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 100px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          <ProfileCard
            userId={userId}
            initialName={profile.display_name}
            tier={membership.currentTier}
            badge={currentBadge}
            memberSince={memberSince}
            initials={initials}
            bgColor={bgColor}
            avatarUrl={profile.avatar_url}
            onToast={setToast}
          />

          <BadgePicker
            userId={userId}
            tier={membership.currentTier}
            badgeCol={currentBadge}
            initials={initials}
            bgColor={bgColor}
            avatarUrl={profile.avatar_url}
            onToast={setToast}
            onBadgeChange={setCurrentBadge}
          />

          <PersonalInfoSection
            userId={userId}
            email={email}
            profile={profile}
            onToast={setToast}
          />

          <AccountSection
            userId={userId}
            email={email}
            membership={membership}
            legal={legal}
            onToast={setToast}
          />

          {/* Sign Out */}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            style={{
              width: "100%",
              padding: "15px 0",
              borderRadius: 16,
              backgroundColor: "transparent",
              border: "1px solid rgba(196,69,54,0.4)",
              color: "#C44536",
              fontSize: 15,
              fontWeight: 600,
              cursor: signingOut ? "not-allowed" : "pointer",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              opacity: signingOut ? 0.6 : 1,
            } as React.CSSProperties}
          >
            {signingOut ? "Signing out…" : "Sign Out"}
          </button>

        </div>
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
