"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/utils/supabase/client";
import { Vol01Content } from "@/components/field-guide/content/Vol01Content";
import { Vol02Content } from "@/components/field-guide/content/Vol02Content";
import { Vol03Content } from "@/components/field-guide/content/Vol03Content";
import { Vol04Content } from "@/components/field-guide/content/Vol04Content";
import { FieldGuideComments } from "@/components/field-guide/FieldGuideComments";

const S = {
  serif: "'Playfair Display', Georgia, serif",
  sans:  "Inter, system-ui, sans-serif",
  gold:  "var(--gold)",
  ember: "var(--ember)",
  fg1:   "var(--foreground)",
  fg2:   "var(--muted-foreground)",
  fg3:   "rgba(166,144,128,0.75)",
} as const;

const VOLS = [
  { num: "01", kicker: "The Origin", title: "A Brief History of the Cigar",  goldWord: "History",     deck: "Five centuries of cultivation, colonialism, and craft, told through the leaf, the lector, and the long road from Guanahani to your humidor.", readTime: "8 min read"  },
  { num: "02", kicker: "The Leaf",   title: "The Tobaccos & Their Lands",     goldWord: "Their Lands", deck: "From the volcanic soil of Nicaragua to the shade-grown fields of Connecticut, the leaf is the cigar. An atlas of what grows where, and why it matters.", readTime: "11 min read" },
  { num: "03", kicker: "The Vitola", title: "Shapes, Sizes & The Vitolas",    goldWord: "The Vitolas", deck: "A primer on ring gauge, length, and the named formats that every serious smoker eventually learns to order by heart.", readTime: "9 min read"  },
  { num: "04", kicker: "The Cut",    title: "The Three Cuts",                 goldWord: "Cuts",        deck: "A study of the only three openings worth making at the head of a fine cigar, and what each one does to the smoke that follows.", readTime: "4 min read"  },
] as const;

const CONTENTS = [Vol01Content, Vol02Content, Vol03Content, Vol04Content];

/* ------------------------------------------------------------------
   Caret — matches AddCigarSheet.tsx exactly
   ------------------------------------------------------------------ */

function Caret({ dir }: { dir: "up" | "down" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"
      style={{ color: "var(--muted-foreground)", opacity: 0.65 }}>
      {dir === "up"
        ? <path d="M4.5 11.5L9 7L13.5 11.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M4.5 6.5L9 11L13.5 6.5"  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/* ------------------------------------------------------------------
   FlameIcon — matches LoungeForumClient / PostDetailClient exactly
   ------------------------------------------------------------------ */

function FlameIcon({ size = 19, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
    </svg>
  );
}

/* ------------------------------------------------------------------
   ChatIcon
   ------------------------------------------------------------------ */

function ChatIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/* ------------------------------------------------------------------
   TitleNode
   ------------------------------------------------------------------ */

function TitleNode({ title, goldWord }: { title: string; goldWord: string }) {
  const idx = title.indexOf(goldWord);
  if (idx === -1) return <>{title}</>;
  return (
    <>
      {title.slice(0, idx)}
      <em style={{ fontStyle: "italic", color: S.gold, fontWeight: 400 }}>{goldWord}</em>
      {title.slice(idx + goldWord.length)}
    </>
  );
}

/* ------------------------------------------------------------------
   FieldGuideModal
   ------------------------------------------------------------------ */

export function FieldGuideModal({ volNumber, onClose }: { volNumber: number; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);

  const scrollRef = useRef<HTMLDivElement>(null);

  const [showTopCaret,    setShowTopCaret]    = useState(false);
  const [showBottomCaret, setShowBottomCaret] = useState(true);

  const [userId,       setUserId]       = useState<string | null>(null);
  const [liked,        setLiked]        = useState(false);
  const [likeCount,    setLikeCount]    = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [liking,       setLiking]       = useState(false);

  /* Lock body scroll */
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  /* Fetch user, like status, and counts on open */
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserId(user?.id ?? null);

      const [likeRowResult, likeCountResult, commentCountResult] = await Promise.all([
        user
          ? supabase.from("field_guide_likes").select("user_id").eq("vol_number", volNumber).eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("field_guide_likes").select("*", { count: "exact", head: true }).eq("vol_number", volNumber),
        supabase.from("field_guide_comments").select("*", { count: "exact", head: true }).eq("vol_number", volNumber).is("parent_comment_id", null),
      ]);

      if (!cancelled) {
        setLiked(!!likeRowResult.data);
        setLikeCount((likeCountResult as { count: number | null }).count ?? 0);
        setCommentCount((commentCountResult as { count: number | null }).count ?? 0);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [supabase, volNumber]);

  /* Like toggle — optimistic, matches PostModal.tsx */
  async function handleLike() {
    if (liking || !userId) return;
    setLiking(true);
    if (liked) {
      setLiked(false);
      setLikeCount((n) => Math.max(0, n - 1));
      await supabase.from("field_guide_likes").delete().eq("vol_number", volNumber).eq("user_id", userId);
    } else {
      setLiked(true);
      setLikeCount((n) => n + 1);
      await supabase.from("field_guide_likes").upsert({ vol_number: volNumber, user_id: userId }, { onConflict: "vol_number,user_id", ignoreDuplicates: true });
    }
    setLiking(false);
  }

  /* Caret update — matches AddCigarSheet.tsx */
  function updateCarets() {
    const el = scrollRef.current;
    if (!el) return;
    setShowTopCaret(el.scrollTop > 4);
    setShowBottomCaret(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }

  /* Scroll to comments section */
  function scrollToComments() {
    const el = scrollRef.current;
    if (!el) return;
    const target = el.querySelector("#fg-comments") as HTMLElement | null;
    if (!target) return;
    el.scrollBy({ top: target.getBoundingClientRect().top - el.getBoundingClientRect().top - 16, behavior: "smooth" });
  }

  const vol     = VOLS[volNumber - 1];
  const Content = CONTENTS[volNumber - 1];

  const modal = (
    <>
      <style>{`
        @keyframes fg-slide-up {
          from { transform: translateY(6%); opacity: 0; }
          to   { transform: translateY(0);  opacity: 1; }
        }
        .fg-modal-enter { animation: fg-slide-up 0.28s cubic-bezier(0.32, 0, 0.28, 1) both; }
      `}</style>

      <div className="fg-modal-enter" style={{ position: "fixed", inset: 0, zIndex: 200, background: "var(--background)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, borderBottom: "1px solid rgba(212,160,74,0.15)", background: "var(--background)", paddingTop: "env(safe-area-inset-top)" }}>
          {/* Inner wrapper aligns with content max-width */}
          <div style={{ maxWidth: "42rem", margin: "0 auto", width: "100%", paddingLeft: 16, paddingRight: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", height: 52 }}>

              {/* Left — back */}
              <button
                onClick={onClose}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: "8px 0", cursor: "pointer", fontFamily: S.serif, fontStyle: "italic", fontSize: 15, color: S.gold, outline: "none", justifySelf: "start" }}
              >
                &#8592; Back
              </button>

              {/* Center — volume label */}
              <span style={{ fontFamily: S.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.3em", textTransform: "uppercase", color: S.fg3, justifySelf: "center" }}>
                VOL. {vol.num}
              </span>

              {/* Right — flame + count, chat + count */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, justifySelf: "end" }}>
                <button
                  onClick={handleLike}
                  aria-label={liked ? "Unlike" : "Like"}
                  style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 4, cursor: userId ? "pointer" : "default", color: liked ? S.gold : S.fg3, outline: "none", lineHeight: 0, transition: "color 0.15s ease" }}
                >
                  <FlameIcon size={19} filled={liked} />
                  {likeCount > 0 && (
                    <span style={{ fontFamily: S.sans, fontSize: 11, fontWeight: 600, lineHeight: 1 }}>
                      {likeCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={scrollToComments}
                  aria-label="Jump to comments"
                  style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 4, cursor: "pointer", color: S.fg3, outline: "none", lineHeight: 0 }}
                >
                  <ChatIcon />
                  {commentCount > 0 && (
                    <span style={{ fontFamily: S.sans, fontSize: 11, fontWeight: 600, lineHeight: 1 }}>
                      {commentCount}
                    </span>
                  )}
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* ── Scroll area ────────────────────────────────────────── */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

          <div
            ref={scrollRef}
            onScroll={updateCarets}
            style={{ position: "absolute", inset: 0, overflowY: "auto", overflowX: "hidden" }}
          >
            <div style={{ maxWidth: "42rem", margin: "0 auto", width: "100%" }}>

              {/* Masthead */}
              <div style={{ padding: "36px 16px 28px", borderBottom: "1px solid rgba(212,160,74,0.12)" }}>
                <div style={{ fontFamily: S.sans, fontSize: 10, fontWeight: 600, letterSpacing: "0.32em", textTransform: "uppercase", color: S.ember, marginBottom: 10 }}>
                  {vol.kicker}
                </div>
                <h1 style={{ fontFamily: S.serif, fontSize: 34, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.015em", margin: "0 0 14px", color: S.fg1 }}>
                  <TitleNode title={vol.title} goldWord={vol.goldWord} />
                </h1>
                <p style={{ fontFamily: S.serif, fontStyle: "italic", fontSize: 15, lineHeight: 1.65, color: S.fg2, margin: "0 0 18px" }}>
                  {vol.deck}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: S.sans, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: S.fg3 }}>
                  <span>Ash &amp; Ember Society</span>
                  <span style={{ color: S.ember }}>·</span>
                  <span>Field Guide</span>
                  <span style={{ color: S.ember }}>·</span>
                  <span>{vol.readTime}</span>
                </div>
              </div>

              {/* Article body */}
              <div style={{ padding: "32px 16px 0" }}>
                <Content />
              </div>

              {/* Comments — inline at article bottom */}
              <div style={{ padding: "0 16px", paddingBottom: "max(80px, calc(env(safe-area-inset-bottom) + 60px))" }}>
                <FieldGuideComments volNumber={volNumber} />
              </div>

            </div>
          </div>

          {/* Top caret */}
          {showTopCaret && (
            <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 44, background: "linear-gradient(to bottom, var(--background) 30%, transparent)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 8, pointerEvents: "none" }}>
              <Caret dir="up" />
            </div>
          )}

          {/* Bottom caret */}
          {showBottomCaret && (
            <div aria-hidden="true" style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 44, background: "linear-gradient(to top, var(--background) 30%, transparent)", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 8, pointerEvents: "none" }}>
              <Caret dir="down" />
            </div>
          )}

        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}
