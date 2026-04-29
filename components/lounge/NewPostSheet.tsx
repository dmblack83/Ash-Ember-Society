"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal }                          from "react-dom";
import { createClient }                          from "@/utils/supabase/client";

/* ------------------------------------------------------------------ */

interface Category {
  id:        string;
  name:      string;
  is_locked: boolean;
}

interface Props {
  categories:         Category[];
  userId:             string;
  initialCategoryId?: string;
  isFeedback?:        boolean;
  onCreated:          (categoryId: string) => void;
  onClose:            () => void;
}

const FEEDBACK_TYPES = ["Feature Request", "Bug Report", "Improvement", "Other"] as const;
type FeedbackType = typeof FEEDBACK_TYPES[number];

/* ------------------------------------------------------------------ */

export function NewPostSheet({ categories, userId, initialCategoryId, isFeedback, onCreated, onClose }: Props) {
  const [mounted,        setMounted]        = useState(false);
  const [categoryId,     setCategoryId]     = useState(
    initialCategoryId ?? categories.find((c) => !c.is_locked)?.id ?? ""
  );
  const [feedbackType,   setFeedbackType]   = useState<FeedbackType>("Feature Request");
  const [title,          setTitle]          = useState("");
  const [content,        setContent]        = useState("");
  const [imageFile,      setImageFile]      = useState<File | null>(null);
  const [imagePreview,   setImagePreview]   = useState<string | null>(null);
  const [uploading,      setUploading]      = useState(false);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supabase = useMemo(() => createClient(), []);

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function removeImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

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

  async function handleSubmit() {
    const targetCategoryId = isFeedback ? (initialCategoryId ?? "") : categoryId;
    if (!targetCategoryId || !title.trim() || !content.trim()) return;
    setSubmitting(true);
    setError(null);

    // Upload image if selected (standard posts only)
    let image_url: string | null = null;
    if (!isFeedback && imageFile) {
      setUploading(true);
      const fd = new FormData();
      fd.append("file",   imageFile);
      fd.append("folder", "forum-posts");
      const res = await fetch("/api/upload/image", { method: "POST", body: fd });
      if (res.ok) {
        const { url } = await res.json();
        image_url = url;
      } else {
        const { error } = await res.json().catch(() => ({ error: "Upload failed." }));
        setError(error ?? "Upload failed.");
        setUploading(false);
        setSubmitting(false);
        return;
      }
      setUploading(false);
    }

    const finalTitle = isFeedback ? `${feedbackType}: ${title.trim()}` : title.trim();

    const payload: Record<string, unknown> = {
      user_id:     userId,
      category_id: targetCategoryId,
      title:       finalTitle,
      content:     content.trim(),
    };
    if (image_url) payload.image_url = image_url;

    const { data, error: err } = await supabase
      .from("forum_posts")
      .insert(payload)
      .select("id, category_id")
      .single();

    setSubmitting(false);
    if (err || !data) {
      setError(err?.message ?? "Something went wrong.");
      return;
    }
    onCreated(data.category_id);
  }

  const canSubmit = title.trim().length > 0 && content.trim().length > 0 &&
    (isFeedback ? !!(initialCategoryId) : categoryId.length > 0);

  const modalTitle    = isFeedback ? "Share an Idea" : "New Post";
  const titleLabel    = isFeedback ? "Title" : "Title";
  const titlePh       = isFeedback ? "Summarize your idea or issue..." : "Give your post a title...";
  const contentLabel  = isFeedback ? "Details" : "Content";
  const contentPh     = isFeedback ? "Describe your idea in detail. The more context, the better." : "Share your thoughts...";
  const submitLabel   = isFeedback ? "Submit Idea" : uploading ? "Uploading photo..." : "Post to Lounge";
  const submitBg      = isFeedback
    ? (canSubmit && !submitting ? "#E8642C" : "rgba(232,100,44,0.3)")
    : (canSubmit && !submitting ? "linear-gradient(135deg, #D4A04A, #C17817)" : "rgba(212,160,74,0.3)");

  const modal = (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:        "fixed",
          inset:           0,
          zIndex:          9998,
          backgroundColor: "rgba(0,0,0,0.65)",
        }}
      />

      {/* Centered modal */}
      <div
        style={{
          position:        "fixed",
          top:             "50%",
          left:            "50%",
          transform:       "translate(-50%, -50%)",
          zIndex:          9999,
          width:           "calc(100% - 32px)",
          maxWidth:        560,
          maxHeight:       "90dvh",
          backgroundColor: "var(--card)",
          borderRadius:    16,
          border:          "1px solid var(--border)",
          display:         "flex",
          flexDirection:   "column",
          overflow:        "hidden",
        }}
      >
        {/* Header — fixed, not scrollable */}
        <div
          className="flex items-center justify-between px-5"
          style={{
            paddingTop:    18,
            paddingBottom: 14,
            borderBottom:  "1px solid var(--border)",
            flexShrink:    0,
          }}
        >
          <h2
            className="font-serif font-bold text-base"
            style={{ color: isFeedback ? "var(--ember, #E8642C)" : "var(--foreground)" }}
          >
            {modalTitle}
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

        {/* Scrollable form body */}
        <div
          className="overflow-y-auto"
          style={{
            flex:                    1,
            overscrollBehavior:      "contain",
            WebkitOverflowScrolling: "touch",
          } as React.CSSProperties}
        >
          <div className="px-5 py-5 flex flex-col gap-4">

            {/* Type chips — feedback only */}
            {isFeedback && (
              <div>
                <label
                  className="text-xs font-semibold uppercase tracking-wide block mb-2"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Type
                </label>
                <div className="flex flex-wrap gap-2">
                  {FEEDBACK_TYPES.map((t) => {
                    const active = feedbackType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setFeedbackType(t)}
                        className="rounded-full text-xs font-semibold px-3 py-1.5"
                        style={{
                          background:              active ? "rgba(232,100,44,0.15)" : "rgba(255,255,255,0.05)",
                          border:                  active ? "1.5px solid var(--ember, #E8642C)" : "1.5px solid var(--border)",
                          color:                   active ? "var(--ember, #E8642C)" : "var(--muted-foreground)",
                          cursor:                  "pointer",
                          touchAction:             "manipulation",
                          WebkitTapHighlightColor: "transparent",
                          transition:              "background 0.15s, border-color 0.15s, color 0.15s",
                        }}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Category selector — standard posts only */}
            {!isFeedback && (
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
            )}

            {/* Title */}
            <div>
              <label
                className="text-xs font-semibold uppercase tracking-wide block mb-1.5"
                style={{ color: "var(--muted-foreground)" }}
              >
                {titleLabel}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder={titlePh}
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
              <p className="text-xs text-right mt-1" style={{ color: "var(--muted-foreground)" }}>
                {title.length}/200
              </p>
            </div>

            {/* Content */}
            <div>
              <label
                className="text-xs font-semibold uppercase tracking-wide block mb-1.5"
                style={{ color: "var(--muted-foreground)" }}
              >
                {contentLabel}
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={2000}
                placeholder={contentPh}
                className="w-full rounded-xl px-4 py-3 text-sm resize-none"
                style={{
                  minHeight:       isFeedback ? 120 : 140,
                  backgroundColor: "rgba(255,255,255,0.05)",
                  border:          "1px solid var(--border)",
                  color:           "var(--foreground)",
                  fontSize:        16,
                  outline:         "none",
                }}
              />
              <p className="text-xs text-right mt-1" style={{ color: "var(--muted-foreground)" }}>
                {content.length}/2000
              </p>
            </div>

            {/* Image upload — standard posts only */}
            {!isFeedback && (
              <div>
                <label
                  className="text-xs font-semibold uppercase tracking-wide block mb-1.5"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Photo (optional)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  style={{ display: "none" }}
                />
                {imagePreview ? (
                  <div className="relative rounded-xl overflow-hidden" style={{ height: 160 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute top-2 right-2 flex items-center justify-center rounded-full"
                      style={{
                        width:      28,
                        height:     28,
                        background: "rgba(0,0,0,0.6)",
                        border:     "none",
                        color:      "#fff",
                        cursor:     "pointer",
                      }}
                      aria-label="Remove image"
                    >
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-xl flex items-center justify-center gap-2 text-sm"
                    style={{
                      height:      52,
                      border:      "1.5px dashed var(--border)",
                      background:  "transparent",
                      color:       "var(--muted-foreground)",
                      cursor:      "pointer",
                      touchAction: "manipulation",
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M8 3v10M3 8h10" />
                    </svg>
                    Add Photo
                  </button>
                )}
              </div>
            )}

            {error && (
              <p className="text-xs text-center" style={{ color: "#E8642C" }}>
                {error}
              </p>
            )}
          </div>
        </div>

        {/* Footer — fixed, not scrollable */}
        <div className="px-5 py-4" style={{ borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
            style={{
              height:                  52,
              background:              submitBg,
              color:                   "#1A1210",
              border:                  "none",
              cursor:                  canSubmit && !submitting ? "pointer" : "default",
              touchAction:             "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {submitting ? (
              <span
                className="inline-block rounded-full border-2 border-current border-t-transparent animate-spin"
                style={{ width: 16, height: 16 }}
              />
            ) : submitLabel}
          </button>
        </div>
      </div>
    </>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}
