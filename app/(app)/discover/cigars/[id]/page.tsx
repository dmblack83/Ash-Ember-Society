import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Divider } from "@/components/ui/divider";
import { CigarActions } from "@/components/cigars/CigarActions";
import { getCigarImage } from "@/lib/cigar-default-image";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface CigarDetail {
  id: string;
  brand: string | null;
  series: string | null;
  name: string;
  format: string | null;
  wrapper: string | null;
  wrapper_country: string | null;
  binder_country: string | null;
  filler_countries: string[] | null;
  ring_gauge: number | null;
  length_inches: number | null;
  community_added: boolean;
  approved: boolean;
  image_url: string | null;
}

/* ------------------------------------------------------------------
   Sub-components
   ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------
   Page — server component, awaits params (Next.js 16)
   ------------------------------------------------------------------ */

export default async function CigarDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cigar_catalog")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) notFound();

  const c = data as CigarDetail;

  /* Check if the current user has this cigar on their wishlist */
  let isWishlisted = false;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: wishlistRow } = await supabase
      .from("humidor_items")
      .select("id")
      .eq("user_id", user.id)
      .eq("cigar_id", id)
      .eq("is_wishlist", true)
      .maybeSingle();
    isWishlisted = !!wishlistRow;
  }
  /* Build details list — omit null/undefined fields */
  const details: { label: string; value: string }[] = [
    c.wrapper        ? { label: "Wrapper",        value: c.wrapper }                     : null,
    c.wrapper_country ? { label: "Wrapper Country", value: c.wrapper_country }           : null,
    c.binder_country  ? { label: "Binder Country",  value: c.binder_country }            : null,
    (c.filler_countries && c.filler_countries.length > 0)
      ? { label: "Filler Countries", value: c.filler_countries.join(", ") }              : null,
    c.format         ? { label: "Format",         value: c.format }                      : null,
    c.ring_gauge != null
      ? { label: "Ring Gauge", value: String(c.ring_gauge) }                              : null,
    c.length_inches != null
      ? { label: "Length",     value: `${c.length_inches}"` }                            : null,
  ].filter((d): d is { label: string; value: string } => d !== null);

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
        {/* Cigar image */}
        <div className="w-full sm:w-72 aspect-[4/3] rounded-xl overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
          <img src={getCigarImage(c.image_url, c.wrapper)} alt={c.series ?? c.name} className="w-full h-full object-contain" />
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
            {c.series ?? c.name}
          </h1>
          {c.format && (
            <p className="text-sm text-muted-foreground">{c.format}</p>
          )}

          {c.community_added && !c.approved && (
            <span className="text-[11px] text-muted-foreground">
              Community submission — pending review
            </span>
          )}

          {/* Actions — desktop inline in hero */}
          <div className="hidden sm:block mt-6">
            <CigarActions cigarId={c.id} initialIsWishlisted={isWishlisted} />
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

      {/* ── Actions (mobile only — desktop shown inline in hero) ─── */}
      <section className="sm:hidden">
        <CigarActions cigarId={c.id} initialIsWishlisted={isWishlisted} />
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
