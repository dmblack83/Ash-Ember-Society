# Floating Pill Bottom Nav (mobile/PWA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the solid edge-to-edge mobile bottom nav with a floating, semi-transparent (blurred) "pill" bar — glow-pill active state, Home centered & flat, new cabinet (Humidor) and modern-sofa (Lounge) icons, labels kept.

**Architecture:** A purely presentational change to one file, `app/(app)/layout.tsx` — the two icon constants and the `BottomNav` component. No new files, no behavior/route changes, no new deps. The desktop `SideRailNav` is untouched.

**Tech Stack:** Next.js App Router client component, inline SVG, inline styles + Tailwind classes, CSS `backdrop-filter`.

---

## Notes for the implementer

- This is a visual change with **no unit tests** (the repo only unit-tests pure logic in
  `lib/`; presentational nav is verified by typecheck + build + local visual review). Do not
  add a test framework for components.
- The bar must be **more transparent than a typical solid bar**: the page below should be
  visibly (but softly) showing through. That's intentional — `background` alpha `0.55` plus a
  strong `blur` keeps it legible and non-distracting.
- Keep the `center` field in `NAV_ITEMS` (leave the data as-is); just stop rendering the raised
  circle in `BottomNav`. `SideRailNav` also consumes `NAV_ITEMS`, so don't change the array
  shape.
- Active styling moves from the old `color`-only + elevated-circle approach to a **glow pill**
  (`background` + `box-shadow` + gold `color`) on the active `<Link>` itself.
- The floating wrapper uses `pointer-events: none` so the transparent margin around the pill
  doesn't intercept taps on content; the `<nav>` re-enables `pointer-events: auto`.

---

## Task 1: Swap the Humidor + Lounge icons

**Files:**
- Modify: `app/(app)/layout.tsx` (the `HUMIDOR_ICON` and `LOUNGE_ICON` consts, ~lines 26-45)

- [ ] **Step 1: Replace `HUMIDOR_ICON` (cabinet)**

Replace the entire current `const HUMIDOR_ICON = (...)` block with:

```tsx
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
```

- [ ] **Step 2: Replace `LOUNGE_ICON` (modern sofa)**

Replace the entire current `const LOUNGE_ICON = (...)` block with:

```tsx
const LOUNGE_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 9V6.5A2.5 2.5 0 0 0 17.5 4h-11A2.5 2.5 0 0 0 4 6.5V9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.5 11A1.5 1.5 0 0 1 4 12.5V15h16v-2.5A1.5 1.5 0 0 1 21.5 11 1.5 1.5 0 0 1 23 12.5V17a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-4.5A1.5 1.5 0 0 1 2.5 11Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 18v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M19 18v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
```

(The old Lounge icon used a `className="bottom-nav-fill-on-active"` for an active fill; the new
stroke-only icon intentionally drops it — the new active treatment is the glow pill + gold
stroke, not a filled glyph.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/layout.tsx"
git commit -m "feat(nav): cabinet + modern-sofa icons for Humidor and Lounge"
```

---

## Task 2: Rebuild `BottomNav` as a floating glass pill

**Files:**
- Modify: `app/(app)/layout.tsx` (the `BottomNav` function, ~lines 81-141)

- [ ] **Step 1: Replace the whole `BottomNav` function body's returned JSX**

Replace the entire `return ( <nav ...> ... </nav> );` inside `function BottomNav()` with the
floating-wrapper + pill version below. (Keep the `const pathname = usePathname();` line at the
top of the function.)

```tsx
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden"
      style={{
        paddingLeft: 12,
        paddingRight: 12,
        paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
        pointerEvents: "none", // transparent margin shouldn't block taps on content
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
```

Key differences from the old version, confirm each is true after editing:
- The `center` branch (the raised 46×46 circle for Home) is **gone** — every tab renders the
  same flat way. Home is centered only by its position in `NAV_ITEMS` (index 2 of 5).
- The bar is a floating pill inside a `pointer-events:none` wrapper, not an edge-to-edge
  `fixed` `<nav>`.
- Active = glow pill (`background` + `box-shadow`) + gold color, not the old color-only.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (`center` is no longer destructured in `BottomNav`; that's fine — it's still
present in `NAV_ITEMS` and still unused there, which is allowed.)

- [ ] **Step 3: Lint the file**

Run: `npx eslint "app/(app)/layout.tsx"`
Expected: exit 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/layout.tsx"
git commit -m "feat(nav): floating translucent pill bottom nav with glow-pill active state"
```

---

## Task 3: Verify

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + build**

Run: `npx tsc --noEmit` → PASS
Run: `npm run build` → succeeds.

- [ ] **Step 2: Local visual review (Dave's stated requirement — verify locally before prod)**

Run: `npm run dev`, open on an iPhone-width viewport (DevTools device mode or a phone on the
LAN). Confirm:
- The bar **floats** with side margins and rounded corners; the page is **visibly but softly
  showing through** it (blurred, not distracting).
- The **active** tab shows the soft gold glow pill; inactive tabs are muted.
- Order is Humidor · Lounge · **Home (center, flat)** · Discover · Account — no raised center.
- New **cabinet** (Humidor) and **modern sofa** (Lounge) icons render; Home/Discover/Account
  unchanged.
- Scroll a long screen (e.g. Humidor list): content is not occluded behind the floating bar.
  If it is, bump the page bottom clearance — `app/(app)/layout.tsx`'s `<main>` uses
  `pb-[calc(88px+env(safe-area-inset-bottom))]`; raise the `88px` until clear.
- Navigate to `/onboarding`: nav is still hidden (the `hideNav` rule is unchanged).
- A toast still appears **above** the bar.

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/pill-nav-mobile
gh pr create --base main --title "Floating pill bottom nav (mobile/PWA)" --body "Implements docs/superpowers/plans/2026-06-14-pill-nav-mobile.md. Visual-only change to the mobile bottom nav: floating translucent pill, glow-pill active state, Home centered & flat, new cabinet + sofa icons, labels kept. Desktop side rail untouched. Verify on a phone-width preview before merge."
```

---

## Self-review notes

- **Spec coverage:** floating translucent bar (Task 2) ✓; glow-pill active state (Task 2) ✓;
  Home centered & flat / remove raised center (Task 2) ✓; cabinet + sofa icons (Task 1) ✓;
  labels kept (Task 2 markup) ✓; transparency-per-Dave (Task 2 `0.55` + blur) ✓; side rail
  out of scope (untouched) ✓; layout occlusion check (Task 3) ✓; local verification (Task 3) ✓.
- **Placeholder scan:** none.
- **Consistency:** the active glow values (`rgba(212,160,74,0.15)` bg + the two-part box-shadow)
  and the bar values (`rgba(36,28,23,0.55)`, `blur(20px) saturate(120%)`) match the spec
  exactly. `NAV_ITEMS` shape is unchanged so `SideRailNav` is unaffected.
- **No tests:** intentional — presentational change; repo convention is pure-logic-only unit
  tests. Verification is typecheck + build + local visual.
