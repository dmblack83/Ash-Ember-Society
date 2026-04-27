"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { getCigarImage } from "@/lib/cigar-default-image";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

export interface BurnReportRow {
  id:                      string;
  smoked_at:               string;
  overall_rating:          number | null;
  draw_rating:             number | null;
  burn_rating:             number | null;
  construction_rating:     number | null;
  flavor_rating:           number | null;
  smoke_duration_minutes:  number | null;
  pairing_drink:           string | null;
  location:                string | null;
  occasion:                string | null;
  flavor_tag_ids:          string[] | null;
  photo_urls:              string[] | null;
  review_text:             string | null;
  content_video_id:        string | null;
  cigar: {
    id:        string;
    brand:     string;
    series:    string | null;
    format:    string | null;
    wrapper:   string | null;
    image_url: string | null;
  } | null;
}

export interface FlavorTag {
  id:   string;
  name: string;
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function ratingColor(v: number): string {
  if (v <= 40) return "#C44536";
  if (v <= 60) return "#8B6020";
  if (v <= 80) return "#3A6B45";
  return "#D4A04A";
}

function ratingLabel(v: number): string {
  if (v <= 20) return "Poor";
  if (v <= 40) return "Below Average";
  if (v <= 60) return "Average";
  if (v <= 80) return "Good";
  return "Outstanding";
}

const STAR_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very Good",
  5: "Excellent",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month:    "short",
    day:      "numeric",
    year:     "numeric",
    timeZone: "UTC",
  });
}

/* ------------------------------------------------------------------
   StarsSummary
   ------------------------------------------------------------------ */

function StarsSummary({ val }: { val: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            fill={s <= val ? "var(--primary)" : "none"}
            stroke={s <= val ? "var(--primary)" : "var(--border)"}
            strokeWidth="1.5"
          />
        </svg>
      ))}
      <span className="text-xs text-muted-foreground ml-1">{STAR_LABELS[val] ?? ""}</span>
    </span>
  );
}

/* ------------------------------------------------------------------
   SummaryRow
   ------------------------------------------------------------------ */

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-2.5 border-b last:border-0"
      style={{ borderColor: "var(--border)" }}
    >
      <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium flex-shrink-0">
        {label}
      </span>
      <span className="text-sm text-foreground text-right">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------
   StarRow — reusable star rating row for expanded detail
   ------------------------------------------------------------------ */

function StarRow({ label, val }: { label: string; val: number }) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-2.5 border-b last:border-0"
      style={{ borderColor: "var(--border)" }}
    >
      <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">{label}</span>
      {val > 0
        ? <StarsSummary val={val} />
        : <span className="text-sm text-muted-foreground">N/A</span>}
    </div>
  );
}

/* ------------------------------------------------------------------
   Photo modal
   ------------------------------------------------------------------ */

function PhotoModal({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top      = `-${scrollY}px`;
    document.body.style.width    = "100%";
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.position = "";
      document.body.style.top      = "";
      document.body.style.width    = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 9999, background: "rgba(0,0,0,0.92)" }}
      onClick={onClose}
    >
      {/* X button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 flex items-center justify-center rounded-full transition-opacity hover:opacity-80 active:opacity-50"
        style={{
          width:      44,
          height:     44,
          background: "rgba(255,255,255,0.14)",
          border:     "1px solid rgba(255,255,255,0.18)",
          cursor:     "pointer",
          zIndex:     10000,
        } as React.CSSProperties}
        aria-label="Close photo"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M12 4L4 12M4 4l8 8" stroke="var(--foreground)" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {/* Image */}
      <img
        src={url}
        alt="Burn report photo"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "92vw", maxHeight: "88vh", borderRadius: 12, objectFit: "contain" }}
      />
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------
   Confirm delete modal
   ------------------------------------------------------------------ */

function ConfirmDeleteModal({
  onConfirm,
  onCancel,
  busy,
}: {
  onConfirm: () => void;
  onCancel:  () => void;
  busy:      boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{ zIndex: 9999, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl p-6 flex flex-col gap-4"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1">
          <p className="font-semibold text-foreground" style={{ fontFamily: "var(--font-serif)", fontSize: 17 }}>
            Delete this burn report?
          </p>
          <p className="text-sm text-muted-foreground">This cannot be undone.</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl text-sm font-medium py-3 transition-opacity active:opacity-60"
            style={{ background: "var(--muted, rgba(255,255,255,0.06))", border: "1px solid var(--border)", color: "var(--foreground)", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-xl text-sm font-semibold py-3 transition-opacity active:opacity-60"
            style={{
              background: "var(--destructive, #C44536)",
              color:      "#fff",
              border:     "none",
              cursor:     busy ? "default" : "pointer",
              opacity:    busy ? 0.6 : 1,
            } as React.CSSProperties}
          >
            {busy ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------
   Burn Report Card
   ------------------------------------------------------------------ */

function BurnReportCard({
  report,
  flavorTags,
  onDelete,
}: {
  report:     BurnReportRow;
  flavorTags: FlavorTag[];
  onDelete:   (id: string) => void;
}) {
  const [open,          setOpen]          = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [photoUrl,      setPhotoUrl]      = useState<string | null>(null);
  const [mounted,       setMounted]       = useState(false);
  const [sharing,       setSharing]       = useState(false);
  const [shared,        setShared]        = useState(false);
  const [shareErr,      setShareErr]      = useState<string | null>(null);
  const [linkedVideo, setLinkedVideo] = useState<{ ytId: string; title: string; thumb: string | null } | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!report.content_video_id) return;
    createClient()
      .from("content_videos")
      .select("youtube_video_id, title, thumbnail_url")
      .eq("id", report.content_video_id)
      .single()
      .then(({ data }) => {
        if (data) setLinkedVideo({ ytId: data.youtube_video_id, title: data.title, thumb: data.thumbnail_url });
      });
  }, [report.content_video_id]);

  async function handleShareToLounge() {
    if (sharing || shared) return;
    setSharing(true);
    setShareErr(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSharing(false); return; }

    const { data: category } = await supabase
      .from("forum_categories")
      .select("id")
      .eq("slug", "burn-reports")
      .single();

    if (!category) {
      setShareErr("Could not find Burn Reports category.");
      setSharing(false);
      return;
    }

    const c = report.cigar;
    const cigarLabel = [c?.brand, c?.series ?? c?.format].filter(Boolean).join(" ");
    const title      = `${cigarLabel} — ${report.overall_rating ?? "N/A"}/100`;
    const content    = report.review_text?.trim() || `Rating: ${report.overall_rating ?? "N/A"}/100`;

    const { error } = await supabase.from("forum_posts").insert({
      user_id:      user.id,
      category_id:  category.id,
      title,
      content,
      smoke_log_id: report.id,
    });

    setSharing(false);
    if (error) { setShareErr(error.message); return; }
    setShared(true);
  }

  const c      = report.cigar;
  const rating = report.overall_rating ?? 0;
  const color  = ratingColor(rating);
  const label  = ratingLabel(rating);

  const tagNames = (report.flavor_tag_ids ?? [])
    .map((tid) => flavorTags.find((t) => t.id === tid)?.name)
    .filter(Boolean) as string[];

  const photos = (report.photo_urls ?? []).filter(Boolean);

  const hasDetails =
    report.smoke_duration_minutes != null ||
    report.pairing_drink ||
    report.location ||
    report.occasion ||
    (report.draw_rating ?? 0) > 0 ||
    (report.burn_rating ?? 0) > 0 ||
    (report.construction_rating ?? 0) > 0 ||
    (report.flavor_rating ?? 0) > 0 ||
    tagNames.length > 0 ||
    photos.length > 0 ||
    report.review_text;

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    const supabase = createClient();
    await supabase.from("smoke_logs").delete().eq("id", report.id);
    onDelete(report.id);
  }

  function handleDeleteClick() {
    setConfirmDelete(true);
  }

  return (
    <div className="card overflow-hidden">
      {/* ── Collapsed row ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-3 text-left transition-opacity active:opacity-70"
        style={{
          background:              "none",
          border:                  "none",
          cursor:                  "pointer",
          touchAction:             "manipulation",
          WebkitTapHighlightColor: "transparent",
        } as React.CSSProperties}
        aria-expanded={open}
      >
        {/* Thumbnail */}
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
          <img
            src={getCigarImage(c?.image_url, c?.wrapper)}
            alt={c?.series ?? c?.format ?? "Cigar"}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        </div>

        {/* Cigar info */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium truncate">
            {c?.brand ?? "Unknown Brand"}
          </p>
          <p className="text-sm font-semibold text-foreground truncate">
            {c?.series ?? c?.format ?? "Unknown Cigar"}
          </p>
          {(c?.format || c?.wrapper) && (
            <p className="text-xs text-muted-foreground truncate">
              {[c?.format, c?.wrapper].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {formatDate(report.smoked_at)}
          </p>
        </div>

        {/* Rating badge + chevron */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div
            className="rounded-lg flex items-center justify-center"
            style={{
              width:      44,
              height:     44,
              background: `${color}22`,
              border:     `1px solid ${color}55`,
            }}
          >
            <span
              className="font-bold"
              style={{ fontFamily: "var(--font-serif)", fontSize: 20, color, lineHeight: 1 }}
            >
              {rating}
            </span>
          </div>
          {hasDetails && (
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              style={{
                transform:  open ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
                color:      "var(--muted-foreground)",
              }}
            >
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </button>

      {/* ── Expanded summary ──────────────────────────────────────── */}
      {hasDetails && (
        <div
          style={{
            overflow:   "hidden",
            maxHeight:  open ? 1200 : 0,
            transition: "max-height 0.3s ease",
          }}
        >
          <div className="px-4 pb-2" style={{ borderTop: "1px solid var(--border)" }}>

            {/* Rating hero */}
            <div className="flex items-center gap-3 py-4">
              <span
                className="font-bold"
                style={{ fontFamily: "var(--font-serif)", fontSize: 40, color, lineHeight: 1 }}
              >
                {rating}
              </span>
              <p className="text-sm font-semibold" style={{ color }}>{label}</p>
            </div>

            {/* Detail rows */}
            <div style={{ borderTop: "1px solid var(--border)" }}>
              <SummaryRow label="Duration" value={report.smoke_duration_minutes != null ? `${report.smoke_duration_minutes} min` : "N/A"} />
              <SummaryRow label="Drink"    value={report.pairing_drink || "N/A"} />
              <SummaryRow label="Location" value={report.location || "N/A"} />
              <SummaryRow label="Occasion" value={report.occasion || "N/A"} />
              <StarRow label="Draw"         val={report.draw_rating ?? 0} />
              <StarRow label="Burn"         val={report.burn_rating ?? 0} />
              <StarRow label="Construction" val={report.construction_rating ?? 0} />
              <StarRow label="Flavor"       val={report.flavor_rating ?? 0} />
            </div>

            {/* Flavor profile chips */}
            <div className="mt-3 space-y-2">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
                Flavor Profile
              </p>
              {tagNames.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {tagNames.map((name) => (
                    <span
                      key={name}
                      className="rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{
                        background: "rgba(193,120,23,0.15)",
                        border:     "1px solid rgba(193,120,23,0.35)",
                        color:      "var(--gold, #D4A04A)",
                      }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">N/A</p>
              )}
            </div>

            {/* Review text */}
            <div className="mt-3 space-y-1">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Review</p>
              <p className="text-sm text-foreground leading-relaxed">{report.review_text || "N/A"}</p>
            </div>

            {/* Photos */}
            {photos.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Photos</p>
                <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
                  {photos.map((url, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPhotoUrl(url)}
                      className="flex-shrink-0 rounded-lg overflow-hidden transition-opacity active:opacity-70"
                      style={{ width: 88, height: 88, padding: 0, border: "none", cursor: "pointer", touchAction: "manipulation" } as React.CSSProperties}
                      aria-label={`View photo ${i + 1}`}
                    >
                      <img
                        src={url}
                        alt={`Photo ${i + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Linked video */}
            {linkedVideo && (
              <div className="mt-3">
                <Link
                  href={`https://www.youtube.com/watch?v=${linkedVideo.ytId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display:         "flex",
                    gap:             12,
                    alignItems:      "flex-start",
                    padding:         "10px 12px",
                    borderRadius:    10,
                    backgroundColor: "var(--card)",
                    border:          "1px solid rgba(255,255,255,0.06)",
                    textDecoration:  "none",
                  }}
                >
                  {linkedVideo.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={linkedVideo.thumb} alt="" style={{ width: 112, height: 63, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 112, height: 63, backgroundColor: "var(--secondary)", borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" fill="rgba(193,120,23,0.15)" stroke="rgba(193,120,23,0.3)" strokeWidth="1.2"/>
                        <path d="M10 8l6 4-6 4V8z" fill="var(--primary)"/>
                      </svg>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
                      {linkedVideo.title}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 3 }}>Watch on YouTube</p>
                  </div>
                </Link>
              </div>
            )}

            {/* Actions: Share + Delete */}
            <div
              className="mt-4 pb-3 flex items-center justify-between gap-3"
              style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}
            >
              {/* Share to Lounge */}
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={handleShareToLounge}
                  disabled={sharing || shared}
                  className="flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-full transition-opacity active:opacity-70"
                  style={{
                    border:      `1.5px solid ${shared ? "var(--border)" : "var(--gold, #D4A04A)"}`,
                    color:       shared ? "var(--muted-foreground)" : "var(--gold, #D4A04A)",
                    background:  "transparent",
                    cursor:      sharing || shared ? "default" : "pointer",
                    touchAction: "manipulation",
                    WebkitTapHighlightColor: "transparent",
                  } as React.CSSProperties}
                >
                  {shared ? "Shared to Lounge" : sharing ? "Sharing..." : "Share to Lounge"}
                </button>
                {shareErr && (
                  <p className="text-xs" style={{ color: "#E8642C" }}>{shareErr}</p>
                )}
              </div>

              {/* Delete */}
              <button
                type="button"
                onClick={handleDeleteClick}
                disabled={deleting}
                className="flex items-center gap-2 text-sm font-medium transition-opacity active:opacity-60"
                style={{
                  color:       "var(--destructive, #C44536)",
                  background:  "none",
                  border:      "none",
                  cursor:      "pointer",
                  padding:     0,
                  touchAction: "manipulation",
                } as React.CSSProperties}
                aria-label="Delete report"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1.5 14h-11L5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                Delete
              </button>
            </div>

            {/* Portals */}
            {mounted && photoUrl && (
              <PhotoModal url={photoUrl} onClose={() => setPhotoUrl(null)} />
            )}
            {mounted && confirmDelete && (
              <ConfirmDeleteModal
                busy={deleting}
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete(false)}
              />
            )}

          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   BurnReportsClient
   ------------------------------------------------------------------ */

interface BurnReportsClientProps {
  reports:    BurnReportRow[];
  flavorTags: FlavorTag[];
}

export function BurnReportsClient({ reports: initialReports, flavorTags }: BurnReportsClientProps) {
  const headerRef                       = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [reports,      setReports]      = useState<BurnReportRow[]>(initialReports);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setHeaderHeight(el.offsetHeight));
    obs.observe(el);
    setHeaderHeight(el.offsetHeight);
    return () => obs.disconnect();
  }, []);

  function handleDelete(id: string) {
    setReports((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>

      {/* ── Fixed header ───────────────────────────────────────────── */}
      <div
        ref={headerRef}
        className="fixed top-0 left-0 right-0 z-30"
        style={{
          background:   "var(--background)",
          borderBottom: "1px solid var(--border)",
          paddingTop:   "env(safe-area-inset-top)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">

          {/* Row 1: Tab navigation */}
          <div className="flex border-b border-border/50">
            <Link
              href="/humidor"
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors duration-150 mr-6"
            >
              Humidor
            </Link>
            <Link
              href="/humidor/wishlist"
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors duration-150 mr-6"
            >
              Wishlist
            </Link>
            <span
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2 mr-6"
              style={{ borderColor: "var(--ember, #E8642C)", color: "var(--foreground)" }}
            >
              Burn Reports
            </span>
            <Link
              href="/humidor/stats"
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors duration-150"
            >
              Stats
            </Link>
          </div>

          {/* Row 2: Title + count */}
          <div className="flex items-baseline gap-3 pt-4 pb-3">
            <h1 style={{ fontFamily: "var(--font-serif)" }}>My Reports</h1>
            {reports.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {reports.length} {reports.length === 1 ? "report" : "reports"}
              </span>
            )}
          </div>

        </div>
      </div>

      {/* Spacer */}
      <div style={{ height: headerHeight }} aria-hidden="true" />

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        {reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div
              className="rounded-full flex items-center justify-center"
              style={{ width: 64, height: 64, background: "rgba(193,120,23,0.12)" }}
            >
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <path
                  d="M14 3C14 3 8 9 8 15a6 6 0 0012 0c0-6-6-12-6-12z"
                  stroke="var(--primary)"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  fill="none"
                />
                <circle cx="14" cy="15" r="2.5" fill="var(--primary)" opacity="0.6" />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="font-semibold" style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>
                No burn reports yet
              </p>
              <p className="text-sm text-muted-foreground max-w-[260px]">
                Log a smoke from any cigar in your humidor to see your reports here.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {reports.map((report) => (
              <BurnReportCard
                key={report.id}
                report={report}
                flavorTags={flavorTags}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
