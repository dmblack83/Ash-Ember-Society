"use client";

/*
 * Cigar detail — client rendering of the catalog row. Markup ported
 * verbatim from the server page when /discover/cigars/[id] converted
 * to a client shell; data now arrives via props from CigarDetailRoute.
 */

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import { Divider } from "@/components/ui/divider";
import { CigarActions } from "@/components/cigars/CigarActions";
import { CigarEditSuggestButton } from "@/components/cigars/CigarEditSuggestButton";
import { CigarTitle } from "@/components/cigars/CigarTitle";
import { VitolaRadioList } from "@/components/cigars/VitolaRadioList";
import { CigarImage } from "@/components/ui/CigarImage";
import { countryName, wrapperDisplay } from "@/lib/country-name";
import { lengthLabelForInches } from "@/lib/cigar-taxonomy";
import { sizeLabel, cigarDisplayName, type SizeChild } from "@/lib/cigars/line-group";
import { keyFor } from "@/lib/data/keys";
import { fetchCigarPendingEdit, type CigarDetailRow } from "@/lib/data/cigar-fetchers";
import { fetchProfileLite } from "@/lib/data/profile-client";
import { useAppSession } from "@/components/system/app-session";

/* Admin-only catalog editors — lazy so members never fetch the
   chunk (the render is gated on is_admin below). */
const AdminSizeEditSheet = dynamic(
  () => import("@/components/admin/AdminSizeEditSheet").then((m) => ({ default: m.AdminSizeEditSheet })),
  { ssr: false },
);
const AdminLineEditSheet = dynamic(
  () => import("@/components/admin/AdminLineEditSheet").then((m) => ({ default: m.AdminLineEditSheet })),
  { ssr: false },
);

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
    ({
      id: c.id, name: c.name, format: c.format, ring_gauge: c.ring_gauge,
      length_inches: c.length_inches, image_url: c.image_url,
      shade: c.shade, wrapper: c.wrapper, wrapper_country: c.wrapper_country,
      binder_country: c.binder_country, filler_countries: c.filler_countries,
      community_added: c.community_added, approved: c.approved,
    } as SizeChild);

  /* Pending edit-suggestion flag — per-user (RLS-scoped), fetched
     lazily; the button renders optimistically while it loads. Keyed
     per selected child — the suggestion targets the chosen size. */
  const { ready, session } = useAppSession();
  const userId = ready && session ? session.userId : null;
  const { data: hasPendingEdit = false } = useSWR(
    userId ? keyFor.cigarPendingEdit(userId, selected.id) : null,
    () => fetchCigarPendingEdit(selected.id),
  );

  /* Admin flag — same cache key as MobileNav's profile fetch. Gates
     the direct line/size editors. */
  const router = useRouter();
  const { data: profile } = useSWR(
    userId ? keyFor.profile(userId) : null,
    () => fetchProfileLite(userId!),
  );
  const isAdmin = profile?.is_admin === true;
  const [editSize, setEditSize] = useState<SizeChild | null>(null);
  const [editLine, setEditLine] = useState(false);

  /* After a direct admin edit: refetch the cigar row and the size
     list. A line rename flows through naturally — the refreshed
     cigar row carries the new brand/series, which recomputes the
     sibling key in CigarDetailRoute. */
  function refreshAfterAdminEdit() {
    void globalMutate(keyFor.cigar(c.id));
    if (c.brand) void globalMutate(keyFor.lineSiblings(c.brand, c.series));
  }

  /* Build details list from the selected vitola — Format > Length >
     Ring Gauge > blend. Omit null/undefined fields. */
  const sel = selected;
  const details: { label: string; value: string }[] = [
    sel.format ? { label: "Format", value: sel.format } : null,
    sel.length_inches != null
      ? { label: "Length", value: lengthLabelForInches(sel.length_inches) ?? `${sel.length_inches}"` } : null,
    sel.ring_gauge != null ? { label: "Ring Gauge", value: String(sel.ring_gauge) } : null,
    sel.shade   ? { label: "Shade",   value: sel.shade } : null,
    sel.wrapper ? { label: "Wrapper", value: wrapperDisplay(sel.wrapper) } : null,
    sel.wrapper_country ? { label: "Wrapper Country", value: countryName(sel.wrapper_country) } : null,
    sel.binder_country  ? { label: "Binder Country",  value: countryName(sel.binder_country) }  : null,
    (sel.filler_countries?.length ?? 0) > 0
      ? { label: "Filler Countries", value: sel.filler_countries!.map(countryName).join(", ") } : null,
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
            alt={cigarDisplayName({ series: c.series, format: c.format, brand: c.brand, name: selected.name })}
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
            <CigarTitle cigar={{ series: c.series, format: c.format, brand: c.brand, name: selected.name }} />
          </h1>

          {isAdmin && c.line_id && (
            <button
              type="button"
              onClick={() => setEditLine(true)}
              className="self-start text-xs font-medium px-3 py-1.5 rounded-lg"
              style={{ color: "var(--gold, #D4A04A)", border: "1px solid rgba(212,160,74,0.4)" }}
            >
              Edit line
            </button>
          )}

          {(selected.community_added ?? false) && !(selected.approved ?? true) && (
            <span className="text-[11px] text-muted-foreground">
              Community submission, pending review
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

      {/* ── Choose Vitola ───────────────────────────────────────── */}
      <section className="space-y-3 animate-slide-up">
        <h2>Choose Vitola</h2>
        <VitolaRadioList
          siblings={siblings}
          selectedId={selectedId}
          onSelect={setSelectedId}
          ariaLabel="Choose Vitola"
          isAdmin={isAdmin}
          onEditSize={setEditSize}
        />
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
            name:             selected.name ?? null,
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

      {/* ── Admin editors (lazy; render only for admins) ─────────── */}
      {isAdmin && editSize && (
        <AdminSizeEditSheet
          child={editSize}
          line={{ brand: c.brand, series: c.series }}
          siblings={siblings}
          open={true}
          onClose={() => setEditSize(null)}
          onSaved={(kind) => {
            if ((kind === "deleted" || kind === "merged") && editSize.id === c.id) {
              /* The routed child is gone — its detail URL would 404. */
              router.push("/discover/cigars");
              return;
            }
            /* "moved" refreshes like "saved" — the refetched cigar row
               carries the new brand/series and the sibling key
               recomputes (routed child included). */
            refreshAfterAdminEdit();
          }}
        />
      )}
      {isAdmin && c.line_id && (
        <AdminLineEditSheet
          lineId={c.line_id}
          current={{ brand: c.brand, series: c.series }}
          open={editLine}
          onClose={() => setEditLine(false)}
          onSaved={() => refreshAfterAdminEdit()}
        />
      )}

    </div>
  );
}
