import { NextResponse } from "next/server";

export const runtime = "edge";

/* POST /api/diagnostics/sw-state
 *
 * Receives a JSON blob describing the ServiceWorker lifecycle state at
 * the moment of a push-subscribe timeout (lib/push-client.ts). Just
 * console.warns the payload — Vercel's runtime log capture surfaces it
 * in the project's Logs tab, where we can grep / filter for patterns.
 *
 * No persistence, no auth, no rate limit:
 *   - this fires only on a 120-second timeout, so volume is naturally
 *     bounded by how often a user retries push enable
 *   - the body shape is harmless (SW state, document URL, userAgent,
 *     no credentials or PII)
 *   - we want zero friction between the failure and the data
 *
 * If we ever need queryable history, swap the console.warn for a
 * Supabase insert into a small diagnostics table. Not needed yet.
 *
 * Existence and behavior of this endpoint is part of the gate documented
 * in PR #471: if push timeouts keep recurring after the precache-removal
 * fix, capture data here BEFORE attempting any further fix.
 */
export async function POST(request: Request) {
  try {
    const body = await request.text();
    // Single-line JSON so each timeout produces one greppable log entry.
    console.warn(`[diagnostics/sw-state] ${body}`);
  } catch (e) {
    console.error("[diagnostics/sw-state] failed to read body:", e);
  }
  return new NextResponse(null, { status: 204 });
}
