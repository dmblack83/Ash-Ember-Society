/* ------------------------------------------------------------------
   Hydration watchdog script

   Inline <script> in <head>: starts a 15-second timer at parse time.
   If `window.__AE_HYDRATED` isn't set to true by then (a flag the
   <HydrationMark /> client component sets in a root useEffect on
   successful hydration), the watchdog fires.

   Non-iOS: forces a single reload (existing behaviour).

   iOS PWA standalone: location.reload() triggered programmatically
   freezes WKWebView. Instead, inject a full-screen overlay with a
   user-triggered "Refresh" button. User-initiated navigation goes
   through the standard WKWebView pipeline and completes reliably.

   Rate-limited to ONE action per session via sessionStorage. Tries
   are incremented before injecting the overlay so that if the reload
   fails and the user is sent back here again, we don't loop on the
   overlay.

   Performance mark: `ae:watchdog-fired` lands on the User Timing
   track when this path triggers — diagnostic signal for debugging.
   ------------------------------------------------------------------ */

export const HYDRATION_BUDGET_MS = 15000;

export const HYDRATION_WATCHDOG_SCRIPT = `(function(){try{
var KEY='ae-hydrate-watchdog-tries';
var BUDGET=${HYDRATION_BUDGET_MS};
var tries=parseInt(sessionStorage.getItem(KEY)||'0',10);
if(tries>=1)return;

var isIOSPWA=/iPad|iPhone|iPod/.test(navigator.userAgent)&&
  (window.matchMedia('(display-mode: standalone)').matches||
   !!navigator.standalone);

window.__AE_WATCHDOG_TIMER=setTimeout(function(){
  if(window.__AE_HYDRATED===true)return;
  sessionStorage.setItem(KEY,String(tries+1));
  if(window.performance&&performance.mark){
    try{performance.mark('ae:watchdog-fired');}catch(_){}
  }
  if(isIOSPWA){
    var overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;background:#1A1210;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;';
    var msg=document.createElement('p');
    msg.style.cssText='color:#A69080;margin:0 0 24px;font-size:15px;font-family:Inter,sans-serif;text-align:center;padding:0 24px;';
    msg.textContent='A new version is available. Refresh to update.';
    var btn=document.createElement('button');
    btn.style.cssText='background:#C17817;color:#F5E6D3;border:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;';
    btn.textContent='Refresh';
    btn.onclick=function(){window.location.reload();};
    overlay.appendChild(msg);
    overlay.appendChild(btn);
    document.body.appendChild(overlay);
  }else{
    location.reload();
  }
},BUDGET);
}catch(_){}})();`;
