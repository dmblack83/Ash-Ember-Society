"use client";

import { useState, useEffect }  from "react";
import { createPortal }         from "react-dom";
import { createClient }         from "@/utils/supabase/client";
import { CategoryCard }         from "./CategoryCard";
import { NewPostSheet }         from "./NewPostSheet";

/* ------------------------------------------------------------------ */

interface Category {
  id:          string;
  name:        string;
  slug:        string;
  description: string;
  sort_order:  number;
  is_gate:     boolean;
  is_locked:   boolean;
  post_count:  number;
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
  userId:         string;
  displayName:    string;
  membershipTier: string;
}

/* ------------------------------------------------------------------ */

function RulesModal({
  rulesPost,
  onClose,
}: {
  rulesPost: RulesPost;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:        "fixed",
          inset:           0,
          zIndex:          9998,
          backgroundColor: "rgba(0,0,0,0.7)",
        }}
      />

      {/* Sheet — 85dvh, fits viewport, scrollable */}
      <div
        style={{
          position:        "fixed",
          bottom:          0,
          left:            0,
          right:           0,
          zIndex:          9999,
          backgroundColor: "var(--card)",
          borderRadius:    "16px 16px 0 0",
          paddingBottom:   "env(safe-area-inset-bottom)",
          maxHeight:       "85dvh",
          display:         "flex",
          flexDirection:   "column",
        }}
      >
        {/* Header — fixed inside sheet */}
        <div
          className="flex items-center justify-between px-5"
          style={{
            paddingTop:    20,
            paddingBottom: 16,
            borderBottom:  "1px solid var(--border)",
            flexShrink:    0,
          }}
        >
          <h2
            className="font-serif font-semibold text-lg"
            style={{ color: "var(--foreground)" }}
          >
            {rulesPost.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded-full"
            style={{
              width:                   40,
              height:                  40,
              background:              "rgba(255,255,255,0.08)",
              border:                  "1px solid var(--border)",
              color:                   "var(--foreground)",
              cursor:                  "pointer",
              touchAction:             "manipulation",
              WebkitTapHighlightColor: "transparent",
              flexShrink:              0,
            }}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div
          className="overflow-y-auto px-5 py-5"
          style={{ flex: 1 }}
        >
          <p
            className="text-sm leading-relaxed"
            style={{
              color:      "var(--foreground)",
              whiteSpace: "pre-line",
              opacity:    0.9,
            }}
          >
            {rulesPost.content}
          </p>
        </div>
      </div>
    </>,
    document.body
  );
}

/* ------------------------------------------------------------------ */

export function LoungeForumClient({
  categories,
  rulesPost,
  hasUnlocked,
  userId,
  displayName,
  membershipTier,
}: Props) {
  const [unlocked,        setUnlocked]        = useState(hasUnlocked);
  const [liking,          setLiking]          = useState(false);
  const [likeError,       setLikeError]       = useState<string | null>(null);
  const [showNewPost,     setShowNewPost]      = useState(false);
  const [newPostCategory, setNewPostCategory]  = useState<string>("");
  const [showRules,       setShowRules]        = useState(false);
  const [toast,           setToast]            = useState<string | null>(null);

  const supabase = createClient();
  const canPost  = membershipTier !== "free";

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function handleNewPost(categoryId: string) {
    if (!canPost) {
      showToast("Upgrade to Member to post in the Lounge.");
      return;
    }
    setNewPostCategory(categoryId);
    setShowNewPost(true);
  }

  async function handleUnlock() {
    if (!rulesPost || liking) return;
    setLiking(true);
    setLikeError(null);
    const { error } = await supabase
      .from("forum_post_likes")
      .insert({ user_id: userId, post_id: rulesPost.id });
    setLiking(false);
    if (error && error.code !== "23505") {
      setLikeError("Something went wrong. Please try again.");
      return;
    }
    setUnlocked(true);
  }

  /* ---- Locked view ------------------------------------------------ */

  if (!unlocked || !rulesPost) {
    return (
      <div
        className="flex flex-col"
        style={{
          minHeight:       "100dvh",
          backgroundColor: "var(--background)",
          paddingBottom:   "calc(72px + env(safe-area-inset-bottom))",
        }}
      >
        {/* Fixed header */}
        <div
          style={{
            position:        "sticky",
            top:             0,
            zIndex:          40,
            backgroundColor: "rgba(26,18,16,0.97)",
            backdropFilter:  "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderBottom:    "1px solid var(--border)",
          }}
        >
          <div className="flex items-center justify-center px-4 py-4">
            <h1 className="font-serif text-xl font-semibold" style={{ color: "var(--foreground)" }}>
              The Lounge
            </h1>
          </div>
        </div>

        {/* Centered entry card */}
        <div className="flex flex-col items-center text-center px-6 pt-10 pb-6">
          <div
            className="flex items-center justify-center rounded-full mb-4"
            style={{
              width:      64,
              height:     64,
              background: "linear-gradient(135deg, rgba(212,160,74,0.2), rgba(193,120,23,0.2))",
              border:     "1.5px solid var(--gold, #D4A04A)",
            }}
          >
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
              <path d="M15 3C8.373 3 3 8.373 3 15s5.373 12 12 12 12-5.373 12-12S21.627 3 15 3z" stroke="var(--gold, #D4A04A)" strokeWidth="1.5" />
              <path d="M15 10v5l3 3" stroke="var(--gold, #D4A04A)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2
            className="font-serif text-2xl font-semibold mb-2"
            style={{ color: "var(--foreground)" }}
          >
            The Lounge
          </h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)", maxWidth: 280 }}>
            A private sanctuary for aficionados. Read the house code, then like to take your seat.
          </p>
        </div>

        {/* Rules preview card */}
        <div
          className="mx-4 rounded-xl p-4 mb-6"
          style={{
            backgroundColor: "var(--card)",
            border:          "1px solid var(--border)",
          }}
        >
          <p
            className="text-sm leading-relaxed"
            style={{
              color:      "var(--foreground)",
              whiteSpace: "pre-line",
              opacity:    0.9,
            }}
          >
            {rulesPost?.content ?? ""}
          </p>
        </div>

        {/* CTA */}
        <div className="px-6">
          {likeError && (
            <p className="text-xs text-center mb-3" style={{ color: "#E8642C" }}>
              {likeError}
            </p>
          )}
          <button
            onClick={handleUnlock}
            disabled={liking}
            className="w-full rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
            style={{
              height:                  52,
              background:              liking
                ? "rgba(212,160,74,0.3)"
                : "linear-gradient(135deg, #D4A04A, #C17817)",
              color:                   "#1A1210",
              border:                  "none",
              cursor:                  liking ? "default" : "pointer",
              touchAction:             "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {liking ? (
              <span
                className="inline-block rounded-full border-2 border-current border-t-transparent animate-spin"
                style={{ width: 16, height: 16 }}
              />
            ) : (
              "I Agree — Like to Enter"
            )}
          </button>
        </div>
      </div>
    );
  }

  /* ---- Unlocked view ---------------------------------------------- */

  const gateCategory     = categories.find((c) => c.is_gate);
  const nonGateCategories = categories.filter((c) => !c.is_gate);

  return (
    <div
      className="flex flex-col"
      style={{
        minHeight:       "100dvh",
        backgroundColor: "var(--background)",
        paddingBottom:   "calc(72px + env(safe-area-inset-bottom))",
      }}
    >
      {/* Toast */}
      {toast && (
        <div
          className="fixed left-4 right-4 z-50 rounded-xl px-4 py-3 text-sm text-center font-medium pointer-events-none"
          style={{
            bottom:     "calc(80px + env(safe-area-inset-bottom))",
            background: "rgba(212,160,74,0.15)",
            border:     "1px solid var(--gold, #D4A04A)",
            color:      "var(--foreground)",
          }}
        >
          {toast}
        </div>
      )}

      {/* Fixed header */}
      <div
        style={{
          position:            "sticky",
          top:                 0,
          zIndex:              40,
          backgroundColor:     "rgba(26,18,16,0.97)",
          backdropFilter:      "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom:        "1px solid var(--border)",
        }}
      >
        <div className="flex items-center px-4 py-4">
          <h1 className="font-serif text-xl font-semibold flex-1" style={{ color: "var(--foreground)" }}>
            The Lounge
          </h1>
        </div>
      </div>

      {/* Lounge Rules — simple tappable row (no expansion, opens modal) */}
      {gateCategory && rulesPost && (
        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={() => setShowRules(true)}
            className="w-full rounded-xl px-4 py-4 text-left"
            style={{
              backgroundColor:         "var(--card)",
              border:                  "1px solid var(--border)",
              cursor:                  "pointer",
              touchAction:             "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
                    {gateCategory.name}
                  </p>
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
                    style={{
                      border: "1px solid rgba(212,160,74,0.4)",
                      color:  "rgba(212,160,74,0.7)",
                    }}
                  >
                    Pinned
                  </span>
                </div>
                <p
                  className="text-xs mt-1"
                  style={{ color: "var(--muted-foreground)", lineHeight: 1.5 }}
                >
                  {gateCategory.description}
                </p>
              </div>
              {/* Tap hint */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                style={{ color: "var(--muted-foreground)", flexShrink: 0, marginTop: 2 }}
              >
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </button>
        </div>
      )}

      {/* Categories label */}
      <div className="px-4 pt-5 pb-3">
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--muted-foreground)" }}
        >
          Categories
        </p>
      </div>

      {/* Category cards */}
      <div className="px-4 flex flex-col gap-2 pb-4">
        {nonGateCategories.map((c) => (
          <CategoryCard
            key={c.id}
            category={c}
            userId={userId}
            canPost={canPost}
            onNewPost={handleNewPost}
          />
        ))}
      </div>

      {/* Rules modal */}
      {showRules && rulesPost && (
        <RulesModal rulesPost={rulesPost} onClose={() => setShowRules(false)} />
      )}

      {/* New post sheet */}
      {showNewPost && (
        <NewPostSheet
          categories={nonGateCategories}
          initialCategoryId={newPostCategory}
          userId={userId}
          onClose={() => setShowNewPost(false)}
          onCreated={() => {
            setShowNewPost(false);
            showToast("Post created.");
          }}
        />
      )}
    </div>
  );
}
