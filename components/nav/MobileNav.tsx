"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { keyFor } from "@/lib/data/keys";
import { fetchProfileLite } from "@/lib/data/profile-client";
import { getMembershipTier } from "@/lib/membership";
import { useAppSession } from "@/components/system/app-session";
import { NAV_ITEMS, CATALOG_ITEM, ADMIN_ITEM } from "@/components/nav/nav-items";

/* ------------------------------------------------------------------
   MobileNav — slim global top bar (hamburger + wordmark) that opens a
   left side sheet. Mobile only (lg:hidden); desktop keeps the side
   rail and renders no top bar.

   The sheet repeats the five main tabs and adds the secondary
   destinations that have no bottom-nav slot: Catalog Search for
   everyone, Admin only when the profile carries is_admin (the /admin
   page enforces the gate server-side regardless — hiding the link is
   cosmetic, not security).

   Data: session from the app-session context; profile via the same
   SWR key the side rail and home islands use, gated on the sheet
   having been opened once so closed-sheet mobile sessions pay nothing.
   ------------------------------------------------------------------ */

const SWIPE_CLOSE_PX = 48;

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  /* Latches true on first open — gates the profile fetch. */
  const [everOpened, setEverOpened] = useState(false);

  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const touchStartX = useRef<number | null>(null);

  const { ready, session } = useAppSession();
  const userId = everOpened && ready && session ? session.userId : null;

  const { data: profile } = useSWR(
    userId ? keyFor.profile(userId) : null,
    () => fetchProfileLite(userId!),
  );
  const isAdmin = profile?.is_admin === true;
  const displayName = profile?.display_name ?? profile?.first_name ?? null;
  const tierLabel =
    profile ? (getMembershipTier(profile) === "member" ? "Member" : "Free tier") : null;

  const openSheet = useCallback(() => {
    setOpen(true);
    setEverOpened(true);
  }, []);
  const closeSheet = useCallback(() => setOpen(false), []);

  /* Escape closes; body scroll locks while open; focus moves into the
     sheet on open and back to the hamburger on close. (Navigation
     closes via onClick on each sheet link — no pathname effect.) */
  useEffect(() => {
    if (!open) return;

    const hamburger = hamburgerRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      /* Minimal focus trap — cycle Tab within the sheet. */
      if (e.key === "Tab" && sheetRef.current) {
        const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
      hamburger?.focus();
    };
  }, [open]);

  /* Swipe-left on the sheet closes it. */
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    if (e.touches[0].clientX - touchStartX.current < -SWIPE_CLOSE_PX) {
      touchStartX.current = null;
      setOpen(false);
    }
  };
  const onTouchEnd = () => {
    touchStartX.current = null;
  };

  const linkStyle = (active: boolean): React.CSSProperties => ({
    color:           active ? "var(--gold, #D4A04A)" : "var(--muted-foreground)",
    backgroundColor: active ? "rgba(212,160,74,0.08)" : "transparent",
    textDecoration:  "none",
  });

  return (
    <div className="lg:hidden">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header
        className="fixed top-0 left-0 right-0 z-40 flex items-end"
        style={{
          height:               "var(--mobile-topbar-h)",
          backgroundColor:      "rgba(26,18,16,0.95)",
          backdropFilter:       "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom:         "1px solid var(--border)",
        }}
      >
        <div className="relative flex items-center w-full h-[52px] px-1">
          <button
            ref={hamburgerRef}
            type="button"
            onClick={openSheet}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="mobile-side-sheet"
            className="flex flex-col items-center justify-center gap-[5px] w-11 h-11"
          >
            <span className="block w-5 h-[1.5px] rounded-full" style={{ backgroundColor: "var(--foreground)" }} />
            <span className="block w-5 h-[1.5px] rounded-full" style={{ backgroundColor: "var(--foreground)" }} />
            <span className="block w-5 h-[1.5px] rounded-full" style={{ backgroundColor: "var(--foreground)" }} />
          </button>
          <span
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              fontFamily:    "var(--font-serif)",
              fontSize:      18,
              fontWeight:    600,
              letterSpacing: "0.04em",
              color:         "var(--foreground)",
            }}
          >
            Ash &amp; Ember
          </span>
        </div>
      </header>

      {/* ── Scrim ───────────────────────────────────────────────── */}
      <div
        onClick={closeSheet}
        aria-hidden="true"
        className={`fixed inset-0 z-50 bg-black/55 transition-opacity duration-300 motion-reduce:transition-none ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* ── Side sheet ──────────────────────────────────────────── */}
      <nav
        ref={sheetRef}
        id="mobile-side-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col w-[300px] max-w-[85vw] outline-none transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          backgroundColor: "#1a1210",
          borderRight:     "1px solid var(--border)",
          paddingTop:      "calc(env(safe-area-inset-top) + 20px)",
          paddingBottom:   "calc(env(safe-area-inset-bottom) + 12px)",
        }}
      >
        {/* Header row: wordmark + close */}
        <div
          className="flex items-center justify-between pl-6 pr-3 pb-4 mb-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span
            style={{
              fontFamily:    "var(--font-serif)",
              fontSize:      20,
              fontWeight:    600,
              letterSpacing: "0.04em",
              color:         "var(--foreground)",
            }}
          >
            Ash &amp; Ember
          </span>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Close menu"
            className="flex items-center justify-center w-10 h-10 rounded-lg"
            style={{ color: "var(--muted-foreground)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Main tabs */}
        <div className="flex flex-col">
          {NAV_ITEMS.map(({ href, label, match, icon }) => {
            const active = match(pathname) && !CATALOG_ITEM.match(pathname);
            return (
              <Link
                key={href}
                href={href}
                prefetch={true}
                onClick={closeSheet}
                className="flex items-center gap-3.5 px-6 py-3 text-[15px] font-medium"
                style={linkStyle(active)}
                aria-current={active ? "page" : undefined}
              >
                {icon}
                {label}
              </Link>
            );
          })}
        </div>

        {/* Explore */}
        <p
          className="px-6 pt-4 pb-1.5 text-[10px] font-bold tracking-[0.14em] uppercase"
          style={{ color: "rgba(166,144,128,0.6)" }}
        >
          Explore
        </p>
        <Link
          href={CATALOG_ITEM.href}
          prefetch={false}
          onClick={closeSheet}
          className="flex items-center gap-3.5 px-6 py-3 text-[15px] font-medium"
          style={linkStyle(CATALOG_ITEM.match(pathname))}
          aria-current={CATALOG_ITEM.match(pathname) ? "page" : undefined}
        >
          {CATALOG_ITEM.icon}
          {CATALOG_ITEM.label}
        </Link>

        {/* Manage — admin only */}
        {isAdmin && (
          <>
            <p
              className="px-6 pt-4 pb-1.5 text-[10px] font-bold tracking-[0.14em] uppercase"
              style={{ color: "rgba(166,144,128,0.6)" }}
            >
              Manage
            </p>
            <Link
              href={ADMIN_ITEM.href}
              prefetch={false}
              onClick={closeSheet}
              className="flex items-center gap-3.5 px-6 py-3 text-[15px] font-medium"
              style={{
                color: ADMIN_ITEM.match(pathname) ? "var(--ember, #E8642C)" : "var(--muted-foreground)",
                backgroundColor: ADMIN_ITEM.match(pathname) ? "rgba(232,100,44,0.08)" : "transparent",
                textDecoration: "none",
              }}
              aria-current={ADMIN_ITEM.match(pathname) ? "page" : undefined}
            >
              {ADMIN_ITEM.icon}
              {ADMIN_ITEM.label}
            </Link>
          </>
        )}

        <div className="flex-1" />

        {/* Identity chip */}
        {displayName && (
          <Link
            href="/account"
            onClick={closeSheet}
            className="flex items-center gap-2.5 mx-3 px-2.5 py-2 rounded-xl"
            style={{
              backgroundColor: "var(--card)",
              border:          "1px solid var(--border)",
              textDecoration:  "none",
            }}
          >
            <span
              className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0"
              style={{
                fontFamily: "var(--font-serif)",
                fontSize:   15,
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
    </div>
  );
}
