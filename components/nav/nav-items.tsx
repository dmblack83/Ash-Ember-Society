import type { ReactNode } from "react";

/* ------------------------------------------------------------------
   Shared navigation definitions — one source of truth consumed by the
   bottom nav, the desktop side rail, and the mobile side sheet.

   Icons use stroke="currentColor"; the parent <Link> sets `color`
   based on active state. For active-only fill accents (lounge bubble,
   home roof) we render with `fill="currentFill"`-equivalent classes
   driven by a `data-active` attribute on the icon's <svg>.
   ------------------------------------------------------------------ */

const HUMIDOR_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="5" y="3" width="14" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <line x1="12" y1="3.5" x2="12" y2="20.5" stroke="currentColor" strokeWidth="1.7" />
    <line x1="9.6" y1="10.6" x2="9.6" y2="13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <line x1="14.4" y1="10.6" x2="14.4" y2="13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <line x1="6.5" y1="21" x2="6.5" y2="22.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <line x1="17.5" y1="21" x2="17.5" y2="22.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const LOUNGE_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 9V6.5A2.5 2.5 0 0 0 17.5 4h-11A2.5 2.5 0 0 0 4 6.5V9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.5 11A1.5 1.5 0 0 1 4 12.5V15h16v-2.5A1.5 1.5 0 0 1 21.5 11 1.5 1.5 0 0 1 23 12.5V17a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-4.5A1.5 1.5 0 0 1 2.5 11Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 18v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M19 18v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const HOME_ICON = (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true" className="bottom-nav-fill-on-active">
    <path
      d="M3 12L13 3L23 12V22a1 1 0 01-1 1H16v-6h-6v6H4a1 1 0 01-1-1V12z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const DISCOVER_ICON = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.6" />
    <path d="M14.5 7.5l-2.8 5.6-5.6 2.8 2.8-5.6 5.6-2.8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <circle cx="11" cy="11" r="1.2" fill="currentColor" />
  </svg>
);

const ACCOUNT_ICON = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <circle cx="11" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3 19c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const CATALOG_ICON = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <circle cx="9.5" cy="9.5" r="6" stroke="currentColor" strokeWidth="1.6" />
    <line x1="14" y1="14" x2="19" y2="19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <rect x="6.5" y="8.3" width="6" height="2.4" rx="1.2" fill="currentColor" opacity="0.55" />
  </svg>
);

const ADMIN_ICON = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <path d="M11 2.5l7 3v5c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9v-5l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M8.2 11l2 2 3.6-3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export interface NavItem {
  href: string;
  label: string;
  center: boolean;
  match: (pathname: string) => boolean;
  icon: ReactNode;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/humidor",           label: "Humidor",  center: false, match: (p: string) => p.startsWith("/humidor"),  icon: HUMIDOR_ICON },
  { href: "/lounge",            label: "Lounge",   center: false, match: (p: string) => p.startsWith("/lounge"),   icon: LOUNGE_ICON },
  { href: "/home",              label: "Home",     center: true,  match: (p: string) => p === "/home",             icon: HOME_ICON },
  { href: "/discover/cigar-news", label: "Discover", center: false, match: (p: string) => p.startsWith("/discover"), icon: DISCOVER_ICON },
  { href: "/account",           label: "Account",  center: false, match: (p: string) => p.startsWith("/account"),  icon: ACCOUNT_ICON },
];

/* Secondary destinations — reachable from the side sheet (mobile) and
   the side rail (desktop), not from the bottom tab bar. */
export const CATALOG_ITEM = {
  href:  "/discover/cigars",
  label: "Catalog Search",
  match: (p: string) => p.startsWith("/discover/cigars"),
  icon:  CATALOG_ICON,
};

export const ADMIN_ITEM = {
  href:  "/admin",
  label: "Admin",
  match: (p: string) => p.startsWith("/admin"),
  icon:  ADMIN_ICON,
};
