import { EditBurnReportRoute } from "./EditBurnReportRoute";

/*
 * Burn-report edit — client shell (same pattern as /humidor). The
 * report + thirds + tags + byline assembly that used to run here
 * server-side now runs client-side in
 * lib/data/burn-report-page-fetchers.ts (ownership enforced by RLS +
 * explicit eq). The route stays dynamic (path param) but the document
 * carries no data, so entering edit mode paints instantly.
 */
export default async function EditBurnReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditBurnReportRoute smokeLogId={id} />;
}
