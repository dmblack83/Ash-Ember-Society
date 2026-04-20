"use client";

import { useState }      from "react";
import { createClient }  from "@/utils/supabase/client";
import { CategoryCard }  from "./CategoryCard";
import { NewPostSheet }  from "./NewPostSheet";

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
  categories:    Category[];
  rulesPost:     RulesPost | null;
  hasUnlocked:   boolean;
  userId:        string;
  displayName:   string;
  membershipTier: string;
}

/* ------------------------------------------------------------------ */

function initials(name: string | null | undefined): string {
  if (!name) return "A";
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
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
  const [unlocked,     setUnlocked]     = useState(hasUnlocked);
  const [liking,       setLiking]       = useState(false);
  const [likeError,    setLikeError]    = useState<string | null>(null);
  const [showNewPost,  setShowNewPost]  = useState(false);
  const [toast,        setToast]        = useState<string | null>(null);

  const supabase = createClient();

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
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
          minHeight: "100dvh",
          backgroundColor: "var(--background)",
          paddingBottom: "calc(72px + env(safe-area-inset-bottom))",
        }}
      >
        {/* Header */}
        <div
          className="flex flex-col items-center text-center px-6 pt-10 pb-6"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          {/* Crest icon */}
          <div
            className="flex items-center justify-center rounded-full mb-4"
            style={{
              width: 64,
              height: 64,
              background: "linear-gradient(135deg, rgba(212,160,74,0.2), rgba(193,120,23,0.2))",
              border: "1.5px solid var(--gold, #D4A04A)",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path
                d="M16 4C9.373 4 4 9.373 4 16s5.373 12 12 12 12-5.373 12-12S22.627 4 16 4z"
                stroke="var(--gold, #D4A04A)"
                strokeWidth="1.5"
              />
              <path
                d="M10 16c0-3.314 2.686-6 6-6s6 2.686 6 6-2.686 6-6 6-6-2.686-6-6z"
                fill="rgba(212,160,74,0.15)"
                stroke="var(--gold, #D4A04A)"
                strokeWidth="1"
              />
              <path
                d="M16 13v6M13 16h6"
                stroke="var(--gold, #D4A04A)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <h1
            className="font-serif text-2xl font-semibold mb-2"
            style={{ color: "var(--foreground)" }}
          >
            The Lounge
          </h1>
          <p className="text-sm" style={{ color: "var(--muted-foreground)", maxWidth: 280 }}>
            A private sanctuary for aficionados. Read the house code, then like to take your seat.
          </p>
        </div>

        {/* Rules content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <h2
            className="font-serif text-lg font-semibold mb-4"
            style={{ color: "var(--gold, #D4A04A)" }}
          >
            {rulesPost?.title ?? "The Code of the Lounge"}
          </h2>
          <p
            className="text-sm leading-relaxed"
            style={{
              color:         "var(--foreground)",
              whiteSpace:    "pre-line",
              opacity:       0.9,
            }}
          >
            {rulesPost?.content ?? ""}
          </p>
        </div>

        {/* Sticky footer */}
        <div
          className="px-6 py-4"
          style={{ borderTop: "1px solid var(--border)" }}
        >
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
              height:     52,
              background: liking
                ? "rgba(212,160,74,0.3)"
                : "linear-gradient(135deg, #D4A04A, #C17817)",
              color:      "#1A1210",
              border:     "none",
              cursor:     liking ? "default" : "pointer",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {liking ? (
              <>
                <span
                  className="inline-block rounded-full border-2 border-current border-t-transparent animate-spin"
                  style={{ width: 16, height: 16 }}
                />
                Entering...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM2.5 5a5.5 5.5 0 1110.536 2.21l1.882 1.882a.75.75 0 01-1.06 1.06L12 8.295V14a.75.75 0 01-1.5 0v-2h-5v2a.75.75 0 01-1.5 0V8.295l-1.858 1.857a.75.75 0 11-1.06-1.06L2.883 7.21A5.482 5.482 0 012.5 5z" />
                </svg>
                I Agree — Like to Enter
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  /* ---- Unlocked view ---------------------------------------------- */

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
          className="fixed left-4 right-4 z-50 rounded-xl px-4 py-3 text-sm text-center font-medium"
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

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <h1 className="font-serif text-xl font-semibold" style={{ color: "var(--foreground)" }}>
          The Lounge
        </h1>
        <button
          onClick={() => {
            if (membershipTier === "free") {
              showToast("Upgrade to Member to post in the Lounge.");
            } else {
              setShowNewPost(true);
            }
          }}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
          style={{
            border:  "1.5px solid var(--gold, #D4A04A)",
            color:   "var(--gold, #D4A04A)",
            background: "transparent",
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
            cursor: "pointer",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <path d="M6 1a.75.75 0 01.75.75V5.25h3.5a.75.75 0 010 1.5h-3.5v3.5a.75.75 0 01-1.5 0v-3.5H1.75a.75.75 0 010-1.5h3.5V1.75A.75.75 0 016 1z" />
          </svg>
          New Post
        </button>
      </div>

      {/* Lounge Rules category (always first) */}
      {categories
        .filter((c) => c.is_gate)
        .map((c) => (
          <CategoryCard key={c.id} category={c} userId={userId} />
        ))}

      {/* Divider */}
      <div className="px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
          Categories
        </p>
      </div>

      {/* Non-gate categories */}
      <div className="px-4 flex flex-col gap-2 pb-4">
        {nonGateCategories.map((c) => (
          <CategoryCard key={c.id} category={c} userId={userId} />
        ))}
      </div>

      {showNewPost && (
        <NewPostSheet
          categories={nonGateCategories}
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
