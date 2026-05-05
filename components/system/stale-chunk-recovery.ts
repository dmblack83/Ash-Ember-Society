/* ------------------------------------------------------------------
   Stale-chunk recovery script

   Inline <script> in <head>: catches `error` events on <script> /
   <link> elements (capture phase, before any chunk loads). When a
   `/_next/static/...` resource fails to load — typically because
   the SW served stale HTML referencing a chunk URL that no longer
   exists after a deploy — the handler nukes all caches, unregisters
   the SW, and reloads.

   Rate-limited: max 2 cache-bust reloads per session. After the
   third failure the user sees a broken page rather than an infinite
   loop. Broken page is the lesser evil; infinite hang requires
   force-close.

   Why inline in <head> (not a React component):
   - Must run BEFORE Next's chunk <script> tags are evaluated, or we
     miss the load-failure events for the very chunks we're trying
     to recover from.
   - Doesn't depend on React being hydrated (hydration is part of
     what's broken in this scenario).

   Performance mark: `ae:chunk-load-error` lands on the User Timing
   track so we can see in Speed Insights / DevTools whether this
   path triggered for a hung session.
   ------------------------------------------------------------------ */

export const STALE_CHUNK_RECOVERY_SCRIPT = `(function(){try{
var KEY='ae-chunk-bust-tries';
var MAX_TRIES=2;
var tries=parseInt(sessionStorage.getItem(KEY)||'0',10);
if(tries>=MAX_TRIES)return;

window.addEventListener('error',function(e){
  var t=e.target;
  if(!t||(t.tagName!=='SCRIPT'&&t.tagName!=='LINK'))return;
  var src=t.src||t.href||'';
  if(src.indexOf('/_next/static/')===-1)return;

  // Check try counter again at trigger time — another handler may
  // have incremented it in the same tick.
  var current=parseInt(sessionStorage.getItem(KEY)||'0',10);
  if(current>=MAX_TRIES)return;
  sessionStorage.setItem(KEY,String(current+1));

  if(window.performance&&performance.mark){
    try{performance.mark('ae:chunk-load-error');}catch(_){}
  }

  // Best-effort cache nuke + SW unregister, then hard reload.
  Promise.resolve().then(async function(){
    try{
      if('caches' in window){
        var keys=await caches.keys();
        await Promise.all(keys.map(function(k){return caches.delete(k);}));
      }
      if('serviceWorker' in navigator){
        var regs=await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(function(r){return r.unregister();}));
      }
    }catch(_){}
    location.reload();
  });
},true);
}catch(_){}})();`;
