"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal }                          from "react-dom";
import { useRouter }                             from "next/navigation";
import { createClient }                          from "@/utils/supabase/client";
import { checkResponse }                         from "@/lib/telemetry/fetch-checks";
import { BottomSheet }                           from "@/components/ui/BottomSheet";
import { compressImage }                         from "@/lib/image-compress";
import { MAX_POST_IMAGES }                       from "@/lib/lounge/post-images";

/* ------------------------------------------------------------------ */

interface Category {
  id:           string;
  name:         string;
  is_locked:    boolean;
  slug?:        string;
  is_feedback?: boolean;
}

interface Props {
  categories:         Category[];
  userId:             string;
  initialCategoryId?: string;
  onCreated:          (categoryId: string) => void;
  onClose:            () => void;
}

const FEEDBACK_TYPES = ["Feature Request", "Bug Report", "Improvement", "Other"] as const;
type FeedbackType = typeof FEEDBACK_TYPES[number];

/* ------------------------------------------------------------------ */

export function NewPostSheet({ categories, userId, initialCategoryId, onCreated, onClose }: Props) {
  const [mounted,        setMounted]        = useState(false);
  const [categoryId,     setCategoryId]     = useState(
    initialCategoryId ?? categories.find((c) => !c.is_locked)?.id ?? ""
  );
  const selected   = categories.find((c) => c.id === categoryId) ?? null;
  const isFeedback = !!selected?.is_feedback;
  const isBurn     = selected?.slug === "burn-reports";
  const router     = useRouter();
  const [feedbackType,   setFeedbackType]   = useState<FeedbackType>("Feature Request");
  const [title,          setTitle]          = useState("");
  const [content,        setContent]        = useState("");
  /* Up to MAX_POST_IMAGES files; previews are parallel object URLs. */
  const [imageFiles,     setImageFiles]     = useState<File[]>([]);
  const [imagePreviews,  setImagePreviews]  = useState<string[]>([]);
  const [uploading,      setUploading]      = useState(false);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supabase = useMemo(() => createClient(), []);

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    const room  = MAX_POST_IMAGES - imageFiles.length;
    const added = picked.slice(0, room);
    setImageFiles((prev) => [...prev, ...added]);
    setImagePreviews((prev) => [...prev, ...added.map((f) => URL.createObjectURL(f))]);
    /* Reset so re-picking the same file fires onChange again. */
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage(index: number) {
    URL.revokeObjectURL(imagePreviews[index]);
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  }

  /* Portal target needs document; body scroll lock + escape are
     handled by the BottomSheet primitive. */
  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleSubmit() {
    if (isBurn) return;
    const targetCategoryId = categoryId;
    if (!targetCategoryId || !title.trim() || !content.trim()) return;
    setSubmitting(true);
    setError(null);

    // Upload images if selected (standard posts only). Compress
    // client-side first — raw iPhone shots exceed Vercel's 4.5 MB
    // body cap and die mid-upload on iOS PWA.
    let image_urls: string[] = [];
    if (!isFeedback && imageFiles.length > 0) {
      setUploading(true);
      try {
        image_urls = await Promise.all(
          imageFiles.map(async (file) => {
            const upload = await compressImage(file);
            const fd = new FormData();
            fd.append("file",   upload);
            fd.append("folder", "forum-posts");
            const res = checkResponse(
              await fetch("/api/upload/image", { method: "POST", body: fd }),
              { route: "/api/upload/image" },
            );
            if (!res.ok) {
              const { error } = await res.json().catch(() => ({ error: "Upload failed." }));
              throw new Error(error ?? "Upload failed.");
            }
            const { url } = await res.json();
            return url as string;
          }),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
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
    if (image_urls.length > 0) {
      payload.image_urls = image_urls;
      /* Legacy single-image column stays in sync with the first image
         so stale clients (older cached bundles) keep rendering one. */
      payload.image_url  = image_urls[0];
    }

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

  const canSubmit = !isBurn && title.trim().length > 0 && content.trim().length > 0 && categoryId.length > 0;

  const modalTitle    = isFeedback ? "Share an Idea" : "New Post";
  const titleLabel    = isFeedback ? "Title" : "Title";
  const titlePh       = isFeedback ? "Summarize your idea or issue..." : "Give your post a title...";
  const contentLabel  = isFeedback ? "Details" : "Content";
  const contentPh     = isFeedback ? "Describe your idea in detail. The more context, the better." : "Share your thoughts...";
  const submitLabel   = isFeedback ? "Submit Idea" : uploading ? "Uploading photo..." : "Post to Lounge";
  const submitBg      = isFeedback
    ? (canSubmit && !submitting ? "#E8642C" : "rgba(232,100,44,0.3)")
    : (canSubmit && !submitting ? "linear-gradient(135deg, #D4A04A, #C17817)" : "rgba(212,160,74,0.3)");

  const headerSlot = (
    <div
      className="flex items-center justify-between px-5"
      style={{
        paddingTop:    18,
        paddingBottom: 14,
        borderBottom:  "1px solid var(--border)",
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
  );

  const bodySlot = (
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

            {/* Category selector — only when the sheet was opened with
                more than one option. Composing from inside a category
                hands us a single-entry list, so we drop the picker
                entirely; the category context is implicit. */}
            {categories.length > 1 && (
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

            {/* Burn Reports explainer — burn posts only come from a
                logged smoke in the humidor, so the form is replaced
                with a redirect prompt instead. */}
            {isBurn && (
              <div
                className="rounded-xl p-4"
                style={{ backgroundColor: "rgba(61,46,35,0.35)", border: "1px solid var(--border)" }}
              >
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)", fontFamily: "var(--font-serif)" }}>
                  Burn reports start from a logged smoke.
                </p>
                <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                  Head to your humidor, pick the cigar, and share the report from there.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/humidor")}
                  className="w-full rounded-xl font-semibold text-sm"
                  style={{
                    height:                  48,
                    background:              "linear-gradient(135deg, #D4A04A, #C17817)",
                    color:                   "#1A1210",
                    border:                  "none",
                    cursor:                  "pointer",
                    touchAction:             "manipulation",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  Log a Smoke in the Humidor
                </button>
              </div>
            )}

            {/* Title */}
            {!isBurn && (
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
            )}

            {/* Content */}
            {!isBurn && (
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
            )}

            {/* Image upload — standard posts only */}
            {!isFeedback && !isBurn && (
              <div>
                <label
                  className="text-xs font-semibold uppercase tracking-wide block mb-1.5"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Photos (optional, up to {MAX_POST_IMAGES})
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageSelect}
                  style={{ display: "none" }}
                />
                {imagePreviews.length > 0 && (
                  <div className="flex gap-2 mb-2">
                    {imagePreviews.map((preview, i) => (
                      <div key={preview} className="relative rounded-xl overflow-hidden" style={{ width: 96, height: 96 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={preview} alt={`Photo ${i + 1} preview`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute top-1.5 right-1.5 flex items-center justify-center rounded-full"
                          style={{
                            width:      26,
                            height:     26,
                            background: "rgba(0,0,0,0.6)",
                            border:     "none",
                            color:      "#fff",
                            cursor:     "pointer",
                            touchAction: "manipulation",
                          }}
                          aria-label={`Remove photo ${i + 1}`}
                        >
                          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {imageFiles.length < MAX_POST_IMAGES && (
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
                    {imageFiles.length === 0 ? "Add Photos" : "Add Another"}
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
  );

  const footerSlot = (
    <div className="px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
      {!isBurn && (
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
      )}
    </div>
  );

  if (!mounted) return null;
  /* Portaled to <body> so the sheet escapes any transformed ancestor's
     containing block. Mount-on-demand: `open` is constant true; the
     primitive's enter-on-mount animation handles the slide-in. */
  return createPortal(
    <BottomSheet
      open
      onClose={onClose}
      ariaLabel={modalTitle}
      header={headerSlot}
      footer={footerSlot}
      mobileHeight="88dvh"
      desktopMaxWidth={560}
      showHandle
    >
      {bodySlot}
    </BottomSheet>,
    document.body,
  );
}
