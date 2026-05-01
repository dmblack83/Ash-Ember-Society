/*
 * Install-prompt detection
 *
 * v1 surfaces an "install" affordance on iOS only. Android / desktop /
 * already-installed clients return supported: false so the UI hides
 * the row entirely.
 *
 * iOS branches:
 *   ios-safari — show the Safari Share-Sheet instructions
 *   ios-other  — Chrome iOS, Firefox iOS, in-app webviews; show
 *                "open in Safari first" instructions
 *
 * Why iOS only: iOS doesn't expose the BeforeInstallPromptEvent (no
 * programmatic install on Safari/iOS at all), and Android Chrome is
 * deferred to a later iteration.
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
    return { platform: "android", standalone, supported: false };
  }

  return { platform: "desktop", standalone, supported: false };
}
