# Invite Friends (SMS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Invite Friends" section to the Account tab with one client-side CTA that opens the device Messages app with a prefilled invite text.

**Architecture:** Pure-logic invite builder in `lib/invite.ts` (testable under the Vitest `lib/**` glob), a small presentational component `components/account/InviteFriendsSection.tsx` that renders the section and a styled `<a href="sms:...">` CTA, wired into `AccountClient.tsx` between the Notifications and Account sections. No backend, no new dependencies, no env vars, no database.

**Tech Stack:** Next.js App Router, React client component, TypeScript, Vitest (unit), inline-style design system (`var(--card)`, `var(--gold)`, `var(--muted-foreground)`).

**Branch:** `feat/invite-friends` (already created off synced `main`; the design spec is already committed to it).

---

## File Structure

- Create: `lib/invite.ts` — exports `SIGNUP_URL`, `INVITE_MESSAGE`, `buildInviteSmsHref()`. Pure, no React.
- Create: `lib/__tests__/invite.test.ts` — Vitest unit tests for the builder.
- Create: `components/account/InviteFriendsSection.tsx` — presentational client component.
- Modify: `components/account/AccountClient.tsx` — one import + one placement between `NotificationsSection` and `AccountSection`.

Decomposition rationale: `AccountClient.tsx` is already ~1732 lines (over the 800-line cap), so no new logic is added inline. The `sms:` href logic is separated into `lib/` so it can be unit-tested (Vitest config only includes `lib/**/*.test.ts`).

---

## Task 1: Invite builder (lib/invite.ts) — TDD

**Files:**
- Create: `lib/invite.ts`
- Test: `lib/__tests__/invite.test.ts`

Notes for the engineer:
- Vitest is configured with `globals: false`, so the test MUST import `describe/it/expect` from `vitest`.
- The test directory `lib/__tests__/` is matched by the include glob `lib/**/*.test.ts`.
- Run unit tests with `npm run test:unit` (which is `vitest run lib/`) or target one file as shown.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/invite.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SIGNUP_URL, INVITE_MESSAGE, buildInviteSmsHref } from "../invite";

const HREF_PREFIX = "sms:?&body=";

describe("invite", () => {
  it("SIGNUP_URL is the www signup URL", () => {
    expect(SIGNUP_URL).toBe("https://www.ashember.vip/signup");
  });

  it("INVITE_MESSAGE is the exact invite copy with the signup URL", () => {
    expect(INVITE_MESSAGE).toBe(
      "Join me on Ash & Ember! https://www.ashember.vip/signup",
    );
  });

  it("buildInviteSmsHref uses the cross-platform sms:?&body= prefix", () => {
    expect(buildInviteSmsHref().startsWith(HREF_PREFIX)).toBe(true);
  });

  it("encodes the body so it decodes back to the exact message", () => {
    const body = buildInviteSmsHref().slice(HREF_PREFIX.length);
    expect(decodeURIComponent(body)).toBe(INVITE_MESSAGE);
    expect(body).toContain("%26"); // & is encoded
    expect(body).not.toContain(" "); // spaces are encoded
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/__tests__/invite.test.ts`
Expected: FAIL — cannot resolve `../invite` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `lib/invite.ts`:

```ts
/* Invite Friends — shared invite content + sms: deep-link builder.
   Kept framework-free so it can be unit-tested under the Vitest lib/** glob. */

export const SIGNUP_URL = "https://www.ashember.vip/signup";

export const INVITE_MESSAGE = `Join me on Ash & Ember! ${SIGNUP_URL}`;

/**
 * Builds an `sms:` deep link with the invite message prefilled.
 *
 * The body-parameter separator differs by platform: iOS expects `sms:&body=`,
 * Android expects `sms:?body=`. The `sms:?&body=` form prefills on both, so no
 * platform sniffing is required.
 */
export function buildInviteSmsHref(): string {
  return `sms:?&body=${encodeURIComponent(INVITE_MESSAGE)}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/__tests__/invite.test.ts`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add lib/invite.ts lib/__tests__/invite.test.ts
git commit -m "feat(invite): sms invite message + deep-link builder with unit tests"
```

---

## Task 2: InviteFriendsSection component

**Files:**
- Create: `components/account/InviteFriendsSection.tsx`

Notes for the engineer:
- This is a presentational client component. It has no props.
- It replicates the small section-label markup used by the other Account sections
  (the `SectionLabel` helper in `AccountClient.tsx` is private to that file, so the
  ~10 lines of label style are inlined here to keep this component standalone).
- The card container styles (`borderRadius: 20`, `backgroundColor: "var(--card)"`,
  `border: "1px solid var(--border)"`) match the Notifications and Account sections.
- The CTA is an `<a>` (native `sms:` navigation), not a JS `onClick` — this is the
  reliable way to launch Messages, including inside the iOS PWA standalone shell.

- [ ] **Step 1: Create the component**

Create `components/account/InviteFriendsSection.tsx`:

```tsx
"use client";

import { buildInviteSmsHref } from "@/lib/invite";

/* Account-tab section that lets a member fire off a prefilled invite text.
   SMS only for now; the Email CTA lands with its backend in a later PR. */
export function InviteFriendsSection() {
  const smsHref = buildInviteSmsHref();

  return (
    <div>
      <p
        style={{
          fontSize:      11,
          fontWeight:    600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color:         "var(--muted-foreground)",
          padding:       "0 4px",
          marginBottom:  8,
        }}
      >
        Invite Friends
      </p>

      <div
        style={{
          borderRadius:    20,
          backgroundColor: "var(--card)",
          border:          "1px solid var(--border)",
          overflow:        "hidden",
        }}
      >
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--muted-foreground)", margin: 0 }}>
            Know someone who would appreciate a good smoke? Send them an invite.
          </p>

          <a
            href={smsHref}
            className="flex items-center justify-center gap-2 transition-opacity active:opacity-70"
            style={{
              padding:                 "12px 0",
              borderRadius:            14,
              border:                  "1.5px solid var(--gold, #D4A04A)",
              color:                   "var(--gold, #D4A04A)",
              background:              "transparent",
              fontSize:                14,
              fontWeight:              600,
              textDecoration:          "none",
              touchAction:             "manipulation",
              WebkitTapHighlightColor: "transparent",
            } as React.CSSProperties}
            aria-label="Invite a friend by text message"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Text a friend
          </a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit --pretty false`
Expected: no errors referencing `InviteFriendsSection.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/account/InviteFriendsSection.tsx
git commit -m "feat(invite): InviteFriendsSection with SMS CTA"
```

---

## Task 3: Wire the section into the Account tab

**Files:**
- Modify: `components/account/AccountClient.tsx` (import near line 10; placement near line 1692)

- [ ] **Step 1: Add the import**

In `components/account/AccountClient.tsx`, immediately after this existing line (line ~10):

```tsx
import { LegalTab } from "@/components/account/LegalTab";
```

add:

```tsx
import { InviteFriendsSection } from "@/components/account/InviteFriendsSection";
```

- [ ] **Step 2: Place the section between Notifications and Account**

In the page body (around line 1692), change this:

```tsx
          <NotificationsSection onToast={setToast} />

          <Suspense fallback={null}>
            <AccountSection
              userId={userId}
              email={email}
              membership={membership}
              onToast={setToast}
            />
          </Suspense>
```

to this (insert `<InviteFriendsSection />` between the two):

```tsx
          <NotificationsSection onToast={setToast} />

          <InviteFriendsSection />

          <Suspense fallback={null}>
            <AccountSection
              userId={userId}
              email={email}
              membership={membership}
              onToast={setToast}
            />
          </Suspense>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit --pretty false`
Expected: no errors.

- [ ] **Step 4: Run the unit tests once more**

Run: `npm run test:unit`
Expected: all tests pass, including the 4 invite tests.

- [ ] **Step 5: Commit**

```bash
git add components/account/AccountClient.tsx
git commit -m "feat(invite): mount Invite Friends between Notifications and Account"
```

---

## Task 4: Manual verification

Not automatable — confirm on real devices and in the running app.

- [ ] **Step 1: Build sanity check**

Run: `npm run build`
Expected: build succeeds with no type or lint errors.

- [ ] **Step 2: Verify placement and behavior**

- [ ] Open the Account tab — "Invite Friends" appears between the Notifications and Account sections, styled like its neighbors.
- [ ] iOS PWA (installed to home screen): tap "Text a friend" → Messages opens with body prefilled: `Join me on Ash & Ember! https://www.ashember.vip/signup`.
- [ ] Android Chrome: tap "Text a friend" → Messages app opens with the same prefilled body.
- [ ] The `&` in "Ash & Ember" and the URL appear intact in the composed message.

---

## Self-Review

**Spec coverage:**
- Section placed between Notifications and Account → Task 3. ✓
- SMS CTA with `sms:?&body=` and exact message → Task 1 (builder) + Task 2 (CTA). ✓
- New file `InviteFriendsSection.tsx`, not inline → Task 2. ✓
- Unit test on message/href builder → Task 1. ✓
- Email omitted (no placeholder) → not built; layout leaves room. ✓
- No backend / deps / env vars → confirmed; nothing added. ✓

**Placeholder scan:** No TBD/TODO; all code shown in full; no "handle edge cases" hand-waving.

**Type consistency:** `SIGNUP_URL`, `INVITE_MESSAGE`, `buildInviteSmsHref` names are identical across `lib/invite.ts`, the test, and the component import. The `sms:?&body=` prefix string matches between implementation and the test's `HREF_PREFIX`.
