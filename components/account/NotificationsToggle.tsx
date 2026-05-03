"use client";

/* ------------------------------------------------------------------
   NotificationsToggle

   A single section card on Account → Profile that controls whether
   THIS browser receives Web Push notifications. Mirrors the visual
   pattern of the existing "Install" affordance just below it.

   States rendered (section is ALWAYS visible — never returns null):

     1. loading       — initial async derive in progress. Renders
                        the section shell with a "Checking this
                        device…" placeholder. Earlier versions
                        returned null here, which on iOS PWA could
                        leave the section invisible indefinitely if
                        navigator.serviceWorker.ready stalled.
     2. unsupported   — browser/device can't do Web Push. Renders the
                        section with platform-specific guidance + a
                        diagnostic line so users (and we) can tell
                        WHY it's unsupported on this specific device.
     3. denied        — user previously blocked notifications. Renders
                        an explanation; no Web API to re-prompt.
     4. unsubscribed  — granted-or-default. Shows "Enable" CTA.
     5. subscribed    — already opted in on this browser. Shows
                        "Disable" CTA.
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

/* Per-API check, recorded once on mount. When state is "unsupported"
   we surface this so the user can see precisely what's missing
   (helps diagnose iOS PWA quirks where one of the four APIs is
   absent even though the others are present). */
interface SupportDetail {
  serviceWorker: boolean;
  pushManager:   boolean;
  notification:  boolean;
  standalone:    boolean;
}

function readSupportDetail(): SupportDetail {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { serviceWorker: false, pushManager: false, notification: false, standalone: false };
  }
  return {
    serviceWorker: "serviceWorker" in navigator,
    pushManager:   "PushManager" in window,
    notification:  "Notification" in window,
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  };
}

export function NotificationsToggle() {
  const [state,   setState]   = useState<State>("loading");
  const [busy,    setBusy]    = useState(false);
  const [toast,   setToast]   = useState<string | null>(null);
  const [support, setSupport] = useState<SupportDetail | null>(null);

  /* On mount, derive the initial state from current permission +
     subscription. Re-derive after every subscribe/unsubscribe call. */
  useEffect(() => {
    setSupport(readSupportDetail());
    void refresh();
  }, []);

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

  /* Sub-component renderers, kept as helpers so the JSX below stays
     compact and readable. Each branch returns the heading + body
     text + (optional) action button. */

  function unsupportedBody() {
    const isIOS =
      typeof navigator !== "undefined" &&
      /iPhone|iPad|iPod/i.test(navigator.userAgent ?? "");

    let guidance = "Push notifications need a browser that exposes the Push API.";
    if (isIOS && support && !support.standalone) {
      guidance = "Push notifications on iOS require the app to be installed to your home screen. Tap Install below, then re-open from the home-screen icon.";
    } else if (isIOS && support?.standalone && !support.pushManager) {
      guidance = "Push notifications on iOS require iOS 16.4 or later. Update iOS in Settings → General → Software Update, then reopen the app.";
    } else if (support && !support.serviceWorker) {
      guidance = "This browser doesn't support service workers, which are required for push.";
    }

    /* Tiny diagnostic line — readable enough for a power user to
       send a screenshot, terse enough not to dominate the card. */
    const flags = support
      ? [
          support.serviceWorker ? "sw"   : "no-sw",
          support.pushManager   ? "push" : "no-push",
          support.notification  ? "notif" : "no-notif",
          support.standalone    ? "standalone" : "tab",
        ].join(" · ")
      : null;

    return (
      <>
        <p className="text-sm font-medium text-foreground">
          Not available on this device
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {guidance}
        </p>
        {flags && (
          <p
            className="mt-2"
            style={{
              fontFamily:    "var(--font-mono)",
              fontSize:      9,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color:         "var(--paper-dim)",
            }}
          >
            {flags}
          </p>
        )}
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
            {state === "unsupported" ? (
              unsupportedBody()
            ) : state === "loading" ? (
              <>
                <p className="text-sm font-medium text-foreground">
                  Notifications
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Checking this device…
                </p>
              </>
            ) : (
              <>
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
              </>
            )}
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
          ) : state === "unsubscribed" ? (
            <button
              type="button"
              onClick={handleEnable}
              disabled={busy}
              className="btn btn-ghost text-sm flex-shrink-0"
              style={{ minHeight: 44, touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            >
              {busy ? "..." : "Enable"}
            </button>
          ) : null}
        </div>
      </section>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
