# Invite Friends — Design

Date: 2026-06-09
Status: Approved (design), ready for implementation plan

## Summary

Add an "Invite Friends" section to the Account tab with one client-side CTA that opens
the device Messages app with a prefilled invite text. The Email invite path is
deliberately deferred to a later PR (its own email-sending backend decision). This PR
is pure frontend: no backend, no database, no new dependencies, no environment variables.

## Why

Word-of-mouth is the cheapest growth channel for the app. Letting a member fire off a
prefilled invite text in two taps removes all friction from "what app is that?" referrals.
SMS ships today because it needs zero backend; email follows once a transactional sender
is chosen.

## Scope

In scope:

- New "Invite Friends" section in the Account tab.
- One "Text a friend" CTA that launches the Messages app with a prefilled body.

Out of scope (this PR):

- Email invites (deferred — needs a transactional email sender; see Future Work).
- Referral attribution / tracking (the link is the plain signup URL).
- Any backend, API route, database table, or environment variable.

## Placement

The section renders in `components/account/AccountClient.tsx`, between
`<NotificationsSection />` and the `<Suspense><AccountSection /></Suspense>` block
(currently around line 1692-1701). It uses the existing `SectionLabel` + card-row
visual pattern so it reads as a peer of the Notifications and Account sections.

`AccountClient.tsx` is already ~1732 lines (over the project's 800-line cap), so the
new UI lives in its own file rather than being added inline:

- New file: `components/account/InviteFriendsSection.tsx`
- Change to `AccountClient.tsx`: one import + one `<InviteFriendsSection />` placement.

This mirrors how `MembershipTab` and `LegalTab` are already split into their own files.

## Component: InviteFriendsSection

A presentational client component. No props required beyond an optional `onToast`-style
hook only if needed (not needed for SMS — the `sms:` navigation gives its own OS feedback).

Behavior:

- Renders `<SectionLabel>Invite Friends</SectionLabel>` and a short helper line.
- Renders one CTA implemented as an `<a href={smsHref}>` styled as a button (matching the
  gold/outline button styling used elsewhere in the Account tab). An anchor with an
  `sms:` href is used instead of a JS click handler because native scheme navigation is
  the most reliable way to launch Messages and it works inside the iOS PWA standalone
  shell.

### Message and href

The invite message (exact copy, user-facing — no em dashes):

```
Join me on Ash & Ember! https://www.ashember.vip/signup
```

The href is built once from constants:

```ts
const SIGNUP_URL = "https://www.ashember.vip/signup";
const INVITE_MESSAGE = `Join me on Ash & Ember! ${SIGNUP_URL}`;
const smsHref = `sms:?&body=${encodeURIComponent(INVITE_MESSAGE)}`;
```

Cross-platform note: the body-parameter separator differs by platform — iOS expects
`sms:&body=`, Android expects `sms:?body=`. The `sms:?&body=` form prefills on both, so
no platform sniffing is required.

The `&` in "Ash & Ember" is encoded by `encodeURIComponent`, so it survives intact in the
prefilled message.

## Email button (deferred)

Omitted from this PR entirely — no disabled placeholder. The section layout leaves room
for a second CTA so the Email button drops in cleanly when its backend lands.

## Testing

Unit (Vitest):

- A small exported builder (e.g. `buildInviteSms()`) or the exported `smsHref`/
  `INVITE_MESSAGE` constants are asserted to:
  - contain the exact message text `Join me on Ash & Ember! https://www.ashember.vip/signup`
  - produce an href that starts with `sms:?&body=`
  - URL-encode the `&` and spaces correctly (decoding the body yields the exact message).

Manual:

- iOS PWA (standalone): tap "Text a friend" → Messages opens with body prefilled.
- Android: tap "Text a friend" → Messages opens with body prefilled.
- The section appears in the Account tab between Notifications and Account.

## Future Work

- Email invite: backend route + transactional email sender (Resend recommended over
  `supabase.auth.admin.inviteUserByEmail`, which creates orphaned auth users, uses generic
  email, is rate-limited ~3-4/hr, and opens an abuse surface). Adds the second CTA.
- Optional referral attribution (e.g. a `?ref=` param on the signup link) can be added
  alongside the email work if install attribution is wanted.
