/* ------------------------------------------------------------------
   Cold-smoke init script — extracted to a pure-TS file so the script
   string can be imported by next.config.ts (which can't pull from
   .tsx files in some build paths) for CSP hash computation.

   Source-of-truth lives here. ColdOpenSmoke.tsx re-exports for the
   existing import path (@/components/cold-open-smoke/ColdOpenSmoke).
   ------------------------------------------------------------------ */

/** Minimum gap between cold-smoke shows.
 *
 *  iOS kills the PWA process under memory pressure (~5 min background).
 *  When the process is killed and the user taps the home-screen icon,
 *  the page fully reloads — that IS a cold launch and the overlay
 *  should show.
 *
 *  The throttle prevents the overlay replaying on quick external-link
 *  round-trips (user opens a link, reads it, returns within ~1-2 min
 *  while iOS kills the process anyway). 5 min covers that case without
 *  suppressing genuine cold launches after the process has been killed. */
export const COLD_SMOKE_THROTTLE_MS = 5 * 60 * 1000;

/** Inline script — runs synchronously in <head> before the body paints.
    Adds `cold-smoke-active` to <html> when conditions are met, which
    triggers the CSS rule that displays the server-rendered overlay. */
export const COLD_SMOKE_INIT_SCRIPT = `(function(){try{
var d=document,t=Date.now();
var pwa=navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
var mob=matchMedia('(max-width: 768px)').matches;
if(!pwa||!mob)return;
if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
var last=parseInt(localStorage.getItem('coldSmokeLastShown')||'0',10);
if(t-last<${COLD_SMOKE_THROTTLE_MS})return;
localStorage.setItem('coldSmokeLastShown',t.toString());
d.documentElement.classList.add('cold-smoke-active');
}catch(e){}})();`;
