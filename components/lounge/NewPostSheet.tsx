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
  categories:        Category[];
  userId:            string;
  initialCategoryId?: string;
  onCreated:         (categoryId: string) => void;
  onClose:           () => void;
}

/* ------------------------------------------------------------------ */

export function NewPostSheet({ categories, userId, initialCategoryId, onCreated, onClose }: Props) {
  const [mounted,      setMounted]      = useState(false);
  const [categoryId,   setCategoryId]   = useState(
    initialCategoryId ?? categories.find((c) => !c.is_locked)?.id ?? ""
  );
  const [title,        setTitle]        = useState("");
  const [content,      setContent]      = useState("");
  const [imageFile,    setImageFile]    = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading,    setUploading]    = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);
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

    // Upload image if selected
    let image_url: string | null = null;
    if (imageFile) {
      setUploading(true);
      const ext  = imageFile.name.split(".").pop() ?? "jpg";
      const path = `forum-posts/${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("post-images")
        .upload(path, imageFile, { contentType: imageFile.type, upsert: false });
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from("post-images").getPublicUrl(path);
        image_url = urlData.publicUrl;
      }
      setUploading(false);
    }

    const payload: Record<string, unknown> = {
      user_id:     userId,
      category_id: categoryId,
      title:       title.trim(),
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

          {/* Image upload */}
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
              uploading ? "Uploading photo..." : "Post to Lounge"
            )}
          </button>
        </div>
      </div>
    </>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
