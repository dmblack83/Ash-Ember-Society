# Weekly new-member digest — design spec

Date: 2026-08-24
Status: APPROVED (mockup `mockups/member-announcements/index.html`, section 05
"The Friday Roll" — chosen over concepts 01/03/04; those stay rejected for
this feature, do not re-propose)

## What ships

An automated weekly Lounge post announcing new members:

- **Cadence:** Vercel cron, Fridays 12:00 PM MST. "MST" is literal fixed
  UTC-7 (no DST shift), so the schedule is `0 19 * * 5` year-round.
- **Window:** everyone whose profile was created (with onboarding completed)
  since the previous digest post. **First run has no previous digest and
  falls back to the past 14 days** — that IS the launch post Dave wants on
  deploy day; it is triggered once manually, Fridays are automatic after.
- **Zero joins in the window = no post that week.**

## The post

- A normal `forum_posts` row — `is_system=false`, `user_id=null`, category
  General, status open, unlocked — so it flows through every existing feed
  path (pagination, New/Top, chips, hot RPC) and **likes + comments work
  exactly as on any post, zero changes to those mechanics**. No author push
  exists for it (null author), which matches current notification behavior.
- `title`: "This Week's New Members" · `content`: count-led copy
  ("8 new members joined the Society." / "1 new member joined the Society.")
  — content doubles as a graceful plain-text fallback anywhere the digest
  chrome doesn't render.
- **Roster:** new table `member_announcement_members`
  `(post_id FK→forum_posts cascade, position, user_id, display_name,
  avatar_url)` — a denormalized snapshot written by the cron (display data
  frozen at post time). RLS: public SELECT; only the service role writes.
  Manual-apply SQL (Dave runs it in the SQL editor before deploy).

## Rendering (matches mockup section 05 exactly)

- Feed fetchers embed the roster via `POST_SELECT`; a non-empty roster is
  what marks a post as a digest (no new flags).
- **Feed card (InlinePost digest variant):** gold system chrome — eyebrow
  "✦ This Week's New Members" + relative timestamp, stacked avatars (cap 4,
  then "+N" chip), serif line from `content`. No member numbers, no author
  row. The existing like/comment action bar renders unchanged.
- **Post detail (PostDetailClient digest variant):** same card with the full
  roster listed INSIDE it (join order, avatar + display name), the standard
  action row, then the untouched comment thread + composer.

## Cron route

`/api/cron/member-digest` — auth, service client, and `cron_run_log`
start/finish copied from `/api/cron/aging-ready`. Steps: find latest digest
(`member_announcement_members` → parent post, newest) → window since it (or
14d) → `profiles` where `onboarding_completed = true` and `created_at` in
window → skip if none → insert post + roster rows. `?dry=1` returns the
would-be payload without writing (used for verification and safe manual
testing). Manual trigger: `x-sync-secret` header, same as other crons.

## Out of scope

- Onboarding opt-out toggle (not requested; only display name + avatar are
  shown, both already public via public_profiles).
- Member-number flourish (explicitly dropped).
- Any change to like/comment/notification mechanics.
