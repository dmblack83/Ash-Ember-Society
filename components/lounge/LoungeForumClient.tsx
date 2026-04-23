"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal }                               from "react-dom";
import { useRouter }                                  from "next/navigation";
import { createClient }                               from "@/utils/supabase/client";
import { CategoryCard }                               from "./CategoryCard";
import { NewPostSheet }                               from "./NewPostSheet";
import { PostModal }                                  from "./PostModal";

/* ------------------------------------------------------------------ */

interface Category {
  id:           string;
  name:         string;
  slug:         string;
  description:  string;
  sort_order:   number;
  is_gate:      boolean;
  is_locked:    boolean;
  post_count:   number;
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
  membershipTier: string;
}

const HEADER_H = 56;

/* ---- Flame icon --------------------------------------------------- */

function FlameIcon({ size = 16, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
    </svg>
  );
}

/* ---- Rules modal -------------------------------------------------- */

function RulesModal({
  rulesPost,
  userId,
  initialLiked,
  initialCount,
  onClose,
}: {
  rulesPost:    RulesPost;
  userId:       string;
  initialLiked: boolean;
  initialCount: number;
  onClose:      () => void;
}) {
  const [mounted,     setMounted]    = useState(false);
  const [liked,       setLiked]      = useState(initialLiked);
  const [liking,      setLiking]     = useState(false);
  const [localCount,  setLocalCount] = useState(initialCount);

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
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // One-way: agreement is permanent, no toggle
  async function handleAgree() {
    if (liking || liked) return;
    setLiking(true);
    setLiked(true);
    setLocalCount(c => c + 1);
    const { error } = await supabase
      .from("forum_post_likes")
      .insert({ user_id: userId, post_id: rulesPost.id });
    if (error && error.code !== "23505") {
      setLiked(false);
      setLocalCount(c => c - 1);
    }
    setLiking(false);
  }

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
          backgroundColor: "rgba(0,0,0,0.72)",
        }}
      />

      {/* Centered dialog */}
      <div
        style={{
          position:        "fixed",
          top:             "50%",
          left:            "50%",
          transform:       "translate(-50%, -50%)",
          zIndex:          9999,
          width:           "calc(100% - 32px)",
          maxWidth:        420,
          maxHeight:       "calc(100dvh - 80px)",
          backgroundColor: "var(--card)",
          borderRadius:    16,
          border:          "1px solid var(--border)",
          display:         "flex",
          flexDirection:   "column",
          overflow:        "hidden",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5"
          style={{
            paddingTop:    18,
            paddingBottom: 14,
            borderBottom:  "1px solid var(--border)",
            flexShrink:    0,
          }}
        >
          <h2 className="font-serif font-bold text-base" style={{ color: "var(--gold, #D4A04A)" }}>
            Lounge Rules
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded-full"
            style={{
              width:                   36,
              height:                  36,
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
        <div className="overflow-y-auto px-5 py-5" style={{ flex: 1, overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {rulesPost.content
              .replace(/\r\n/g, "\n")
              .split("\n")
              .map((line, i) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={i} style={{ height: 8 }} />;
                const isTitle = /^\d+[.)]\s/.test(trimmed);
                return (
                  <p
                    key={i}
                    style={{
                      fontSize:   isTitle ? 14 : 13,
                      fontWeight: isTitle ? 700 : 400,
                      fontFamily: isTitle ? "var(--font-serif)" : undefined,
                      color:      isTitle ? "var(--gold, #D4A04A)" : "var(--foreground)",
                      opacity:    isTitle ? 1 : 0.85,
                      lineHeight: 1.55,
                      marginTop:  isTitle && i > 0 ? 10 : 0,
                    }}
                  >
                    {trimmed}
                  </p>
                );
              })}
          </div>
        </div>

        {/* Agreement footer */}
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--border)", flexShrink: 0 }}
        >
          {liked ? (
            <div className="flex items-center gap-2" style={{ color: "var(--gold, #D4A04A)" }}>
              <FlameIcon size={14} filled />
              <span className="text-xs font-semibold">
                {localCount.toLocaleString()} members agreed
              </span>
            </div>
          ) : (
            <>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                Agree to the house code to participate.
              </p>
              <button
                type="button"
                onClick={handleAgree}
                disabled={liking}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{
                  background:              "transparent",
                  border:                  "1.5px solid var(--border)",
                  color:                   "var(--muted-foreground)",
                  cursor:                  liking ? "default" : "pointer",
                  touchAction:             "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  flexShrink:              0,
                }}
              >
                <FlameIcon size={13} />
                I Agree
              </button>
            </>
          )}
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
  agreementCount,
  userId,
  displayName,
  membershipTier,
}: Props) {
  const [unlocked,        setUnlocked]       = useState(hasUnlocked);
  const [liking,          setLiking]         = useState(false);
  const [likeError,       setLikeError]      = useState<string | null>(null);
  const [showNewPost,     setShowNewPost]     = useState(false);
  const [newPostCategory, setNewPostCategory] = useState<string>("");
  const [showRules,       setShowRules]       = useState(false);
  const [toast,           setToast]           = useState<string | null>(null);
  const [selectedPostId,  setSelectedPostId]  = useState<string | null>(null);
  const [refreshKey,      setRefreshKey]      = useState(0);
  const [postRefreshKeys, setPostRefreshKeys] = useState<Record<string, number>>({});
  const [refreshing,      setRefreshing]      = useState(false);

  const router   = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    router.refresh();
    setRefreshKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 800);
  }, [refreshing, router]);
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
      <div style={{ minHeight: "100dvh", backgroundColor: "var(--background)" }}>
        {/* Fixed header */}
        <div
          style={{
            position:            "fixed",
            top:                 0,
            left:                0,
            right:               0,
            zIndex:              40,
            height:              HEADER_H,
            backgroundColor:     "rgba(26,18,16,0.97)",
            backdropFilter:      "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderBottom:        "1px solid var(--border)",
            display:             "flex",
            alignItems:          "center",
            justifyContent:      "center",
          }}
        >
          <h1 className="font-serif text-xl font-semibold" style={{ color: "var(--foreground)" }}>
            The Lounge
          </h1>
        </div>

        <div
          className="flex flex-col items-center text-center px-6"
          style={{ paddingTop: HEADER_H + 32, paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}
        >
          <div
            className="flex items-center justify-center rounded-full mb-4"
            style={{
              width:      64,
              height:     64,
              background: "linear-gradient(135deg, rgba(212,160,74,0.2), rgba(193,120,23,0.2))",
              border:     "1.5px solid var(--gold, #D4A04A)",
            }}
          >
            <FlameIcon size={28} filled />
          </div>
          <h2 className="font-serif text-2xl font-semibold mb-2" style={{ color: "var(--foreground)" }}>
            The Lounge
          </h2>
          <p className="text-sm mb-8" style={{ color: "var(--muted-foreground)", maxWidth: 280 }}>
            A private sanctuary for aficionados. Read the house code, then agree to take your seat.
          </p>

          <div
            className="w-full rounded-xl p-4 mb-6 text-left"
            style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
          >
            <h3
              className="font-serif font-semibold text-sm mb-3"
              style={{ color: "var(--gold, #D4A04A)" }}
            >
              {rulesPost?.title ?? "The Code of the Lounge"}
            </h3>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--foreground)", whiteSpace: "pre-line", opacity: 0.9 }}
            >
              {rulesPost?.content ?? ""}
            </p>
          </div>

          {likeError && (
            <p className="text-xs text-center mb-3" style={{ color: "#E8642C" }}>{likeError}</p>
          )}
          <button
            onClick={handleUnlock}
            disabled={liking}
            className="w-full rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
            style={{
              height:                  52,
              background:              liking ? "rgba(212,160,74,0.3)" : "linear-gradient(135deg, #D4A04A, #C17817)",
              color:                   "#1A1210",
              border:                  "none",
              cursor:                  liking ? "default" : "pointer",
              touchAction:             "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {liking ? (
              <span className="inline-block rounded-full border-2 border-current border-t-transparent animate-spin" style={{ width: 16, height: 16 }} />
            ) : (
              <>
                <FlameIcon size={16} filled />
                I Agree — Like to Enter
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  /* ---- Unlocked view ---------------------------------------------- */

  const gateCategory      = categories.find((c) => c.is_gate);
  const nonGateCategories = categories.filter((c) => !c.is_gate);

  return (
    <div style={{ minHeight: "100dvh", backgroundColor: "var(--background)", paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}>
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
          position:            "fixed",
          top:                 0,
          left:                0,
          right:               0,
          zIndex:              40,
          height:              HEADER_H,
          backgroundColor:     "rgba(26,18,16,0.97)",
          backdropFilter:      "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom:        "1px solid var(--border)",
          display:             "flex",
          alignItems:          "center",
          paddingLeft:         16,
          paddingRight:        16,
        }}
      >
        <h1 className="font-serif text-xl font-semibold flex-1" style={{ color: "var(--foreground)" }}>
          The Lounge
        </h1>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Refresh"
          className="md:hidden flex items-center justify-center rounded-full"
          style={{
            width:                   36,
            height:                  36,
            background:              "transparent",
            border:                  "1px solid var(--border)",
            color:                   "var(--muted-foreground)",
            cursor:                  refreshing ? "default" : "pointer",
            touchAction:             "manipulation",
            WebkitTapHighlightColor: "transparent",
            flexShrink:              0,
          }}
        >
          <svg
            width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"
            style={{
              transition: "transform 0.6s ease",
              transform:  refreshing ? "rotate(360deg)" : "rotate(0deg)",
            }}
          >
            <path
              d="M7.5 1.5A6 6 0 1 1 2.636 4M7.5 1.5V4.5M7.5 1.5H4.5"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Content offset */}
      <div style={{ paddingTop: HEADER_H }}>
        {/* Lounge Rules row */}
        {gateCategory && rulesPost && (
          <div className="px-4 pt-4 w-full md:max-w-[50%] md:mx-auto">
            {/* Gradient border wrapper */}
            <button
              type="button"
              onClick={() => setShowRules(true)}
              className="w-full text-left"
              style={{
                display:                 "block",
                padding:                 1,
                borderRadius:            14,
                background:              "linear-gradient(135deg, rgba(212,160,74,0.9) 0%, rgba(212,160,74,0.25) 50%, rgba(212,160,74,0.9) 100%)",
                cursor:                  "pointer",
                touchAction:             "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <div
                style={{
                  backgroundColor: "var(--card)",
                  borderRadius:    13,
                  padding:         "14px 16px",
                }}
              >
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--gold, #D4A04A)", fontFamily: "var(--font-serif)" }}>
                  Lounge Rules
                </p>
                <p style={{ fontSize: 12, marginTop: 4, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                  Before you take your seat at the table, we ask that you respect the house rules.
                </p>
              </div>
            </button>
          </div>
        )}

        <div className="px-4 pt-5 pb-3 w-full md:max-w-[50%] md:mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
            Categories
          </p>
        </div>

        <div className="px-4 flex flex-col gap-2 pb-4 w-full md:max-w-[50%] md:mx-auto">
          {nonGateCategories.map((c) => (
            <CategoryCard
              key={c.id}
              category={c}
              userId={userId}
              canPost={canPost}
              refreshKey={refreshKey}
              postRefreshKey={postRefreshKeys[c.id] ?? 0}
              onNewPost={handleNewPost}
              onPostClick={(postId) => setSelectedPostId(postId)}
            />
          ))}
        </div>
      </div>

      {selectedPostId && (
        <PostModal
          postId={selectedPostId}
          userId={userId}
          onClose={() => setSelectedPostId(null)}
        />
      )}

      {showRules && rulesPost && (
        <RulesModal
          rulesPost={rulesPost}
          userId={userId}
          initialLiked={unlocked}
          initialCount={agreementCount}
          onClose={() => setShowRules(false)}
        />
      )}

      {showNewPost && (
        <NewPostSheet
          categories={nonGateCategories}
          initialCategoryId={newPostCategory}
          userId={userId}
          onClose={() => setShowNewPost(false)}
          onCreated={(categoryId) => {
            setShowNewPost(false);
            showToast("Post created.");
            setPostRefreshKeys((prev) => ({ ...prev, [categoryId]: (prev[categoryId] ?? 0) + 1 }));
          }}
        />
      )}
    </div>
  );
}
