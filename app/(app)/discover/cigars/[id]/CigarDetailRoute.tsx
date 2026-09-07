"use client";

import useSWR from "swr";
import { notFound } from "next/navigation";
import { useGatedSession } from "@/lib/auth/use-gated-session";
import { keyFor } from "@/lib/data/keys";
import { fetchCigarDetail, fetchLineSiblings } from "@/lib/data/cigar-fetchers";
import { type SizeChild } from "@/lib/cigars/line-group";
import { CigarDetailClient } from "@/components/cigars/CigarDetailClient";
import { CigarDetailSkeleton } from "./_skeletons";

/**
 * Client entry for the cigar detail shell. The catalog row is public
 * data cached under keyFor.cigar (shared across users). Once the row
 * lands, its (brand, series) drive a dependent fetch of every sibling
 * size in the line — the wishlist flag is no longer fetched here; it
 * moves into CigarActions, keyed per selected child.
 */
export function CigarDetailRoute({ cigarId }: { cigarId: string }) {
  const { allowed, session } = useGatedSession();

  const { data: cigar } = useSWR(
    allowed ? keyFor.cigar(cigarId) : null,
    () => fetchCigarDetail(cigarId),
  );

  /* Size rows of this line — dependent on the cigar row (brand +
     series drive the group). Null-brand rows are their own group. */
  const { data: siblings } = useSWR(
    allowed && cigar?.brand ? keyFor.lineSiblings(cigar.brand, cigar.series) : null,
    () => fetchLineSiblings(cigar!.brand as string, cigar!.series),
  );

  if (!allowed || !session || cigar === undefined) return <CigarDetailSkeleton />;
  if (cigar === null) notFound();

  const sizeRows: SizeChild[] = cigar.brand
    ? (siblings ?? [])
    : [{
        id: cigar.id, name: cigar.name, format: cigar.format,
        ring_gauge: cigar.ring_gauge, length_inches: cigar.length_inches,
        image_url: cigar.image_url,
        shade: cigar.shade, wrapper: cigar.wrapper,
        wrapper_country: cigar.wrapper_country,
        binder_country: cigar.binder_country,
        filler_countries: cigar.filler_countries,
        community_added: cigar.community_added, approved: cigar.approved,
      }];
  if (cigar.brand && siblings === undefined) return <CigarDetailSkeleton />;

  /* key: navigating detail→detail (different cigar) must reset the
     size selection — without a remount, selectedId would go stale. */
  return <CigarDetailClient key={cigar.id} cigar={cigar} siblings={sizeRows} />;
}
