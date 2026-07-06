"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal }                 from "react-dom";
import { createClient }                 from "@/utils/supabase/client";

/* ------------------------------------------------------------------ */

export interface RulesPost {
  id:      string;
  title:   string;
  content: string;
}

/* ---- Flame icon --------------------------------------------------- */

function FlameIcon({ size = 16, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"} stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
    </svg>
  );
}

/* ---- Rules modal -------------------------------------------------- */

export function RulesModal({
  rulesPost, userId, initialLiked, initialCount, onClose, onAgreed,
}: {
  rulesPost: RulesPost; userId: string; initialLiked: boolean;
  initialCount: number; onClose: () => void; onAgreed?: () => void;
}) {
  const [mounted,    setMounted]    = useState(false);
  const [liked,      setLiked]      = useState(initialLiked);
  const [liking,     setLiking]     = useState(false);
  const [localCount, setLocalCount] = useState(initialCount);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    setMounted(true);
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top      = `-${scrollY}px`;
    document.body.style.width    = "100%";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.position = "";
      document.body.style.top      = "";
      document.body.style.width    = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleAgree() {
    if (liking || liked) return;
    setLiking(true);
    setLiked(true);
    setLocalCount(c => c + 1);
    const { error } = await supabase.from("forum_post_likes").insert({ user_id: userId, post_id: rulesPost.id });
    if (error && error.code !== "23505") {
      setLiked(false);
      setLocalCount(c => c - 1);
    } else {
      onAgreed?.();
    }
    setLiking(false);
  }

  if (!mounted) return null;

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9998, backgroundColor: "rgba(0,0,0,0.72)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        zIndex: 9999, width: "calc(100% - 32px)", maxWidth: 420,
        maxHeight: "calc(100dvh - 80px)", backgroundColor: "var(--card)",
        borderRadius: 16, border: "1px solid var(--border)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div className="flex items-center justify-between px-5"
          style={{ paddingTop: 18, paddingBottom: 14, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <h2 className="font-serif font-bold text-base" style={{ color: "var(--gold, #D4A04A)" }}>Lounge Rules</h2>
          <button type="button" onClick={onClose}
            className="flex items-center justify-center rounded-full"
            style={{ width: 36, height: 36, background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)", color: "var(--foreground)", cursor: "pointer", touchAction: "manipulation", WebkitTapHighlightColor: "transparent", flexShrink: 0 }}
            aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5" style={{ flex: 1, overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {rulesPost.content.replace(/\r\n/g, "\n").split("\n").map((line, i) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={i} style={{ height: 8 }} />;
              const isTitle = /^\d+[.)]\s/.test(trimmed);
              return (
                <p key={i} style={{
                  fontSize: isTitle ? 14 : 13, fontWeight: isTitle ? 700 : 400,
                  fontFamily: isTitle ? "var(--font-serif)" : undefined,
                  color: isTitle ? "var(--gold, #D4A04A)" : "var(--foreground)",
                  opacity: isTitle ? 1 : 0.85, lineHeight: 1.55,
                  marginTop: isTitle && i > 0 ? 10 : 0,
                }}>{trimmed}</p>
              );
            })}
          </div>
        </div>
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          {liked ? (
            <div className="flex items-center gap-2" style={{ color: "var(--gold, #D4A04A)" }}>
              <FlameIcon size={14} filled />
              <span className="text-xs font-semibold">{localCount.toLocaleString()} members agreed</span>
            </div>
          ) : (
            <>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Agree to the house code to participate.</p>
              <button type="button" onClick={handleAgree} disabled={liking}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{ background: "transparent", border: "1.5px solid var(--border)", color: "var(--muted-foreground)", cursor: liking ? "default" : "pointer", touchAction: "manipulation", WebkitTapHighlightColor: "transparent", flexShrink: 0 }}>
                <FlameIcon size={13} />I Agree
              </button>
            </>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
