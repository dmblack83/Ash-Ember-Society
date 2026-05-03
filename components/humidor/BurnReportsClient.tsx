"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import { VerdictCard } from "@/components/humidor/VerdictCard";
import { BurnReportPreviewCard } from "@/components/humidor/BurnReportPreviewCard";
import { BurnReportModal } from "@/components/humidor/BurnReportModal";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

/* Thirds joined from the burn_reports child table. PostgREST returns
   the child as an array even though the FK is UNIQUE (1:1) — we read
   index 0 at the boundary. */
export interface BurnReportThirds {
  thirds_enabled:  boolean;
  third_beginning: string | null;
  third_middle:    string | null;
  third_end:       string | null;
}

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
  burn_report:             BurnReportThirds[] | null;
}

export interface FlavorTag {
  id:   string;
  name: string;
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

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

      {/* Image — fill mode requires a sized parent. The wrapper
          caps the image at 92vw × 88vh; objectFit:contain preserves
          aspect ratio. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", width: "92vw", height: "88vh" }}
      >
        <Image
          src={url}
          alt="Burn report photo"
          fill
          sizes="92vw"
          quality={85}
          unoptimized={url.startsWith("blob:")}
          style={{ borderRadius: 12, objectFit: "contain" }}
        />
      </div>
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
  displayName,
  city,
  reportNumber,
}: {
  report:       BurnReportRow;
  flavorTags:   FlavorTag[];
  onDelete:     (id: string) => void;
  displayName:  string | null;
  city:         string | null;
  reportNumber: number;
}) {
  const [deleting,      setDeleting]      = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [photoUrl,      setPhotoUrl]      = useState<string | null>(null);
  const [mounted,       setMounted]       = useState(false);
  const [sharing,       setSharing]       = useState(false);
  const [shared,        setShared]        = useState(false);
  const [shareErr,      setShareErr]      = useState<string | null>(null);
  const [linkedVideo, setLinkedVideo] = useState<{ ytId: string; title: string; thumb: string | null } | null>(null);
  /* Tap-to-expand: list shows the compact preview only; the full
     VerdictCard + linked video + share/delete actions live in this
     overlay. The list stays scannable. */
  const [expanded,      setExpanded]      = useState(false);

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

  /* OS-native share via Web Share API (iOS Share Sheet, Android share
     intent, etc.). Falls back to clipboard copy on browsers without
     the API. The shared payload is a short text-only summary; until
     each saved report has a public URL, there's nothing to deep-link
     to other than the lounge post (which only exists if the user
     already shared it via "Share to Lounge"). */
  async function handleNativeShare() {
    const c     = report.cigar;
    const score = report.overall_rating ?? 0;
    const grade =
      score <= 20 ? "Poor"
      : score <= 40 ? "Below Average"
      : score <= 60 ? "Average"
      : score <= 80 ? "Good"
      : "Outstanding";
    const cigarLabel = [c?.brand, c?.series ?? c?.format].filter(Boolean).join(" ");
    const title = `${cigarLabel || "Burn Report"} — ${score}/100`;
    const text  = report.review_text?.trim()
      ? `${title} (${grade})\n\n${report.review_text.trim()}`
      : `${title} — ${grade}`;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text });
        return;
      } catch (err) {
        // User cancelled the share sheet — silent. Anything else falls
        // through to clipboard fallback.
        if ((err as Error)?.name === "AbortError") return;
      }
    }

    // Fallback: copy to clipboard. Surfaces a brief Toast confirmation
    // by reusing the existing shareErr slot (negative-space; user gets
    // visible feedback that something happened).
    try {
      await navigator.clipboard.writeText(text);
      setShareErr("Copied to clipboard");
      setTimeout(() => setShareErr(null), 2000);
    } catch {
      setShareErr("Couldn't share — try again");
      setTimeout(() => setShareErr(null), 2000);
    }
  }

  const c = report.cigar;

  const tagNames = (report.flavor_tag_ids ?? [])
    .map((tid) => flavorTags.find((t) => t.id === tid)?.name)
    .filter(Boolean) as string[];

  const photos = (report.photo_urls ?? []).filter(Boolean);
  // PostgREST returns the 1:1 burn_reports child as an array (the
  // UNIQUE constraint isn't reflected in the embed metadata), but
  // can sometimes return the object directly — handle both shapes.
  const thirdsRaw = report.burn_report;
  const thirds    = Array.isArray(thirdsRaw) ? (thirdsRaw[0] ?? null) : (thirdsRaw ?? null);

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    const supabase = createClient();
    await supabase.from("smoke_logs").delete().eq("id", report.id);
    onDelete(report.id);
  }

  /* Linked video + share/delete actions — rendered inside the modal
     when expanded. Extracted so the JSX below stays scannable. */
  const belowCard = (
    <>
      {linkedVideo && (
        <div style={{ marginTop: 16 }}>
          <Link
            href={`https://www.youtube.com/watch?v=${linkedVideo.ytId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:         "flex",
              gap:             12,
              alignItems:      "flex-start",
              padding:         "10px 12px",
              borderRadius:    10,
              backgroundColor: "var(--card)",
              border:          "1px solid var(--line)",
              textDecoration:  "none",
            }}
          >
            {linkedVideo.thumb ? (
              <Image
                src={linkedVideo.thumb}
                alt=""
                width={112}
                height={63}
                sizes="112px"
                quality={70}
                style={{ objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
              />
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

      {/* Action row — Native Share + Share to Lounge + Delete */}
      <div
        className="flex items-center justify-between gap-3"
        style={{ marginTop: 16 }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleNativeShare}
            className="flex items-center justify-center rounded-full transition-opacity active:opacity-70"
            style={{
              width:       36,
              height:      36,
              border:      "1.5px solid var(--line-strong)",
              color:       "var(--paper-mute)",
              background:  "transparent",
              cursor:      "pointer",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            } as React.CSSProperties}
            aria-label="Share"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3v12M8 7l4-4 4 4M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={handleShareToLounge}
              disabled={sharing || shared}
              className="flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-full transition-opacity active:opacity-70"
              style={{
                border:      `1.5px solid ${shared ? "var(--line)" : "var(--gold, #D4A04A)"}`,
                color:       shared ? "var(--paper-mute)" : "var(--gold, #D4A04A)",
                background:  "transparent",
                cursor:      sharing || shared ? "default" : "pointer",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              } as React.CSSProperties}
            >
              {shared ? "Shared to Lounge" : sharing ? "Sharing..." : "Share to Lounge"}
            </button>
            {shareErr && (
              <p className="text-xs" style={{ color: "var(--paper-mute)" }}>{shareErr}</p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
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
    </>
  );

  return (
    <>
      <BurnReportPreviewCard
        cigar={c ? { brand: c.brand, series: c.series, format: c.format } : null}
        reportNumber={reportNumber}
        smokedAt={report.smoked_at}
        overallRating={report.overall_rating}
        drawRating={report.draw_rating}
        burnRating={report.burn_rating}
        constructionRating={report.construction_rating}
        flavorRating={report.flavor_rating}
        smokeDurationMinutes={report.smoke_duration_minutes}
        onTap={() => setExpanded(true)}
      />

      <BurnReportModal
        open={expanded}
        onClose={() => setExpanded(false)}
        cigar={c ? { brand: c.brand, series: c.series, format: c.format } : null}
        reportNumber={reportNumber}
        smokedAt={report.smoked_at}
        overallRating={report.overall_rating}
        drawRating={report.draw_rating}
        burnRating={report.burn_rating}
        constructionRating={report.construction_rating}
        flavorRating={report.flavor_rating}
        reviewText={report.review_text}
        smokeDurationMinutes={report.smoke_duration_minutes}
        pairingDrink={report.pairing_drink}
        occasion={report.occasion}
        flavorTagNames={tagNames}
        photoUrls={photos}
        thirdsEnabled={thirds?.thirds_enabled ?? false}
        thirdBeginning={thirds?.third_beginning ?? null}
        thirdMiddle={thirds?.third_middle ?? null}
        thirdEnd={thirds?.third_end ?? null}
        displayName={displayName}
        city={city}
        onPhotoClick={(url) => setPhotoUrl(url)}
        belowCard={belowCard}
      />

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
    </>
  );
}

/* ------------------------------------------------------------------
   BurnReportsClient
   ------------------------------------------------------------------ */

interface BurnReportsClientProps {
  reports:     BurnReportRow[];
  flavorTags:  FlavorTag[];
  displayName: string | null;
  city:        string | null;
}

export function BurnReportsClient({
  reports: initialReports,
  flavorTags,
  displayName,
  city,
}: BurnReportsClientProps) {
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
          <div className="flex flex-col gap-4">
            {reports.map((report, i) => (
              /* Reports are sorted newest-first, so the first row is
                 the user's most recent (highest report number). The
                 compact preview cards live tight; tap-to-expand opens
                 the full verdict in a modal. */
              <BurnReportCard
                key={report.id}
                report={report}
                flavorTags={flavorTags}
                onDelete={handleDelete}
                displayName={displayName}
                city={city}
                reportNumber={reports.length - i}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
