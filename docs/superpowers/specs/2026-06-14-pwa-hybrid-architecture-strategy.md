# PWA Hybrid Architecture — Strategy Spec (umbrella)

**Date:** 2026-06-14
**Status:** Approved (strategy). Decomposes into per-slice specs/plans.
**Type:** Architecture migration strategy (umbrella, not a single implementation plan)

---

## Why this exists

Ash & Ember is, in daily use on iOS, still not responsive enough: navigation between
tabs lags, resume after backgrounding takes ~10s to become interactive, and actions/page
loads feel slow. A large share of engineering since launch has gone into PWA reliability
firefighting rather than product (cold-load white screens, splash, resume freeze, SW
precache hangs, the bare-domain redirect cascade, an 8-bucket reliability telemetry pass,
a separate responsiveness track).

This document records the honest root-cause read and the committed architectural
direction.

## Honest assessment (the retrospective)

- **PWA over native was correct and effectively forced.** Both app stores prohibit
  tobacco-promoting apps; a native Ash & Ember would be rejected on review. Nothing about
  the PWA platform choice would be done differently.
- **The wrong default was the render/auth stack, not the platform.** Next.js App Router
  (RSC) + the `proxy.ts` server-side auth pattern optimizes for server-rendered,
  SEO-friendly, mostly-public pages. This app is the opposite: overwhelmingly
  authenticated, daily-use, behind login, where SEO matters only for the marketing landing
  page and the cigar catalog.
- **The pain traces directly to that mismatch:**
  - Server-coupled navigation → the "snappiness" work (#500–#503) exists to claw back what
    a client SPA gives for free.
  - `proxy.ts` per-request auth verification → multi-second hangs, the 3s `getUser()`
    timeout race, the `auth.uid()`-null-in-RSC footgun, and a prime suspect for the 10s
    resume stall.
  - Cold launch / resume depend on a server round-trip to paint → a large slice of the
    white-screen / splash / freeze firefight.
  - The service worker cannot cleanly cache navigation because streamed RSC HTML is
    per-user (the documented StaleWhileRevalidate cross-user-HTML risk).

## Decision

Migrate to a **hybrid: SSR/SSG for the public zone, a cache-first client SPA for the
authed zone.** Chosen over "SSR first-load then SPA" because only this shape fixes all four
pains (cold launch, resume, nav, actions); the alternative leaves cold launch and resume —
the worst two — largely intact and would likely need redoing later.

### Target architecture

Two zones, split by whether SEO matters:

- **Public zone — stays SSR/SSG (unchanged):** marketing/landing page and the cigar catalog
  (~4,221 rows). Indexed, anon Supabase, fast first paint.
- **Authed zone — becomes a cache-first client SPA:** humidor, lounge, home, account, burn
  log, discover (non-catalog). A prerendered static shell, cached by the Serwist service
  worker, paints instantly on cold launch and resume. The client owns the Supabase session.
  Data loads client-side via SWR. No `proxy.ts` round-trip per navigation; no server auth
  on re-entry.

### What does NOT change (non-goals)

- PWA stays. Native is permanently off the table (tobacco / app-store policy).
- Landing + catalog stay SSR/SSG. SEO is unaffected — the authed app was never indexed.
- **Security is unchanged.** Supabase RLS enforces every read/write at the database. Moving
  the session client-side does not weaken authorization; it removes a redundant per-request
  server verification, not the actual access control.
- No big-bang rewrite. No unrelated refactors riding along.

## The foundation (the linchpin and the concentrated risk)

One enabling change precedes any feature migration: **client-side Supabase auth + a static
authed shell + service-worker caching of that shell.** This is the change that touches the
large surface (as of 2026-06-14: ~41 files reference `getServerUser` / `x-ae-*` headers; 15
authed pages are `force-dynamic`).

It must be built so the **old server-auth path and the new client path coexist** during the
transition. Routes move from server-auth/RSC to client-shell/SWR one at a time. Nothing
flips at once. A single route is converted first as a canary and verified on-device before
the rest follow.

## Sequencing (each slice = its own spec → plan → build)

0. **Foundation** — client Supabase auth, static authed shell, SW shell caching, clean
   client-side protected-route redirects, coexistence with the existing server path. One
   canary route converted. **Resume + interactivity measured before/after here** (folds in
   the resume diagnosis; no standalone spike, per decision).
1. **Humidor** — first real feature migrated (SWR on-ramp from PROJECT_STATE Phase 3 already
   started; lowest friction, highest daily-use payoff).
2. **Lounge.**
3. **Discover (non-catalog).**

Home and account fold in as their dependencies clear. Each slice removes a chunk of the
server-auth surface, ships independently, and is independently revertible.

## Risks and how each is de-risked

| Risk | De-risk |
|---|---|
| Auth blast radius (~41 files) | Foundation ships behind coexistence; one canary route first; verified on Dave's phone before broad conversion. |
| The 10s resume may not be purely structural | Measured in slice 0/1 against existing telemetry. If a discrete blocker (hung `await`, SW message race) remains after the auth round-trip is gone, it is fixed as a separate targeted change — never silently absorbed into "the rewrite fixed it." |
| Protected-route redirects move client-side | Must not flash the authed shell before redirecting. Handled explicitly in the foundation slice. |
| Per-device first load shows skeletons (no SSR data in authed zone) | Acceptable and standard for a cache-first app; cache-first means it only happens once per device, and resume/nav (the actual pains) become instant. |
| Transition leaves a mixed codebase for a while | Expected and intended. Coexistence is the safety mechanism, not a smell. The umbrella tracks which routes are migrated. |

## Success criteria

- Cold launch paints the authed shell from cache with no server wait.
- Resume after backgrounding is interactive in well under the current ~10s (target: near-
  instant; exact number set from the slice-0 measurement baseline).
- Tab navigation is client-side with no per-nav server round-trip.
- No regression in auth correctness (RLS still enforced; no unauthorized data access).
- SEO on landing + catalog unchanged.

## Open questions deferred to per-slice specs

- Exact client session/refresh handling and the shape of the protected-route redirect guard
  (foundation spec).
- Which canary route to convert first in the foundation slice.
- Whether the catalog stays fully SSR/SSG or gains a client-cached layer for in-app browsing
  (Discover slice).
- SW navigation caching strategy for the static shell vs the existing per-resource table
  (foundation spec).

## Next step

Brainstorm the **Foundation slice** as its own sub-project → spec → plan → build. This
umbrella is the reference it executes against.
