import { CigarDetailRoute } from "./CigarDetailRoute";

/*
 * Cigar detail — client shell (same pattern as /humidor). The cached
 * catalog read + wishlist check that used to run here server-side now
 * run client-side in lib/data/cigar-fetchers.ts; the catalog row is
 * SWR-cached under keyFor.cigar so revisits render instantly. The
 * route stays dynamic (path param) but the document carries no data.
 */
export default async function CigarDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CigarDetailRoute cigarId={id} />;
}
