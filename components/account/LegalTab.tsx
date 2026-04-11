"use client";

import { useState } from "react";

/* ------------------------------------------------------------------
   Simple markdown renderer — handles #/## headings and paragraphs.
   Sufficient for the legal placeholder content.
   ------------------------------------------------------------------ */

function MarkdownBlock({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/);
  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={i} className="text-base font-semibold text-foreground mt-6"
              style={{ fontFamily: "var(--font-serif)" }}>
              {trimmed.slice(3)}
            </h2>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h1 key={i} className="text-xl font-bold text-foreground"
              style={{ fontFamily: "var(--font-serif)" }}>
              {trimmed.slice(2)}
            </h1>
          );
        }
        return (
          <p key={i} className="text-sm text-muted-foreground leading-relaxed">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------
   Full-screen modal
   ------------------------------------------------------------------ */

interface ModalProps {
  title:   string;
  content: string;
  onClose: () => void;
}

function LegalModal({ title, content, onClose }: ModalProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/70 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 top-12 z-50 flex flex-col animate-slide-up sm:inset-x-auto sm:left-1/2 sm:top-16 sm:bottom-8 sm:-translate-x-1/2 sm:w-full sm:max-w-lg sm:rounded-2xl overflow-hidden"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full flex items-center justify-center transition-opacity active:opacity-60"
            style={{
              width: 36,
              height: 36,
              backgroundColor: "var(--secondary)",
              border: "none",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 2L12 12M12 2L2 12" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <MarkdownBlock content={content} />
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------
   Tappable row
   ------------------------------------------------------------------ */

function LegalRow({ label, onTap }: { label: string; onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full flex items-center justify-between px-4 py-4 transition-colors active:opacity-70"
      style={{
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
        background: "none",
        border: "none",
        cursor: "pointer",
        minHeight: 56,
      }}
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M5 3L9 7L5 11" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

interface Props {
  termsContent: string;
  eulaContent:  string;
}

export function LegalTab({ termsContent, eulaContent }: Props) {
  const [open, setOpen] = useState<"terms" | "eula" | null>(null);

  return (
    <div className="animate-fade-in pb-10">
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        <LegalRow
          label="Terms of Service"
          onTap={() => setOpen("terms")}
        />
        <div style={{ height: 1, backgroundColor: "var(--border)" }} />
        <LegalRow
          label="End User License Agreement"
          onTap={() => setOpen("eula")}
        />
      </div>

      {open === "terms" && (
        <LegalModal title="Terms of Service" content={termsContent} onClose={() => setOpen(null)} />
      )}
      {open === "eula" && (
        <LegalModal title="End User License Agreement" content={eulaContent} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
