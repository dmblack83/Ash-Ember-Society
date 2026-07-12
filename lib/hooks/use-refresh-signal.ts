"use client";

import { useEffect, useRef } from "react";

/* ------------------------------------------------------------------
   Refresh signal — lets "refresh everything" reach useSWRInfinite.

   The app's global refresh paths (pull-to-refresh, resume-after-
   background) call SWR's `mutate(() => true)`. That broadcast does
   NOT force infinite feeds: swr/infinite only refetches a page on
   `revalidateAll || forceRevalidateAll || uncached || (revalidate-
   FirstPage && page 0)`, and the force flag is set exclusively by the
   hook's own bound mutate. Feeds configured with
   `revalidateFirstPage: false` (lounge, discover cigars) therefore
   refetched ZERO pages on a global refresh — pull-to-refresh spun and
   changed nothing.

   Fix: refresh emitters dispatch this signal alongside the global
   mutate; each infinite feed registers its bound mutate via
   useRefreshSignal. Listeners run synchronously during dispatch and
   hand their in-flight promise back through `register`, so the
   emitter can await ALL real work — the pull-to-refresh spinner stays
   up until the feeds actually finish.
   ------------------------------------------------------------------ */

const REFRESH_EVENT = "ae:refresh-all";

interface RefreshDetail {
  register: (work: Promise<unknown>) => void;
}

/** Ask every registered feed to force-refresh. Resolves when all
 *  registered work settles (never rejects — refresh is best-effort). */
export function emitRefreshSignal(): Promise<unknown> {
  if (typeof window === "undefined") return Promise.resolve();
  const work: Promise<unknown>[] = [];
  window.dispatchEvent(
    new CustomEvent<RefreshDetail>(REFRESH_EVENT, {
      detail: { register: (p) => work.push(p) },
    }),
  );
  return Promise.allSettled(work);
}

/** Register a forced-refresh callback (typically a useSWRInfinite
 *  bound mutate) to run whenever a global refresh is emitted. */
export function useRefreshSignal(refresh: () => Promise<unknown>): void {
  const ref = useRef(refresh);
  useEffect(() => {
    ref.current = refresh;
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<RefreshDetail>).detail;
      const p = Promise.resolve(ref.current()).catch(() => {
        /* feed's own error handling owns retries */
      });
      detail?.register?.(p);
    };
    window.addEventListener(REFRESH_EVENT, handler);
    return () => window.removeEventListener(REFRESH_EVENT, handler);
  }, []);
}
