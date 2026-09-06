"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { keyFor } from "@/lib/data/keys";
import { fetchLastBurn } from "@/lib/data/last-burn-client";
import { fetchNotificationSummary } from "@/lib/data/notifications";
import { fetchProfileLite } from "@/lib/data/profile-client";
import { getMembershipTier } from "@/lib/membership";
import { useAppSession } from "@/components/system/app-session";
import { ResumeHandler } from "@/components/system/ResumeHandler";
import { ConnectionProbe } from "@/components/system/ConnectionProbe";
import { ResumeReconnect } from "@/components/system/ResumeReconnect";
import { OfflineBanner } from "@/components/system/OfflineBanner";
import { PushSubscriptionHealthCheck } from "@/components/system/PushSubscriptionHealthCheck";
import { OutboxManager } from "@/components/system/OutboxManager";
import { PersistentStorageRequest } from "@/components/system/PersistentStorageRequest";
import { A2HSBanner } from "@/components/system/A2HSBanner";
import { ServiceWorkerUpdateNotice } from "@/components/system/ServiceWorkerUpdateNotice";
import { StaleBuildNotice } from "@/components/system/StaleBuildNotice";
import { AppSessionProvider } from "@/components/system/app-session";
import { MobileNav } from "@/components/nav/MobileNav";
import { NAV_ITEMS, CATALOG_ITEM, ADMIN_ITEM } from "@/components/nav/nav-items";

/* ------------------------------------------------------------------
   Bottom navigation — visible on all authenticated app pages.
   Page-level tab navs (Humidor | Wishlist | Stats) sit above this.
   ------------------------------------------------------------------ */

/* Icons + item definitions live in components/nav/nav-items.tsx —
   shared with the mobile side sheet. */

function BottomNav() {
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement>(null);

  /* iOS PWA repaint fix. The nav is position:fixed and lives in the
     persistent App Router layout, so it is never re-mounted. After a long
     background, iOS restores the page without repainting the fixed
     compositor layer, so the bar appears glued to the scrolled content
     ("floats up with the page") until something forces a reflow. On resume
     we toggle a sub-pixel transform to force the compositor to re-sync the
     layer to the viewport. translateZ(0) below keeps it on its own layer so
     this nudge is cheap and non-visual. */
  useEffect(() => {
    function repaint() {
      const el = wrapperRef.current;
      if (!el) return;
      el.style.transform = "translateZ(0) translateY(0.01px)";
      // Force layout, then settle back. rAF lets the bumped frame commit.
      void el.offsetHeight;
      requestAnimationFrame(() => {
        if (wrapperRef.current) wrapperRef.current.style.transform = "translateZ(0)";
      });
    }
    function onVisible() {
      if (document.visibilityState === "visible") repaint();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", repaint);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", repaint);
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden"
      style={{
        paddingLeft: 12,
        paddingRight: 12,
        paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
        pointerEvents: "none", // transparent margin shouldn't block taps on content
        transform: "translateZ(0)", // own compositor layer → pins to viewport, not scroll layer
        WebkitBackfaceVisibility: "hidden",
      }}
    >
      <nav
        aria-label="Main navigation"
        className="flex items-stretch"
        style={{
          pointerEvents: "auto",
          padding: 8,
          borderRadius: 26,
          background: "rgba(36,28,23,0.55)", // see-through; blur keeps it non-distracting
          backdropFilter: "blur(20px) saturate(120%)",
          WebkitBackdropFilter: "blur(20px) saturate(120%)",
          border: "1px solid rgba(212,160,74,0.16)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
        }}
      >
        {NAV_ITEMS.map(({ href, label, match, icon }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              scroll={false}
              prefetch={true}
              data-active={active || undefined}
              className="flex flex-1 flex-col items-center justify-center gap-[3px] py-1.5 min-h-[44px] active:opacity-70"
              style={{
                color: active ? "var(--gold, #D4A04A)" : "var(--muted-foreground)",
                borderRadius: 18,
                background: active ? "rgba(212,160,74,0.15)" : "transparent",
                boxShadow: active
                  ? "inset 0 0 0 1px rgba(212,160,74,0.4), 0 0 16px rgba(212,160,74,0.22)"
                  : "none",
                transition:
                  "color .22s cubic-bezier(.16,1,.3,1), background .22s cubic-bezier(.16,1,.3,1), box-shadow .22s cubic-bezier(.16,1,.3,1)",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                textDecoration: "none",
              }}
              aria-current={active ? "page" : undefined}
              aria-label={label}
            >
              {icon}
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------
   Side rail navigation — visible on desktop (lg+) only.
   Mobile + tablet keep the existing bottom nav.

   Width comes from `--side-rail-width` in globals.css; full-width
   fixed elements elsewhere in the app respect `--app-content-left`
   (zero below lg, rail-width above) so they sit to the right of the
   rail rather than underneath it.

   Reuses NAV_ITEMS for source-of-truth parity. Reorders Home to the
   top because a vertical list reads naturally from primary
   destination down; the bottom nav puts Home in the visual centre
   for thumb reach, which doesn't apply on a side rail.
   ------------------------------------------------------------------ */

/* Fetch-gate for the rail extras: the rail is CSS-hidden below lg, but
   hooks would still run — matchMedia gating keeps mobile from paying
   for desktop-only data. SWR keys match the home islands' keys, so at
   lg these reads are usually warm-cache dedupes, not extra requests. */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

function SideRailNav() {
  const pathname = usePathname();
  const router   = useRouter();

  const { ready, session } = useAppSession();
  const isDesktop = useIsDesktop();
  const userId = isDesktop && ready && session ? session.userId : null;

  /* Aging-ready count — same key + fetcher as the home Last Burn island. */
  const { data: lastBurn } = useSWR(
    userId ? keyFor.lastBurn(userId) : null,
    () => fetchLastBurn(userId!),
  );
  const readyCount = lastBurn?.readyCount ?? 0;

  /* Lounge activity — same signal as the home Notifications card. */
  const { data: notifRows } = useSWR(
    userId ? keyFor.notifications(userId) : null,
    () => fetchNotificationSummary(),
  );
  const hasLoungeActivity = (notifRows ?? []).some((r) => r.unseen_count > 0);

  /* Identity chip — profile lite (display name + tier). */
  const { data: profile } = useSWR(
    userId ? keyFor.profile(userId) : null,
    () => fetchProfileLite(userId!),
  );
  const displayName = profile?.display_name ?? profile?.first_name ?? null;
  const tierLabel =
    profile ? (getMembershipTier(profile) === "member" ? "Member" : "Free tier") : null;

  /* Inline reorder rather than a second const array — one
     source of truth for nav items. */
  const railItems = [
    NAV_ITEMS.find((i) => i.href === "/home")!,
    ...NAV_ITEMS.filter((i) => i.href !== "/home"),
  ];

  return (
    <nav
      className="hidden lg:flex flex-col fixed top-0 bottom-0 left-0 z-40 py-7"
      style={{
        width:                "var(--side-rail-width)",
        backgroundColor:      "rgba(26,18,16,0.95)",
        backdropFilter:       "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderRight:          "1px solid var(--border)",
      }}
      aria-label="Main navigation"
    >
      {/* Wordmark */}
      <Link
        href="/home"
        className="px-6 mb-9 transition-opacity hover:opacity-80"
        style={{
          fontFamily:    "var(--font-serif)",
          fontSize:      20,
          fontWeight:    600,
          letterSpacing: "0.04em",
          color:         "var(--foreground)",
          textDecoration: "none",
        }}
      >
        Ash &amp; Ember
      </Link>

      <div className="flex flex-col gap-1 px-3">
        {railItems.map(({ href, label, match, icon }) => {
          /* Catalog pages live under /discover/* but have their own rail
             entry below — don't double-light the Discover tab for them. */
          const active = match(pathname) && !CATALOG_ITEM.match(pathname);

          /* Contextual signal per item — aging-ready count on Humidor,
             unread-activity dot on Lounge. Both render nothing at zero. */
          const showReady    = href === "/humidor" && readyCount > 0;
          const showActivity = href === "/lounge" && hasLoungeActivity;

          return (
            <Link
              key={href}
              href={href}
              prefetch={true}
              data-active={active || undefined}
              className="flex items-center gap-3 px-3 py-3 rounded-lg transition-colors"
              style={{
                color:           active ? "var(--gold, #D4A04A)" : "var(--muted-foreground)",
                backgroundColor: active ? "rgba(212,160,74,0.08)" : "transparent",
                textDecoration:  "none",
              }}
              aria-current={active ? "page" : undefined}
            >
              {icon}
              <span className="text-sm font-medium">{label}</span>
              {showReady && (
                <span
                  className="ml-auto text-[10px] px-2 py-0.5 rounded-full"
                  style={{
                    fontFamily:      "var(--font-mono)",
                    backgroundColor: "rgba(212,160,74,0.16)",
                    color:           "var(--gold, #D4A04A)",
                  }}
                >
                  {readyCount} ready
                </span>
              )}
              {showActivity && (
                <span
                  className="ml-auto w-[7px] h-[7px] rounded-full"
                  style={{ backgroundColor: "var(--ember, #E8642C)" }}
                  aria-label="New lounge activity"
                />
              )}
            </Link>
          );
        })}

        {/* Secondary destinations — no bottom-nav slot; rail + sheet only. */}
        <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
          <Link
            href={CATALOG_ITEM.href}
            prefetch={false}
            data-active={CATALOG_ITEM.match(pathname) || undefined}
            className="flex items-center gap-3 px-3 py-3 rounded-lg transition-colors"
            style={{
              color:           CATALOG_ITEM.match(pathname) ? "var(--gold, #D4A04A)" : "var(--muted-foreground)",
              backgroundColor: CATALOG_ITEM.match(pathname) ? "rgba(212,160,74,0.08)" : "transparent",
              textDecoration:  "none",
            }}
            aria-current={CATALOG_ITEM.match(pathname) ? "page" : undefined}
          >
            {CATALOG_ITEM.icon}
            <span className="text-sm font-medium">{CATALOG_ITEM.label}</span>
          </Link>
          {profile?.is_admin === true && (
            <Link
              href={ADMIN_ITEM.href}
              prefetch={false}
              data-active={ADMIN_ITEM.match(pathname) || undefined}
              className="flex items-center gap-3 px-3 py-3 rounded-lg transition-colors"
              style={{
                color:           ADMIN_ITEM.match(pathname) ? "var(--ember, #E8642C)" : "var(--muted-foreground)",
                backgroundColor: ADMIN_ITEM.match(pathname) ? "rgba(232,100,44,0.08)" : "transparent",
                textDecoration:  "none",
              }}
              aria-current={ADMIN_ITEM.match(pathname) ? "page" : undefined}
            >
              {ADMIN_ITEM.icon}
              <span className="text-sm font-medium">{ADMIN_ITEM.label}</span>
            </Link>
          )}
        </div>
      </div>

      <div className="flex-1" />

      {/* Quick actions — same destinations as the home Tonight card. */}
      {userId && (
        <div
          className="flex flex-col gap-1.5 mx-3 mb-3 pt-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            type="button"
            onClick={() => router.push("/humidor")}
            className="text-left text-[13px] font-semibold px-3 py-2 rounded-lg"
            style={{
              background: "linear-gradient(180deg, #e1c787 0%, #b89549 100%)",
              color:      "#1a1208",
            }}
          >
            + Burn Report
          </button>
          <button
            type="button"
            onClick={() => router.push("/humidor?add=true")}
            className="text-left text-[13px] font-medium px-3 py-2 rounded-lg"
            style={{
              border: "1px solid var(--border)",
              color:  "var(--foreground)",
              background: "transparent",
            }}
          >
            + Add Cigar
          </button>
        </div>
      )}

      {/* Identity chip — avatar initial + display name, links to /account. */}
      {userId && displayName && (
        <Link
          href="/account"
          className="flex items-center gap-2.5 mx-3 px-2.5 py-2 rounded-xl transition-colors"
          style={{
            backgroundColor: "var(--card)",
            border:          "1px solid var(--border)",
            textDecoration:  "none",
          }}
        >
          <span
            className="flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize:   14,
              color:      "var(--gold, #D4A04A)",
              background: "linear-gradient(135deg, #3a2b18, #5a4020)",
            }}
            aria-hidden="true"
          >
            {displayName.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold truncate" style={{ color: "var(--foreground)" }}>
              {displayName}
            </span>
            {tierLabel && (
              <span className="block text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                {tierLabel}
              </span>
            )}
          </span>
        </Link>
      )}
    </nav>
  );
}

function ScrollReset() {
  const pathname = usePathname();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  /* Hide both navs on /onboarding — the route lives inside the (app)
     group so the layout wraps it, but a user mid-onboarding shouldn't
     see destination chrome they can't yet use. */
  const pathname = usePathname();
  const hideNav = pathname.startsWith("/onboarding");

  return (
    <AppSessionProvider>
      {/* Page content — bottom padding clears the nav bar.
          app-container enables dvh tracking on Android so the layout
          shrinks correctly when the software keyboard opens. */}
      <ScrollReset />
      <ResumeHandler />
      <ConnectionProbe />
      <ResumeReconnect />
      <OfflineBanner />
      <PushSubscriptionHealthCheck />
      <OutboxManager />
      <PersistentStorageRequest />
      <ServiceWorkerUpdateNotice />
      <StaleBuildNotice />
      <main
        id="main-content"
        className={
          hideNav
            ? "flex-1 app-container"
            : "flex-1 app-container pb-[calc(88px+env(safe-area-inset-bottom))] lg:pb-0"
        }
        style={{
          touchAction: "pan-y",
          marginLeft: hideNav ? 0 : "var(--app-content-left)",
          /* Clears the mobile top bar; the CSS var is 0 at lg+. */
          paddingTop: hideNav ? 0 : "var(--page-top-offset)",
        }}
      >
        {children}
      </main>
      {!hideNav && <A2HSBanner />}
      {!hideNav && <MobileNav />}
      {!hideNav && <BottomNav />}
      {!hideNav && <SideRailNav />}
    </AppSessionProvider>
  );
}
