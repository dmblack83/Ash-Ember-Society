import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Divider } from "@/components/ui/divider";
import { CigarActions } from "@/components/cigars/CigarActions";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface CigarDetail {
  id: string;
  brand: string;
  line: string;
  name: string;
  vitola: string;
  wrapper: string;
  binder: string | null;
  filler: string | null;
  country: string;
  strength: string;
  ring_gauge: number | null;
  length_inches: number | null;
  msrp_cents: number | null;
  image_url: string | null;
  avg_rating: number | null;
  total_ratings: number | null;
  total_smoked: number | null;
  is_verified: boolean;
}

/* ------------------------------------------------------------------
   Strength badge styles — mirrors discover page
   ------------------------------------------------------------------ */

const STRENGTH_LABEL: Record<string, string> = {
  mild:         "Mild",
  mild_medium:  "Mild-Medium",
  medium:       "Medium",
  medium_full:  "Medium-Full",
  full:         "Full",
};

function strengthStyle(s: string): { backgroundColor: string; color: string } {
  const map: Record<string, { backgroundColor: string; color: string }> = {
    mild:         { backgroundColor: "#1E3A2A", color: "#5A9A72" },
    mild_medium:  { backgroundColor: "#2A2A1A", color: "#8A8A42" },
    medium:       { backgroundColor: "var(--secondary)", color: "#C17817" },
    medium_full:  { backgroundColor: "#2A1A0A", color: "#C17817" },
    full:         { backgroundColor: "#2A1010", color: "#C44536" },
  };
  return (
    map[s] ?? {
      backgroundColor: "var(--muted)",
      color: "var(--muted-foreground)",
    }
  );
}

/* ------------------------------------------------------------------
   Sub-components
   ------------------------------------------------------------------ */

function CigarPlaceholderLarge() {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <svg
        width="160"
        height="44"
        viewBox="0 0 160 44"
        fill="none"
        aria-hidden="true"
        className="text-muted-foreground/25"
      >
        <rect x="12" y="14" width="116" height="16" rx="8" fill="currentColor" />
        <ellipse cx="128" cy="22" rx="20" ry="10" fill="currentColor" opacity="0.65" />
        <rect x="6" y="14" width="10" height="16" rx="4" fill="currentColor" opacity="0.45" />
        <rect x="42" y="14" width="18" height="16" rx="2" fill="currentColor" opacity="0.22" />
        <ellipse cx="8" cy="22" rx="5" ry="5" fill="#E8642C" opacity="0.4" />
      </svg>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card text-center py-5 px-4">
      <p
        className="text-4xl font-bold text-foreground"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-sm text-muted-foreground mt-0.5">{sub}</p>
      )}
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium mt-2">
        {label}
      </p>
    </div>
  );
}

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
    .from("cigars")
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
  const badge = strengthStyle(c.strength);

  const subtitle =
    c.name && c.name !== c.line ? c.name : null;

  /* Build details list — omit null/undefined fields */
  const details: { label: string; value: string }[] = [
    { label: "Wrapper", value: c.wrapper },
    c.binder ? { label: "Binder", value: c.binder } : null,
    c.filler ? { label: "Filler", value: c.filler } : null,
    { label: "Country", value: c.country },
    c.ring_gauge != null
      ? { label: "Ring Gauge", value: String(c.ring_gauge) }
      : null,
    c.length_inches != null
      ? { label: "Length", value: `${c.length_inches}"` }
      : null,
    c.msrp_cents != null
      ? { label: "MSRP", value: `$${(c.msrp_cents / 100).toFixed(2)}` }
      : null,
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
        {/* Image */}
        <div className="w-full sm:w-72 aspect-[4/3] rounded-xl overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
          {c.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.image_url}
              alt={`${c.brand} ${c.line}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <CigarPlaceholderLarge />
          )}
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
            {c.line}
          </h1>
          {subtitle && (
            <p className="text-base text-foreground/75 -mt-1">{subtitle}</p>
          )}
          <p className="text-sm text-muted-foreground">{c.vitola}</p>

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span
              className="badge text-xs px-3 py-1 rounded-full font-medium"
              style={badge}
            >
              {STRENGTH_LABEL[c.strength] ?? c.strength}
            </span>
            {c.is_verified && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="6"
                    cy="6"
                    r="5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M3.5 6L5.5 8L8.5 4"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Verified
              </span>
            )}
          </div>

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

      {/* ── Community stats ──────────────────────────────────────── */}
      <section className="space-y-4 animate-slide-up">
        <h2>Community</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Avg. Rating"
            value={c.avg_rating != null ? c.avg_rating.toFixed(1) : "—"}
            sub={c.avg_rating != null ? "/ 10" : undefined}
          />
          <StatCard
            label="Ratings"
            value={String(c.total_ratings ?? 0)}
          />
          <StatCard
            label="Smoked"
            value={String(c.total_smoked ?? 0)}
          />
        </div>
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
