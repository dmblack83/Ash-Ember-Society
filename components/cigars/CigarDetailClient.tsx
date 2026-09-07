"use client";

/*
 * Cigar detail — client rendering of the catalog row. Markup ported
 * verbatim from the server page when /discover/cigars/[id] converted
 * to a client shell; data now arrives via props from CigarDetailRoute.
 */

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Divider } from "@/components/ui/divider";
import { CigarActions } from "@/components/cigars/CigarActions";
import { CigarEditSuggestButton } from "@/components/cigars/CigarEditSuggestButton";
import { CigarImage } from "@/components/ui/CigarImage";
import { countryName, wrapperDisplay } from "@/lib/country-name";
import { sizeDims, sizeLabel, type SizeChild } from "@/lib/cigars/line-group";
import { keyFor } from "@/lib/data/keys";
import { fetchCigarPendingEdit, type CigarDetailRow } from "@/lib/data/cigar-fetchers";
import { useAppSession } from "@/components/system/app-session";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
        {label}
      </dt>
      <dd className="text-sm text-foreground font-medium">{value}</dd>
    </div>
  );
}

interface Props {
  cigar:    CigarDetailRow;
  siblings: SizeChild[];
}

export function CigarDetailClient({ cigar: c, siblings }: Props) {
  /* Tapped child preselected (humidor deep links keep working). */
  const [selectedId, setSelectedId] = useState(c.id);
  const selected =
    siblings.find((s) => s.id === selectedId) ??
    ({ id: c.id, format: c.format, ring_gauge: c.ring_gauge, length_inches: c.length_inches, image_url: c.image_url } as SizeChild);

  /* Pending edit-suggestion flag — per-user (RLS-scoped), fetched
     lazily; the button renders optimistically while it loads. Keyed
     per selected child — the suggestion targets the chosen size. */
  const { ready, session } = useAppSession();
  const userId = ready && session ? session.userId : null;
  const { data: hasPendingEdit = false } = useSWR(
    userId ? keyFor.cigarPendingEdit(userId, selected.id) : null,
    () => fetchCigarPendingEdit(selected.id),
  );

  /* Build details list — blend-only (Format / Ring Gauge / Length
     live in the size picker below, not here). Omit null/undefined
     fields. */
  const details: { label: string; value: string }[] = [
    c.shade          ? { label: "Shade",            value: c.shade }                                            : null,
    c.wrapper        ? { label: "Wrapper",          value: wrapperDisplay(c.wrapper) }                           : null,
    c.wrapper_country ? { label: "Wrapper Country",  value: countryName(c.wrapper_country) }                    : null,
    c.binder_country  ? { label: "Binder Country",   value: countryName(c.binder_country) }                     : null,
    (c.filler_countries && c.filler_countries.length > 0)
      ? { label: "Filler Countries", value: c.filler_countries.map(countryName).join(", ") }                    : null,
  ].filter((d): d is { label: string; value: string } => d !== null);

  /* Hero image: selected child, then the line row, then any sibling,
     then the CigarImage component's own wrapper-default fallback. */
  const heroImage = selected.image_url ?? c.image_url ?? siblings.find((s) => s.image_url)?.image_url ?? null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">

      {/* Back button */}
      <Link
        href="/discover/cigars"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M9 11L5 7L9 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to cigars
      </Link>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start animate-fade-in">
        {/* Cigar image — hero on the cigar detail page. priority because
            this is above the fold and contributes to LCP on phones. */}
        <div className="w-full sm:w-72 aspect-[4/3] rounded-xl overflow-hidden bg-muted flex items-center justify-center flex-shrink-0 relative">
          <CigarImage
            imageUrl={heroImage}
            wrapper={c.wrapper}
            alt={c.series ?? c.format ?? ""}
            fill
            sizes="(max-width: 640px) 100vw, 288px"
            quality={80}
            priority
            style={{ objectFit: "contain" }}
          />
        </div>

        {/* Info */}
        <div className="flex flex-col gap-2 flex-1 min-w-0 pt-1">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {c.brand}
          </p>
          <h1
            className="text-foreground"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {c.series ?? c.format}
          </h1>

          {c.community_added && !c.approved && (
            <span className="text-[11px] text-muted-foreground">
              Community submission — pending review
            </span>
          )}

          {/* Actions — desktop inline in hero */}
          <div className="hidden sm:block mt-6">
            <CigarActions cigarId={selected.id} sizeText={sizeLabel(selected)} />
          </div>
        </div>
      </section>

      <Divider className="my-6" />

      {/* ── Details ─────────────────────────────────────────────── */}
      <section className="space-y-4 animate-slide-up">
        <h2>Details</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
          {details.map((d) => (
            <DetailRow key={d.label} label={d.label} value={d.value} />
          ))}
        </dl>
      </section>

      <Divider className="my-6" />

      {/* ── Choose a size ───────────────────────────────────────── */}
      <section className="space-y-3 animate-slide-up">
        <h2>Choose a size</h2>
        <div role="radiogroup" aria-label="Choose a size" className="space-y-2">
          {siblings.map((s) => {
            const sel = s.id === selectedId;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={sel}
                onClick={() => setSelectedId(s.id)}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-colors duration-150"
                style={{
                  backgroundColor: sel ? "rgba(212,160,74,0.07)" : "var(--card)",
                  border: `1px solid ${sel ? "var(--gold, #D4A04A)" : "var(--border)"}`,
                }}
              >
                <span
                  aria-hidden="true"
                  className="flex-shrink-0 rounded-full"
                  style={{
                    width: 17, height: 17,
                    border: `1.5px solid ${sel ? "var(--gold, #D4A04A)" : "var(--muted-foreground)"}`,
                    backgroundColor: "transparent",
                    boxShadow: sel ? "inset 0 0 0 3.5px var(--background), inset 0 0 0 12px var(--gold, #D4A04A)" : "none",
                  }}
                />
                <span className="flex-1 text-sm font-medium text-foreground">
                  {s.format ?? "Original size"}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {sizeDims(s)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <Divider className="my-6" />

      {/* ── Actions (mobile only — desktop shown inline in hero) ─── */}
      <section className="sm:hidden">
        <CigarActions cigarId={selected.id} sizeText={sizeLabel(selected)} />
      </section>

      {/* ── Suggest an edit — reuses the humidor item page's button +
             sheet; RLS-scoped pending flag decides button vs note.
             Blend fields come from the line-shared row; size fields
             come from the selected vitola. ── */}
      <section className="sm:max-w-xs space-y-2">
        <CigarEditSuggestButton
          cigar={{
            id:               selected.id,
            brand:            c.brand,
            series:           c.series,
            format:           selected.format,
            ring_gauge:       selected.ring_gauge,
            length_inches:    selected.length_inches,
            shade:            c.shade,
            wrapper:          c.wrapper,
            wrapper_country:  c.wrapper_country,
            binder_country:   c.binder_country,
            filler_countries: c.filler_countries,
          }}
          hasPending={hasPendingEdit}
        />
        <p className="text-[11px] text-center text-muted-foreground">
          Applies to the selected vitola
        </p>
      </section>

      <Divider className="my-6" />

      {/* ── Reviews ─────────────────────────────────────────────── */}
      <section className="space-y-4 animate-slide-up">
        <h2>Reviews</h2>
        <div className="card text-center py-10 space-y-2">
          <p className="text-sm text-muted-foreground">
            No reviews yet. Be the first.
          </p>
          <button type="button" className="btn btn-ghost text-sm mt-2">
            Write a review
          </button>
        </div>
      </section>

    </div>
  );
}
