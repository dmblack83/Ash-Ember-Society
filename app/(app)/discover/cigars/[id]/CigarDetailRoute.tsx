"use client";

import useSWR from "swr";
import { notFound } from "next/navigation";
import { useGatedSession } from "@/lib/auth/use-gated-session";
import { keyFor } from "@/lib/data/keys";
import {
  fetchCigarDetail,
  fetchCigarWishlisted,
} from "@/lib/data/cigar-fetchers";
import { CigarDetailClient } from "@/components/cigars/CigarDetailClient";
import { CigarDetailSkeleton } from "./_skeletons";

/**
 * Client entry for the cigar detail shell. The catalog row is public
 * data cached under keyFor.cigar (shared across users); the wishlist
 * flag is per-user. The two loads run in parallel; the page renders
 * as soon as the cigar row lands — the wishlist flag only gates the
 * heart state inside CigarActions, so we default it to false rather
 * than blocking the whole page on it.
 */
export function CigarDetailRoute({ cigarId }: { cigarId: string }) {
  const { allowed, session } = useGatedSession();

  const userId = session?.userId ?? null;

  const { data: cigar } = useSWR(
    allowed ? keyFor.cigar(cigarId) : null,
    () => fetchCigarDetail(cigarId),
  );
  const { data: isWishlisted } = useSWR(
    allowed && userId ? keyFor.cigarWishlisted(userId, cigarId) : null,
    () => fetchCigarWishlisted(userId as string, cigarId),
  );

  if (!allowed || !session || cigar === undefined) return <CigarDetailSkeleton />;
  if (cigar === null) notFound();

  /* Wait for the wishlist flag too — CigarActions seeds local state
     from its initial prop, so rendering early with `false` and
     re-rendering later would NOT update the heart. The flag query is
     a single-row index hit that resolves with the cigar row. */
  if (isWishlisted === undefined) return <CigarDetailSkeleton />;

  return <CigarDetailClient cigar={cigar} initialIsWishlisted={isWishlisted} />;
}
