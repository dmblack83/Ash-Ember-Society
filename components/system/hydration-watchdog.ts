/* ------------------------------------------------------------------
   Hydration watchdog script

   Inline <script> in <head>: starts a 15-second timer at parse time.
   If `window.__AE_HYDRATED` isn't set to true by then (a flag the
   <HydrationMark /> client component sets in a root useEffect on
   successful hydration), the watchdog forces a single reload.

   This is the catch-all for hangs that aren't covered by the
   stale-chunk recovery path: silent hydration crashes, third-party
   script blocks, anything that prevents React from mounting without
   throwing a load-failure event on a chunk.

   Rate-limited to ONE reload per session via sessionStorage. If
   the reload also hangs, the watchdog gives up rather than looping
   indefinitely.

   The 15-second budget is well past any legitimate hydration time
   (Speed Insights p99 < 5s on this app). Tunable via the constant.

   Performance mark: `ae:watchdog-fired` lands on the User Timing
   track when this path triggers — diagnostic signal for next-time
   debugging.
   ------------------------------------------------------------------ */

export const HYDRATION_BUDGET_MS = 15000;

export const HYDRATION_WATCHDOG_SCRIPT = `(function(){try{
var KEY='ae-hydrate-watchdog-tries';
var BUDGET=${HYDRATION_BUDGET_MS};
var tries=parseInt(sessionStorage.getItem(KEY)||'0',10);
if(tries>=1)return;

window.__AE_WATCHDOG_TIMER=setTimeout(function(){
  if(window.__AE_HYDRATED===true)return;
  sessionStorage.setItem(KEY,String(tries+1));
  if(window.performance&&performance.mark){
    try{performance.mark('ae:watchdog-fired');}catch(_){}
  }
  location.reload();
},BUDGET);
}catch(_){}})();`;
