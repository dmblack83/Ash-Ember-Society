import { createClient }  from "@/utils/supabase/server";
import { getServerUser } from "@/lib/auth/server-user";
import { getProfileLite } from "@/lib/data/profile";
import { getFlavorTags }  from "@/lib/data/flavor-tags";
import { notFound, redirect } from "next/navigation";
import { BurnReport, type BurnReportExisting } from "@/components/humidor/BurnReport";
import type { BurnReportItem, PartnerVideo, FlavorTag } from "@/app/(app)/humidor/[id]/burn-report/page";

export const runtime = "edge";

/* ------------------------------------------------------------------
   Edit page — server component

   Loads an existing smoke_log + its burn_reports child by id, builds
   a BurnReportItem-shaped object so the wizard renders the same cigar
   context it does in create mode, and hands the report fields to
   <BurnReport mode="edit" />.

   The wizard reuses every step component; the differences vs create
   live in the wizard's edit branch — footer (Back/Next + Save/Cancel),
   PATCH submit, no draft autosave, no success screen.
   ------------------------------------------------------------------ */

export default async function EditBurnReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const user     = await getServerUser();
  if (!user) redirect("/login");

  /* Load report + cigar + thirds child in one PostgREST round-trip.
     Ownership is enforced by .eq("user_id", user.id) so a malicious
     id from the URL can't reveal someone else's report. */
  const { data: report, error: reportError } = await supabase
    .from("smoke_logs")
    .select(`
      id,
      cigar_id,
      humidor_item_id,
      smoked_at,
      overall_rating,
      location,
      occasion,
      pairing_drink,
      pairing_food,
      draw_rating,
      burn_rating,
      construction_rating,
      flavor_rating,
      flavor_tag_ids,
      photo_urls,
      review_text,
      smoke_duration_minutes,
      content_video_id,
      cigar:cigar_catalog(id, brand, series, format, image_url, wrapper),
      burn_report:burn_reports(thirds_enabled, third_beginning, third_middle, third_end)
    `)
    .eq("id",      id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (reportError || !report || !report.cigar) notFound();

  /* PostgREST sometimes returns embedded relations as arrays (when
     the relation isn't marked unique) and sometimes as a bare object.
     Normalize to a single value so the rest of the page is shape-safe. */
  const cigar = Array.isArray(report.cigar) ? report.cigar[0] : report.cigar;
  if (!cigar) notFound();

  const [profile, flavorTagData] = await Promise.all([
    getProfileLite(user.id),
    getFlavorTags(),
  ]);
  const item: BurnReportItem = {
    id:        report.humidor_item_id ?? id,
    cigar_id:  report.cigar_id,
    quantity:  0,
    cigar: {
      id:        cigar.id,
      brand:     cigar.brand,
      series:    cigar.series,
      format:    cigar.format,
      image_url: cigar.image_url,
      wrapper:   cigar.wrapper,
    },
  };

  /* The 1:1 burn_reports child returns as an array via PostgREST. */
  const thirdsRaw = report.burn_report;
  const thirds    = Array.isArray(thirdsRaw) ? thirdsRaw[0] : thirdsRaw;

  /* Compute the report's display number from chronological position
     so the header shows the same "NO. X" the user saw in the list.
     `count` query is cheap — no row data, just a tally up to the
     report's smoked_at. */
  const reportSmokedAt = report.smoked_at as string;
  const { count: olderOrEqual } = await supabase
    .from("smoke_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .lte("smoked_at", reportSmokedAt);

  const reportNumber = olderOrEqual ?? 1;

  const partnerVideos: PartnerVideo[] = [];

  const existing: BurnReportExisting = {
    smoke_log_id:           report.id,
    smoked_at:              report.smoked_at,
    overall_rating:         report.overall_rating ?? 75,
    location:               report.location ?? "",
    occasion:               report.occasion ?? "",
    pairing_drink:          report.pairing_drink ?? "",
    pairing_food:           report.pairing_food ?? "",
    draw_rating:            report.draw_rating ?? 0,
    burn_rating:            report.burn_rating ?? 0,
    construction_rating:    report.construction_rating ?? 0,
    flavor_rating:          report.flavor_rating ?? 0,
    flavor_tag_ids:         report.flavor_tag_ids ?? [],
    review_text:            report.review_text ?? "",
    smoke_duration_minutes: report.smoke_duration_minutes != null
      ? String(report.smoke_duration_minutes)
      : "",
    content_video_id:       report.content_video_id ?? null,
    photo_urls:             report.photo_urls ?? [],
    thirds_enabled:         thirds?.thirds_enabled ?? false,
    third_beginning:        thirds?.third_beginning ?? "",
    third_middle:           thirds?.third_middle    ?? "",
    third_end:              thirds?.third_end       ?? "",
  };

  return (
    <BurnReport
      mode="edit"
      existing={existing}
      item={item}
      flavorTags={flavorTagData as FlavorTag[]}
      partnerVideos={partnerVideos}
      displayName={profile?.display_name ?? null}
      city={profile?.city ?? null}
      reportNumber={reportNumber}
    />
  );
}
