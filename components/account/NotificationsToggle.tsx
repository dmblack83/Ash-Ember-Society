"use client";

/* ------------------------------------------------------------------
   NotificationsToggle

   A single section card on Account → Profile that controls whether
   THIS browser receives Web Push notifications. Mirrors the visual
   pattern of the existing "Install" affordance just below it.

   States rendered (in priority order):

     1. unsupported   — browser/device can't do Web Push at all.
                        Hidden entirely; section returns null. No
                        clutter for users who can't use the feature.
     2. denied        — user previously blocked notifications. Renders
                        an explanation and links the user to system
                        settings (no Web API to re-prompt by spec).
     3. unsubscribed  — granted-or-default. Shows "Enable" CTA.
     4. subscribed    — already opted in on this browser. Shows
                        "Disable" CTA.

   The component owns its own loading state for the subscribe/
   unsubscribe round-trips. Uses the existing app Toast for errors.
   ------------------------------------------------------------------ */

import { useEffect, useState } from "react";
import { Toast } from "@/components/ui/toast";
import {
  isPushSupported,
  getPushPermission,
  getCurrentSubscription,
  subscribe,
  unsubscribe,
  type PushPermission,
} from "@/lib/push-client";

type State = "loading" | "unsupported" | "denied" | "unsubscribed" | "subscribed";

export function NotificationsToggle() {
  const [state, setState]   = useState<State>("loading");
  const [busy,  setBusy]    = useState(false);
  const [toast, setToast]   = useState<string | null>(null);

  /* On mount, derive the initial state from current permission +
     subscription. Re-derive after every subscribe/unsubscribe call. */
  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    if (!isPushSupported()) { setState("unsupported"); return; }
    const permission: PushPermission = getPushPermission();
    if (permission === "denied") { setState("denied"); return; }
    const sub = await getCurrentSubscription();
    setState(sub ? "subscribed" : "unsubscribed");
  }

  async function handleEnable() {
    if (busy) return;
    setBusy(true);
    const result = await subscribe();
    setBusy(false);
    if (result.ok) {
      setToast("Notifications enabled");
      await refresh();
    } else {
      setToast(result.error ?? "Couldn't enable notifications.");
      /* Permission may now be "denied" if the user just blocked the
         system prompt — re-derive so the UI updates. */
      await refresh();
    }
  }

  async function handleDisable() {
    if (busy) return;
    setBusy(true);
    const result = await unsubscribe();
    setBusy(false);
    if (result.ok) {
      setToast("Notifications turned off");
      await refresh();
    } else {
      setToast(result.error ?? "Couldn't turn off notifications.");
    }
  }

  /* Don't render anything during the initial async derive — avoids a
     flash of the wrong state. The component is well below the fold
     on the Profile tab anyway, so a brief blank space is invisible. */
  if (state === "loading" || state === "unsupported") {
    return (
      <>
        {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      </>
    );
  }

  return (
    <>
      <section
        className="rounded-2xl p-5 space-y-3"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
          Notifications
        </p>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {state === "subscribed"
                ? "On for this device"
                : state === "denied"
                  ? "Blocked by your browser"
                  : "Get notified on this device"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {state === "subscribed"
                ? "We'll ping you when your aging cigars are ready, when someone replies to a post, or when your burn report gets a reaction."
                : state === "denied"
                  ? "You blocked notifications previously. Re-enable them from your browser or system settings."
                  : "Aging-cigar alerts, replies on your posts, reactions on your burn reports."}
            </p>
          </div>
          {state === "subscribed" ? (
            <button
              type="button"
              onClick={handleDisable}
              disabled={busy}
              className="btn btn-ghost text-sm flex-shrink-0"
              style={{ minHeight: 44, touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            >
              {busy ? "..." : "Disable"}
            </button>
          ) : state === "denied" ? null : (
            <button
              type="button"
              onClick={handleEnable}
              disabled={busy}
              className="btn btn-ghost text-sm flex-shrink-0"
              style={{ minHeight: 44, touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            >
              {busy ? "..." : "Enable"}
            </button>
          )}
        </div>
      </section>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
