"use client";

import { useState, useEffect }  from "react";
import { createPortal }         from "react-dom";
import { createClient }         from "@/utils/supabase/client";

/* ------------------------------------------------------------------ */

interface Category {
  id:        string;
  name:      string;
  is_locked: boolean;
}

interface Props {
  categories:        Category[];
  userId:            string;
  initialCategoryId?: string;
  onCreated:         (categoryId: string) => void;
  onClose:           () => void;
}

/* ------------------------------------------------------------------ */

export function NewPostSheet({ categories, userId, initialCategoryId, onCreated, onClose }: Props) {
  const [mounted,     setMounted]     = useState(false);
  const [categoryId,  setCategoryId]  = useState(
    initialCategoryId ?? categories.find((c) => !c.is_locked)?.id ?? ""
  );
  const [title,       setTitle]       = useState("");
  const [content,     setContent]     = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const supabase = createClient();

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

  async function handleSubmit() {
    if (!categoryId || !title.trim() || !content.trim()) return;
    setSubmitting(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("forum_posts")
      .insert({ user_id: userId, category_id: categoryId, title: title.trim(), content: content.trim() })
      .select("id, category_id")
      .single();

    setSubmitting(false);
    if (err || !data) {
      setError(err?.message ?? "Something went wrong.");
      return;
    }
    onCreated(data.category_id);
  }

  const canSubmit = categoryId.length > 0 && title.trim().length > 0 && content.trim().length > 0;

  const sheet = (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:        "fixed",
          inset:           0,
          zIndex:          9998,
          backgroundColor: "rgba(0,0,0,0.6)",
        }}
      />

      {/* Sheet */}
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
          maxHeight:       "90dvh",
          overflowY:       "auto",
        }}
      >
        {/* Drag handle */}
        <div className="flex items-center justify-between px-4" style={{ paddingTop: 20, paddingBottom: 12 }}>
          <div
            className="mx-auto rounded-full"
            style={{ width: 36, height: 4, backgroundColor: "rgba(255,255,255,0.2)", position: "absolute", left: "50%", transform: "translateX(-50%)", top: 10 }}
          />
          <h2 className="font-serif font-semibold text-base" style={{ color: "var(--foreground)" }}>
            New Post
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
            }}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-4 pb-6 flex flex-col gap-4">
          {/* Category */}
          <div>
            <label
              className="text-xs font-semibold uppercase tracking-wide block mb-1.5"
              style={{ color: "var(--muted-foreground)" }}
            >
              Category
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-xl px-4 text-sm"
              style={{
                height:          48,
                backgroundColor: "rgba(255,255,255,0.05)",
                border:          "1px solid var(--border)",
                color:           "var(--foreground)",
                fontSize:        16,
                outline:         "none",
              }}
            >
              {categories
                .filter((c) => !c.is_locked)
                .map((c) => (
                  <option key={c.id} value={c.id} style={{ backgroundColor: "#241C17" }}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label
              className="text-xs font-semibold uppercase tracking-wide block mb-1.5"
              style={{ color: "var(--muted-foreground)" }}
            >
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Give your post a title..."
              className="w-full rounded-xl px-4 text-sm"
              style={{
                height:          48,
                backgroundColor: "rgba(255,255,255,0.05)",
                border:          "1px solid var(--border)",
                color:           "var(--foreground)",
                fontSize:        16,
                outline:         "none",
              }}
            />
            <p
              className="text-xs text-right mt-1"
              style={{ color: "var(--muted-foreground)" }}
            >
              {title.length}/200
            </p>
          </div>

          {/* Content */}
          <div>
            <label
              className="text-xs font-semibold uppercase tracking-wide block mb-1.5"
              style={{ color: "var(--muted-foreground)" }}
            >
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={2000}
              placeholder="Share your thoughts..."
              className="w-full rounded-xl px-4 py-3 text-sm resize-none"
              style={{
                minHeight:       140,
                backgroundColor: "rgba(255,255,255,0.05)",
                border:          "1px solid var(--border)",
                color:           "var(--foreground)",
                fontSize:        16,
                outline:         "none",
              }}
            />
            <p
              className="text-xs text-right mt-1"
              style={{ color: "var(--muted-foreground)" }}
            >
              {content.length}/2000
            </p>
          </div>

          {error && (
            <p className="text-xs text-center" style={{ color: "#E8642C" }}>
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
            style={{
              height:     52,
              background: canSubmit && !submitting
                ? "linear-gradient(135deg, #D4A04A, #C17817)"
                : "rgba(212,160,74,0.3)",
              color:      "#1A1210",
              border:     "none",
              cursor:     canSubmit && !submitting ? "pointer" : "default",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {submitting ? (
              <span
                className="inline-block rounded-full border-2 border-current border-t-transparent animate-spin"
                style={{ width: 16, height: 16 }}
              />
            ) : (
              "Post to Lounge"
            )}
          </button>
        </div>
      </div>
    </>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
