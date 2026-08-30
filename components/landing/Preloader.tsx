// components/landing/Preloader.tsx
/* Session-gated preloader. The inline script runs at parse time (before
   hydration) so repeat visitors never see a flash; motion.ts owns the
   animated run and removal on first visit. */
const HIDE_IF_SEEN = `try{if(sessionStorage.getItem("ae-preloader-seen")==="1"){var p=document.getElementById("ae-preloader");if(p)p.style.display="none"}}catch(e){}`;

export function Preloader() {
  return (
    <>
      <div className="preloader" id="ae-preloader" data-preloader aria-hidden="true">
        <div className="mark">Ash <em>&</em> Ember</div>
        <div className="rule"><i data-preloader-bar /></div>
        <div className="tag">A Society Journal of Smoke &amp; Patience</div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: HIDE_IF_SEEN }} />
      <noscript>
        <style>{`[data-preloader]{display:none}`}</style>
      </noscript>
    </>
  );
}
