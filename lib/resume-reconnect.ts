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

/** Rolling window over which reconnect reloads are counted. A reload
 *  older than this no longer counts against the budget — so a legitimate
 *  dead-socket resume hours (or minutes) later can still recover.
 *
 *  WHY THIS REPLACED A LIFETIME CAP: the old guard capped reloads per
 *  *session* using a monotonic counter in sessionStorage. On an installed
 *  iOS PWA, sessionStorage survives suspend/resume and the browsing
 *  context lives for days, so the counter only ever climbed and, once it
 *  hit the cap, the reconnect reload never fired again — the app silently
 *  reverted to the full ~20s dead-socket hang on every resume. ("Perfect
 *  for a day or two, then degraded.") A rolling window keeps the loop
 *  protection but lets the budget refill. */
export const RELOAD_WINDOW_MS = 5 * 60_000;

/** Max reconnect reloads allowed inside one rolling window — defence
 *  against a reload loop if a reload somehow fails to fix the connection.
 *  A genuine loop (reload → still broken → reload) burns through this in
 *  well under the window; normal resume-spaced reloads do not. */
export const MAX_RELOADS_PER_WINDOW = 3;

/** Minimum spacing between reconnect reloads, so two resume signals in
 *  quick succession can't double-reload. */
export const RELOAD_COOLDOWN_MS = 15_000;

/** Outcome of the probe fetch.
 *  - "ok":      resolved (any HTTP status) → connection is alive
 *  - "timeout": aborted by our timeout      → dead-socket signature
 *  - "error":   rejected fast (network)     → hard failure, not a stall */
export type ProbeResult = "ok" | "timeout" | "error";

export type ReconnectDecision =
  | { action: "none"; reason: "healthy" | "fast_error" | "offline" | "rate_limited" | "cooldown" }
  | { action: "reload" };

export interface ReconnectInput {
  online: boolean;
  probeResult: ProbeResult;
  /** Epoch-ms timestamps of prior reconnect reloads, persisted across
   *  reloads. Stale entries (older than RELOAD_WINDOW_MS) are ignored, so
   *  the caller can keep appending without ever pruning. */
  recentReloadTimestamps: number[];
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

  const inWindow = i.recentReloadTimestamps.filter(
    (ts) => i.now - ts < RELOAD_WINDOW_MS,
  );
  const lastReloadAt = inWindow.length > 0 ? Math.max(...inWindow) : 0;

  if (i.now - lastReloadAt < RELOAD_COOLDOWN_MS) {
    return { action: "none", reason: "cooldown" };
  }
  if (inWindow.length >= MAX_RELOADS_PER_WINDOW) {
    return { action: "none", reason: "rate_limited" };
  }
  return { action: "reload" };
}
