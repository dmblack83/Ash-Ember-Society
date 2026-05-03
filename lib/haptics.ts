/* ------------------------------------------------------------------
   Haptic feedback helpers

   Wraps `navigator.vibrate()` with intent-named functions so call
   sites read like "tapHaptic()" instead of "navigator.vibrate(10)".
   Each call is a no-op when:

     - We're not in a browser (SSR / RSC)
     - The browser doesn't support the Vibration API
     - The user has the system vibration setting off

   Platform note: iOS Safari (and iOS PWAs) does NOT implement the
   Web Vibration API. There is no equivalent — Apple has no public
   Web haptic API. So these calls are silently no-op on iOS but fire
   on Android (Chrome, Firefox, Samsung Internet). The fallback is
   "no haptic" — there's no replacement we can do at the JS layer.

   Patterns chosen to feel like a real lounge: tap = a light tick,
   success = a quick double-pulse, error = a single firmer thud.
   These map roughly to UIImpactFeedbackGenerator's .light / .success
   / .error if/when iOS ships a Web haptic API.
   ------------------------------------------------------------------ */

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw if vibration is disabled at the OS level;
    // swallow because haptics are always best-effort.
  }
}

/** Light tick. Use for taps on small interactive elements: stars,
    chips, toggles, like buttons. */
export function tapHaptic(): void {
  vibrate(10);
}

/** Quick double-pulse. Use when a multi-step action completes
    successfully: Burn Report filed, photo uploaded, etc. */
export function successHaptic(): void {
  vibrate([15, 60, 25]);
}

/** Single firm thud. Use for soft failures: form validation rejects,
    optimistic action rolled back. */
export function errorHaptic(): void {
  vibrate(40);
}
