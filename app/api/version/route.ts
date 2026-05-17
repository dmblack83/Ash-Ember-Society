import { NextResponse } from "next/server";

export const runtime = "edge";

/* GET /api/version
 *
 * Returns the commit SHA of the currently-deployed build. Compared
 * client-side against the SHA inlined into the loaded JS bundle at
 * build time; a mismatch means the user is holding stale chunks
 * after a deploy and we surface a "new version available" banner.
 *
 * Cache: explicitly no-store. The whole point is to read the live
 * value of the deployment, not a cached one.
 */
export async function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const response = NextResponse.json({ commit });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
