/* ------------------------------------------------------------------
   Resume reconnect — dead-socket detection logic

   Root cause this addresses: when iOS suspends the installed PWA, the
   keep-alive connection to the app's own origin dies silently. The
   browser's connection pool still believes the socket is alive, so on
   resume the first navigation/RSC request is dispatched onto the dead
   socket and stalls ~20-23s waiting for the OS transport timeout before
   failing over to a fresh connection. The app appears hung the entire
   time.

   Confirmed by Sentry network_resilience.cold_transport_slow on
   2026-06-16: ttfb_ms ~23300 while connect_ms / dns_ms / tls_ms were
   all 0 (connection reused, not re-established) and Vercel function
   logs showed <10ms — so the time is pure transport stall on a zombie
   socket, not server compute.

   Strategy: on resume after a meaningful background gap, fire one cheap
   same-origin probe with a short timeout. A same-origin request shares
   the same connection (HTTP/2 multiplexed / HTTP/3 single connection),
   so the probe exercises the exact socket the next real request would.
   If it times out, the socket is dead → force a full reload. The reload
   paints the service worker's cached navigation shell instantly and
   re-establishes connections in a fresh page context, turning a 20s
   blank hang into a sub-second refresh.

   This module holds only the pure decision logic so it is unit-testable
   without a DOM. The wiring lives in
   components/system/ResumeReconnect.tsx.
   ------------------------------------------------------------------ */

/** Cheap same-origin, no-store GET. Not matched by any SW runtime cache
 *  rule, so it passes through to the network and exercises the real
 *  connection. Reused rather than adding a dedicated endpoint. */
export const PROBE_URL = "/api/version";

/** Abort the probe after this long. The observed dead-socket hang is
 *  ~20-23s; a healthy connection answers in well under a second, so 3s
 *  cleanly separates the two without false positives. */
export const PROBE_TIMEOUT_MS = 3_000;

/** Only act on resumes after a meaningful background gap. The dead
 *  socket only occurs after the OS has had time to drop the connection;
 *  quick task-switches don't need a probe. */
export const RESUME_GAP_MS = 60_000;

/** Hard cap on reconnect reloads per session — defence against a reload
 *  loop if a reload somehow fails to fix the connection. */
export const MAX_RELOADS_PER_SESSION = 2;

/** Minimum spacing between reconnect reloads, so two resume signals in
 *  quick succession can't double-reload. */
export const RELOAD_COOLDOWN_MS = 15_000;

/** Outcome of the probe fetch.
 *  - "ok":      resolved (any HTTP status) → connection is alive
 *  - "timeout": aborted by our timeout      → dead-socket signature
 *  - "error":   rejected fast (network)     → hard failure, not a stall */
export type ProbeResult = "ok" | "timeout" | "error";

export type ReconnectDecision =
  | { action: "none"; reason: "healthy" | "fast_error" | "offline" | "capped" | "cooldown" }
  | { action: "reload" };

export interface ReconnectInput {
  online: boolean;
  probeResult: ProbeResult;
  reloadCount: number;
  lastReloadAt: number;
  now: number;
}

/** Classify a fetch rejection. AbortSignal.timeout rejects with a
 *  DOMException named "TimeoutError"; some engines surface "AbortError".
 *  Anything else (e.g. TypeError "Failed to fetch") is a fast network
 *  error, NOT the stall we target. */
export function classifyProbeError(errName: string | undefined): "timeout" | "error" {
  return errName === "TimeoutError" || errName === "AbortError" ? "timeout" : "error";
}

/** Pure decision: given the probe result and reload-guard state, should
 *  we force a reload? Only a timeout (dead-socket signature) on a device
 *  that reports itself online, within the per-session cap and cooldown,
 *  triggers a reload. A fast error is deliberately ignored — reloading
 *  on a hard-down connection would just loop into the offline page. */
export function decideReconnect(i: ReconnectInput): ReconnectDecision {
  if (i.probeResult === "ok") return { action: "none", reason: "healthy" };
  if (i.probeResult === "error") return { action: "none", reason: "fast_error" };
  // probeResult === "timeout": dead-socket suspected
  if (!i.online) return { action: "none", reason: "offline" };
  if (i.reloadCount >= MAX_RELOADS_PER_SESSION) return { action: "none", reason: "capped" };
  if (i.now - i.lastReloadAt < RELOAD_COOLDOWN_MS) return { action: "none", reason: "cooldown" };
  return { action: "reload" };
}
