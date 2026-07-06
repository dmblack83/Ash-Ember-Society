"use client";

import { useState, useMemo }             from "react";
import { useRouter }                    from "next/navigation";
import dynamic                          from "next/dynamic";
import { createClient }                 from "@/utils/supabase/client";
import { RulesModal }                   from "./RulesModal";

/* NewPostSheet (456 lines) only mounts when the user taps "+ New Post". */
const NewPostSheet = dynamic(
  () => import("./NewPostSheet").then((m) => ({ default: m.NewPostSheet })),
  { ssr: false },
);
import { Toast }                        from "@/components/ui/toast";
import { ScrollCarets }                 from "@/components/ui/ScrollCarets";
import { RefreshButton }                from "@/components/ui/RefreshButton";

/* ------------------------------------------------------------------ */

interface Category {
  id:           string;
  name:         string;
  slug:         string;
  description:  string | null;
  sort_order:   number;
  is_gate:      boolean;
  is_locked:    boolean;
  is_feedback:  boolean;
  post_count:   number;
  today_count:  number;
  last_post_at: string | null;
}

interface RulesPost {
  id:      string;
  title:   string;
  content: string;
}

interface Props {
  categories:     Category[];
  rulesPost:      RulesPost | null;
  hasUnlocked:    boolean;
  agreementCount: number;
  userId:         string;
  displayName:    string;
}

const HEADER_H = 56;

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

/* ------------------------------------------------------------------ */

export function LoungeForumClient({
  categories, rulesPost, hasUnlocked, agreementCount,
  userId, displayName,
}: Props) {
  const [unlocked,        setUnlocked]       = useState(hasUnlocked);
  const [liking,          setLiking]         = useState(false);
  const [likeError,       setLikeError]      = useState<string | null>(null);
  const [showNewPost,     setShowNewPost]     = useState(false);
  const [newPostCategory, setNewPostCategory] = useState<string>("");
  const [showRules,       setShowRules]       = useState(false);
  const [toast,           setToast]           = useState<string | null>(null);

  const router   = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const nonGateCategories  = categories.filter((c) => !c.is_gate && !c.is_feedback);
  const feedbackCategories = categories.filter((c) => c.is_feedback);
  const gateCategory       = categories.find((c) => c.is_gate);

  function showToast(msg: string) {
    setToast(null);
    requestAnimationFrame(() => setToast(msg));
  }

  function handleNewPost(categoryId?: string) {
    setNewPostCategory(categoryId ?? nonGateCategories[0]?.id ?? "");
    setShowNewPost(true);
  }

  async function handleUnlock() {
    if (!rulesPost || liking) return;
    setLiking(true);
    setLikeError(null);
    const { error } = await supabase.from("forum_post_likes").insert({ user_id: userId, post_id: rulesPost.id });
    setLiking(false);
    if (error && error.code !== "23505") { setLikeError("Something went wrong. Please try again."); return; }
    setUnlocked(true);
  }

  /* ---- Locked view ------------------------------------------------ */

  if (!unlocked || !rulesPost) {
    return (
      <div style={{ minHeight: "100dvh", backgroundColor: "var(--background)" }}>
        <div style={{
          position: "fixed", top: 0, left: "var(--app-content-left)", right: 0, zIndex: 40, height: HEADER_H,
          backgroundColor: "rgba(26,18,16,0.97)", backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <h1 className="font-serif text-xl font-semibold" style={{ color: "var(--foreground)" }}>The Lounge</h1>
        </div>
        <div className="flex flex-col items-center text-center px-6"
          style={{ paddingTop: HEADER_H + 32, paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}>
          <div className="flex items-center justify-center rounded-full mb-4"
            style={{ width: 64, height: 64, background: "linear-gradient(135deg, rgba(212,160,74,0.2), rgba(193,120,23,0.2))", border: "1.5px solid var(--gold, #D4A04A)" }}>
            <FlameIcon size={28} filled />
          </div>
          <h2 className="font-serif text-2xl font-semibold mb-2" style={{ color: "var(--foreground)" }}>The Lounge</h2>
          <p className="text-sm mb-8" style={{ color: "var(--muted-foreground)", maxWidth: 280 }}>
            A private sanctuary for aficionados. Read the house code, then agree to take your seat.
          </p>
          <div className="w-full rounded-xl p-4 mb-6 text-left" style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}>
            <h3 className="font-serif font-semibold text-sm mb-3" style={{ color: "var(--gold, #D4A04A)" }}>
              {rulesPost?.title ?? "The Code of the Lounge"}
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)", whiteSpace: "pre-line", opacity: 0.9 }}>
              {rulesPost?.content ?? ""}
            </p>
          </div>
          {likeError && <p className="text-xs text-center mb-3" style={{ color: "#E8642C" }}>{likeError}</p>}
          <button onClick={handleUnlock} disabled={liking}
            className="w-full rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
            style={{
              height: 52,
              background: liking ? "rgba(212,160,74,0.3)" : "linear-gradient(135deg, #D4A04A, #C17817)",
              color: "#1A1210", border: "none", cursor: liking ? "default" : "pointer",
              touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
            }}>
            {liking
              ? <span className="inline-block rounded-full border-2 border-current border-t-transparent animate-spin" style={{ width: 16, height: 16 }} />
              : <><FlameIcon size={16} filled /> I Agree — Like to Enter</>}
          </button>
        </div>
      </div>
    );
  }

  /* ---- Unlocked view ---------------------------------------------- */

  return (
    <div style={{ minHeight: "100dvh", backgroundColor: "var(--background)", paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      <ScrollCarets />

      {/* Fixed header */}
      <div style={{
        position: "fixed", top: 0, left: "var(--app-content-left)", right: 0, zIndex: 40, height: HEADER_H,
        backgroundColor: "rgba(26,18,16,0.97)", backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center",
      }}>
        <div className="flex items-center w-full px-4 md:max-w-[50%] md:mx-auto">
          <h1 className="font-serif text-xl font-semibold flex-1" style={{ color: "var(--foreground)" }}>
            The Lounge
          </h1>
          {/* No global "+ New Post" — composing is scoped to a category.
              Each category's feed surfaces its own +New Post (or, for the
              Burn Reports category, a redirect to /humidor). */}
          <RefreshButton
            style={{
              background:              "none",
              border:                  "none",
              color:                   "var(--gold,#D4A04A)",
              padding:                 8,
              borderRadius:            999,
              cursor:                  "pointer",
              touchAction:             "manipulation",
              WebkitTapHighlightColor: "transparent",
              display:                 "flex",
              alignItems:              "center",
              justifyContent:          "center",
              flexShrink:              0,
            }}
            className=""
            ariaLabel="Refresh lounge"
          />
        </div>
      </div>

      {/* Content */}
      <div style={{ paddingTop: HEADER_H }}>

        {/* Rules row */}
        {gateCategory && rulesPost && (
          <div className="px-4 pt-4 w-full md:max-w-[50%] md:mx-auto">
            <button type="button" onClick={() => setShowRules(true)} className="w-full text-left"
              style={{
                display: "block", padding: 1, borderRadius: 14,
                background: "linear-gradient(135deg, rgba(212,160,74,0.9) 0%, rgba(212,160,74,0.25) 50%, rgba(212,160,74,0.9) 100%)",
                cursor: "pointer", touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
              }}>
              <div style={{ backgroundColor: "var(--card)", borderRadius: 13, padding: "14px 16px" }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--gold, #D4A04A)", fontFamily: "var(--font-serif)" }}>Lounge Rules</p>
                <p style={{ fontSize: 12, marginTop: 4, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                  Before you take your seat at the table, we ask that you respect the house rules.
                </p>
              </div>
            </button>
          </div>
        )}

        {/* Categories label */}
        <div className="px-4 pt-5 pb-3 w-full md:max-w-[50%] md:mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
            Categories
          </p>
        </div>

        {/* Category cards */}
        <div className="px-4 flex flex-col gap-2 pb-4 w-full md:max-w-[50%] md:mx-auto">
          {nonGateCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => router.push(`/lounge/rooms/${c.slug}`)}
              className="w-full text-left"
              style={{
                display:                 "block",
                background:              "var(--card)",
                border:                  "1px solid var(--border)",
                borderRadius:            14,
                padding:                 "16px",
                cursor:                  "pointer",
                touchAction:             "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--foreground)", fontFamily: "var(--font-serif)" }}>
                    {c.name}
                  </p>
                  {c.description && (
                    <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                      {c.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {c.post_count.toLocaleString()} {c.post_count === 1 ? "post" : "posts"}
                    </span>
                    {c.today_count > 0 && (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: "rgba(232,100,44,0.15)", color: "var(--ember, #E8642C)" }}>
                        {c.today_count} new today
                      </span>
                    )}
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ color: "var(--muted-foreground)", flexShrink: 0, marginTop: 2 }}>
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>
          ))}
        </div>

        {/* Feedback section */}
        {feedbackCategories.length > 0 && (
          <>
            <div className="px-4 w-full md:max-w-[50%] md:mx-auto">
              <div style={{ height: 1, backgroundColor: "var(--border)", margin: "4px 0 20px" }} />
            </div>
            <div className="px-4 pb-3 w-full md:max-w-[50%] md:mx-auto">
              <div className="flex items-center gap-2 mb-1">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ color: "var(--ember, #E8642C)", flexShrink: 0 }}>
                  <path d="M7 1.5l1.3 2.6 2.9.42-2.1 2.05.5 2.88L7 8.1l-2.6 1.35.5-2.88L2.8 4.52l2.9-.42L7 1.5z" fill="currentColor" />
                </svg>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--ember, #E8642C)" }}>Product Feedback</p>
              </div>
              <p className="text-xs" style={{ color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                Vote on ideas and report issues. Your input shapes what we build.
              </p>
            </div>
            <div className="px-4 flex flex-col gap-2 pb-6 w-full md:max-w-[50%] md:mx-auto">
              {feedbackCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => router.push(`/lounge/rooms/${c.slug}`)}
                  className="w-full text-left"
                  style={{
                    display: "block", background: "var(--card)", border: "1px solid var(--border)",
                    borderRadius: 14, padding: "16px", cursor: "pointer",
                    touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--foreground)", fontFamily: "var(--font-serif)" }}>
                        {c.name}
                      </p>
                      {c.description && (
                        <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>{c.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          {c.post_count.toLocaleString()} {c.post_count === 1 ? "post" : "posts"}
                        </span>
                        {c.today_count > 0 && (
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ background: "rgba(232,100,44,0.15)", color: "var(--ember, #E8642C)" }}>
                            {c.today_count} new today
                          </span>
                        )}
                      </div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ color: "var(--muted-foreground)", flexShrink: 0, marginTop: 2 }}>
                      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Rules modal */}
      {showRules && rulesPost && (
        <RulesModal
          rulesPost={rulesPost}
          userId={userId}
          initialLiked={unlocked}
          initialCount={agreementCount}
          onClose={() => setShowRules(false)}
        />
      )}

      {/* New post sheet — the picker is gone now, so we hand the
          sheet only the single selected category. NewPostSheet hides
          its category dropdown when the list has just one entry. */}
      {showNewPost && (() => {
        const selected = nonGateCategories.find((c) => c.id === newPostCategory);
        if (!selected) return null;
        return (
          <NewPostSheet
            categories={[selected]}
            initialCategoryId={newPostCategory}
            isFeedback={feedbackCategories.some((c) => c.id === newPostCategory)}
            userId={userId}
            onClose={() => setShowNewPost(false)}
            onCreated={() => {
              setShowNewPost(false);
              showToast("Post created.");
              router.refresh();
            }}
          />
        );
      })()}
    </div>
  );
}
