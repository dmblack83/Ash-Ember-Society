"use client";

import Link from "next/link";
import { useEffect } from "react";

interface UpgradeLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Soft-nudge modal shown when a free-tier user tries to add a distinct
 * cigar beyond the free cap. Primary CTA → Membership tab.
 * Secondary CTA "Manage humidor" just closes the modal (returns user
 * to prior context — no forced redirect).
 */
export function UpgradeLimitModal({ isOpen, onClose }: UpgradeLimitModalProps) {
  // Escape-key dismiss + body scroll lock while open.
  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);

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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-limit-title"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 pb-8"
        style={{
          backgroundColor: "var(--card)",
          border:          "1px solid var(--border)",
          paddingBottom:   "calc(2rem + env(safe-area-inset-bottom))",
        }}
      >
        {/* Close X */}
        <div className="flex justify-end -mt-2 -mr-2 mb-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-full"
            style={{ color: "var(--muted-foreground)" }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4 4 L14 14 M14 4 L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <h2
          id="upgrade-limit-title"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize:   22,
            color:      "var(--foreground)",
            marginBottom: 12,
          }}
        >
          You&apos;ve reached your 20-cigar limit
        </h2>

        <p
          style={{
            fontSize:   15,
            lineHeight: 1.5,
            color:      "var(--muted-foreground)",
            marginBottom: 24,
          }}
        >
          Free members can track up to 20 unique cigars. Upgrade to Member for unlimited cigars.
        </p>

        <Link
          href="/account?tab=membership"
          onClick={onClose}
          className="btn btn-primary block w-full text-center"
          style={{ marginBottom: 12 }}
        >
          Upgrade to Member
        </Link>

        <button
          type="button"
          onClick={onClose}
          className="block w-full text-center py-3"
          style={{
            color:    "var(--muted-foreground)",
            fontSize: 14,
            background: "transparent",
            border: "none",
          }}
        >
          Manage humidor
        </button>
      </div>
    </div>
  );
}
