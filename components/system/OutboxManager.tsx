"use client";

/* ------------------------------------------------------------------
   OutboxManager — client-side glue for the offline mutation outbox.

   Three responsibilities:

   1. Cross-user safety. On mount (every (app)-route load), drop any
      outbox records whose user_id doesn't match the currently-signed-
      in user. Prevents User A's queued mutations from replaying under
      User B's session on shared devices.

   2. Online-trigger replay. The Background Sync API isn't supported
      in Safari (the very browser most likely to be PWA-installed).
      As a fallback, listen for window's `online` event and request
      a SW sync (which then no-ops if SyncManager isn't there, but
      at least Chromium/Firefox get the standard path).

   3. Eager replay on mount. If records exist for the current user
      and we're online, request a sync immediately so a return-to-app
      after offline drains the queue without waiting for the next
      online flap.

   Mounted from app/(app)/layout.tsx. Auth-route layouts don't get
   this — by definition there's no authenticated user there to scope
   the outbox to.
   ------------------------------------------------------------------ */

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  clearMutationsExceptUser,
  listMutations,
  requestBackgroundSync,
} from "@/lib/offline-outbox";

export function OutboxManager() {
  useEffect(() => {
    let cancelled = false;

    async function reconcileAndReplay(): Promise<void> {
      if (cancelled) return;

      const { data: { user } } = await createClient().auth.getUser();
      if (cancelled) return;

      /* No authed user yet (e.g., SSR/auth-cookie still loading) —
         skip, we'll re-run on next online event or unmount/remount. */
      if (!user) return;

      try {
        await clearMutationsExceptUser(user.id);
      } catch {
        /* IDB unavailable or schema mismatch — bail; outbox is a
           best-effort feature, never block normal UX. */
        return;
      }

      try {
        const pending = await listMutations(user.id);
        if (pending.length === 0) return;
        if (typeof navigator !== "undefined" && navigator.onLine) {
          await requestBackgroundSync();
        }
      } catch {
        /* same: silent fail */
      }
    }

    /* Initial reconcile + replay on mount. */
    void reconcileAndReplay();

    /* Replay when connectivity returns. */
    const onOnline = () => { void reconcileAndReplay(); };
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
