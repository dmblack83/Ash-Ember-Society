import { trackReliability } from "./reliability";

/*
 * Inspect a Response that came back from a fetch the caller cares
 * about. Fires `body_too_large` for 413; no-op otherwise. Designed
 * to be called on the response of every body-carrying client fetch
 * that could exceed Vercel's 4.5 MB limit (image upload paths).
 *
 * Returns the response unchanged so it can be inlined:
 *   const res = checkResponse(await fetch(url, init), { route });
 */
export function checkResponse(res: Response, ctx: { route: string }): Response {
  if (res.status === 413) {
    trackReliability({
      bucket:  "network_resilience",
      subtype: "body_too_large",
      cause:   "http_413",
      detail:  ctx.route,
    });
  }
  return res;
}
