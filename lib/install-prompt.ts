/*
 * Install-prompt detection
 *
 * Surfaces an "install" affordance on iOS and Android. Desktop and
 * already-installed clients return supported: false so the UI hides
 * the row entirely.
 *
 * Branches:
 *   ios-safari — show the Safari Share-Sheet instructions
 *   ios-other  — Chrome iOS, Firefox iOS, in-app webviews; show
 *                "open in Safari first" instructions
 *   android    — capture BeforeInstallPromptEvent and call .prompt()
 *                from our own bottom-sheet trigger
 *
 * iOS does not expose BeforeInstallPromptEvent — Apple has no
 * programmatic install API. iOS users always go through manual
 * instructions.
 */

export type InstallPlatform = "ios-safari" | "ios-other" | "android" | "desktop";

export interface InstallState {
  platform:   InstallPlatform;
  standalone: boolean;
  /**
   * True when the install row should render. False when the device is
   * already running standalone, or the platform isn't iOS (v1 scope).
   */
  supported:  boolean;
}

export function getInstallState(): InstallState {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { platform: "desktop", standalone: false, supported: false };
  }

  const ua = navigator.userAgent;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  if (isIOS) {
    const isCriOS  = /CriOS/i.test(ua);                       // Chrome iOS
    const isFxiOS  = /FxiOS/i.test(ua);                       // Firefox iOS
    const isEdgiOS = /EdgiOS/i.test(ua);                      // Edge iOS
    const isInApp  = /Instagram|FBAN|FBAV|Twitter|LinkedInApp|TikTok/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !isCriOS && !isFxiOS && !isEdgiOS && !isInApp;
    return {
      platform:   isSafari ? "ios-safari" : "ios-other",
      standalone,
      supported:  !standalone,
    };
  }

  if (/Android/i.test(ua)) {
    return { platform: "android", standalone, supported: !standalone };
  }

  return { platform: "desktop", standalone, supported: false };
}

/* ------------------------------------------------------------------
   BeforeInstallPromptEvent capture
   ------------------------------------------------------------------ */

/*
 * The event Chromium fires when the page becomes installable. Standard
 * lib.dom doesn't include the prompt() method, so we declare the
 * minimal shape we use.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/*
 * useBeforeInstallPrompt — captures the deferred prompt event for
 * later programmatic firing. Android Chrome dispatches the event
 * once when the page becomes installable; we preventDefault so
 * Chrome's own banner doesn't appear, then stash the event so the
 * Install bottom-sheet can fire it on user tap.
 *
 * Returns: a getter for the captured event (or null if not yet fired)
 * and a clearer to call after a successful prompt() so we don't try
 * to reuse a one-shot event.
 *
 * Implemented as a tiny hook to avoid importing react in the helper
 * itself for any consumers that only need getInstallState().
 */
import { useEffect, useRef, useState } from "react";

export function useBeforeInstallPrompt() {
  const [available, setAvailable] = useState(false);
  const eventRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function onPrompt(e: Event) {
      e.preventDefault();
      eventRef.current = e as BeforeInstallPromptEvent;
      setAvailable(true);
    }

    function onInstalled() {
      eventRef.current = null;
      setAvailable(false);
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  /**
   * Fire the captured prompt. Returns "accepted", "dismissed", or
   * "unavailable" if the event was never captured (or already fired).
   */
  async function trigger(): Promise<"accepted" | "dismissed" | "unavailable"> {
    const evt = eventRef.current;
    if (!evt) return "unavailable";
    await evt.prompt();
    const choice = await evt.userChoice;
    eventRef.current = null;
    setAvailable(false);
    return choice.outcome;
  }

  return { available, trigger };
}
