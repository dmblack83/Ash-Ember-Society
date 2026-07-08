---
name: verify-in-app
description: Use when a change touches any user-facing route and needs runtime verification before a PR or completion claim, or when a PR test plan says "runtime verification pending". Produces logged-in screenshots plus console/server error checks per route.
---

# Verify In App

Runtime verification harness for Ash & Ember Society. Produces the evidence
that superpowers:verification-before-completion requires for user-facing
changes: the route rendered logged-in, with zero console errors, page errors,
or 5xx responses.

## When to use

- Before claiming any user-facing change is done.
- Before opening a PR that touches a route, shell, fetcher, or client
  component (put the PASS/FAIL table in the PR test plan).
- After Dave merges, as a post-deploy smoke check against production.

## How

```bash
CAPTURE_EMAIL=<test-account-email> CAPTURE_PASSWORD=<test-account-password> \
  node scripts/verify-in-app.mjs [baseUrl] [route ...]
```

- Default baseUrl: `https://www.ashember.vip` (production). For a local
  build: `npm run build && npm start`, then pass `http://localhost:3000`.
- Default routes: the five bottom-nav tabs. Pass the specific routes your
  change touched (e.g. `/lounge /lounge/<some-post-id>`).
- Output: `verification-shots/<timestamp>/*.png` + PASS/FAIL per route.
  Exit code 1 on any FAIL.
- Read the screenshots (Read tool) — a 200 with an error-free console can
  still render a broken layout. Eyes on pixels is part of the verification.

## Credentials

The test account is a dedicated fixture user (historically
`davevirg83@gmail.com`; credentials live with Dave). If login fails with
"Invalid email or password", the password was rotated: STOP and ask Dave to
update it — never create an account or guess credentials. When Dave supplies
new credentials, they are approved for this script's env vars only.

## Honesty rule

If this script cannot run (no credentials, network), say exactly that in the
completion claim and PR: "verified by tests and typecheck; NOT verified in
the running app." Never let a completion claim imply runtime verification
that did not happen.
