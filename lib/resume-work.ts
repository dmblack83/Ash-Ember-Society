/* ------------------------------------------------------------------
   Resume work — pure decision logic for what (if anything) to do when
   the installed PWA returns to the foreground.

   WHY router.refresh() IS NOT AN OPTION HERE (the bug this fixes)
   ──────────────────────────────────────────────────────────────
   ResumeHandler used to call router.refresh() on resume and on a stale
   relaunch to pull fresh per-user data. On a cold network the resulting
   RSC round-trip takes ~15s, and while it is in flight the App Router is
   left pending — so navigation to any server-coupled route (e.g. the SSR
   /home dashboard) QUEUES behind it ("tap Home, nothing happens, then it
   snaps in after ~15s"). Static client shells (/humidor, /lounge) are
   served by the service worker with no server round-trip, so they kept
   working — which is exactly the split users reported.

   So the correct resume work is limited to NON-BLOCKING, fire-and-forget
   effects:
     - "revalidate-data":        background SWR revalidation of every
                                  mounted key (same action as pull-to-
                                  refresh). This is what brings in other
                                  users' new posts/comments after the app
                                  was backgrounded. It exists because the
                                  old assumption "SWR revalidates on
                                  navigation" is NOT true everywhere: the
                                  lounge feed (useSWRInfinite +
                                  revalidateFirstPage:false + the
                                  persistent localStorage cache) serves
                                  cached pages on mount with no background
                                  check, and revalidateOnFocus is globally
                                  off. Without this effect, users had to
                                  pull-to-refresh or force close to see
                                  new content.
     - "refresh-session":        pre-warm auth so the next request doesn't
                                  hit the proxy's expired-token slow path
                                  (iOS standalone only — the eviction case)
     - "service-worker-update":  cheap revalidation of /sw.js to pick up a
                                  deploy that shipped while backgrounded

   None of these block the App Router, so none can wedge navigation.

   This module is pure (no DOM / timers) so the gating is unit-testable.
   The wiring lives in components/system/ResumeHandler.tsx.
   ------------------------------------------------------------------ */

/** Debounce repeated resume signals (visibilitychange + pageshow can both
 *  fire on a single return). */
export const MIN_RESUME_INTERVAL_MS = 2_000;

/* Below this background gap, a resume gets the auth pre-warm + SW check
   but data revalidation may still run (see the data threshold below).
   5 min is long enough that quick app-switches stay instant, short enough
   that a genuine "came back later" gets one auth pre-warm + SW check. */
export const RESUME_REFRESH_THRESHOLD_MS = 5 * 60 * 1_000;

/* Background gap past which returning to the app revalidates mounted SWR
   keys in the background. Content from other users (lounge posts,
   comments, likes) realistically changes on this timescale, and the cost
   is bounded: only keys with a mounted hook refetch — a handful of
   Supabase queries, the same load as one pull-to-refresh. Below this gap
   a resume does NO work at all: a quick app-switch already has fresh-
   enough data and must stay instant. */
export const RESUME_DATA_REVALIDATE_THRESHOLD_MS = 60 * 1_000;

/* If the sessionStorage heartbeat is older than this, JS was likely dead
   for an extended period (iOS heap eviction). 90s is well past one 60s
   heartbeat interval. */
export const HEARTBEAT_STALE_MS = 90 * 1_000;

/** Non-blocking resume side effects. Deliberately does NOT include any
 *  router refresh or full reload — see the module header. */
export type ResumeEffect =
  | "refresh-session"
  | "service-worker-update"
  | "revalidate-data";

export interface ResumeInput {
  online: boolean;
  /** iOS PWA added to the Home Screen — the only context that pre-warms
   *  auth (heap eviction expires the token there). */
  iosStandalone: boolean;
  now: number;
  /** Epoch-ms of the last processed resume, 0 if none. Debounce anchor. */
  lastResumeAt: number;
  /** Epoch-ms the tab was last hidden in THIS JS context, or null if no
   *  hide was recorded (e.g. a brand-new context after heap eviction). */
  hiddenAt: number | null;
}

export interface ResumeWork {
  /** True when the throttle + background-gap gates passed AND effects were
   *  produced. The caller should advance its lastResumeAt anchor only when
   *  this is true — a no-work resume must not consume the debounce window. */
  act: boolean;
  effects: ResumeEffect[];
}

const NO_WORK: ResumeWork = { act: false, effects: [] };

/** Decide what resume work to run. Returns only non-blocking effects, so
 *  resume can never wedge the App Router (see module header). */
export function decideResumeWork(i: ResumeInput): ResumeWork {
  // Offline: both effects need the network; skip and let the next
  // visibilitychange/pageshow on reconnect re-fire naturally.
  if (!i.online) return NO_WORK;

  // Debounce duplicate resume signals.
  if (i.now - i.lastResumeAt < MIN_RESUME_INTERVAL_MS) return NO_WORK;

  // Only act after a MEANINGFUL background gap. null = no hide recorded in
  // this context → treat as no gap and skip (the stale-revive path handles
  // a fresh post-eviction context separately).
  const backgroundGap = i.hiddenAt !== null ? i.now - i.hiddenAt : null;
  if (backgroundGap === null || backgroundGap < RESUME_DATA_REVALIDATE_THRESHOLD_MS) {
    return NO_WORK;
  }

  const effects: ResumeEffect[] = [];
  // Auth pre-warm + SW check keep their original, longer gate — they only
  // pay off after a genuinely long absence.
  if (backgroundGap >= RESUME_REFRESH_THRESHOLD_MS) {
    if (i.iosStandalone) effects.push("refresh-session");
    effects.push("service-worker-update");
  }
  // Data freshness gates lower: other users' content changes on the
  // minutes timescale.
  effects.push("revalidate-data");
  return { act: true, effects };
}

export interface StaleReviveInput {
  iosStandalone: boolean;
  /** Last sessionStorage heartbeat in epoch-ms, 0 if none. */
  lastHeartbeat: number;
  now: number;
}

/** Decide whether a fresh mount looks like a revival after a long JS-dead
 *  stretch (iOS heap eviction). When true the caller pre-warms auth — but,
 *  per Option 1, does NOT router.refresh(); SWR revalidates on the user's
 *  first navigation. */
export function decideStaleRevive(i: StaleReviveInput): { reviveStale: boolean } {
  const reviveStale =
    i.iosStandalone &&
    i.lastHeartbeat > 0 &&
    i.now - i.lastHeartbeat > HEARTBEAT_STALE_MS;
  return { reviveStale };
}
