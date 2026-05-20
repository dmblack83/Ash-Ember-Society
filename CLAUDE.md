@AGENTS.md
@PROJECT_STATE.md

# Development methodology — ACTIVE EVERY SESSION

**Superpowers is the active development methodology for this project.** Its skills (brainstorming, writing-plans, test-driven-development, subagent-driven-development, verification-before-completion, systematic-debugging, etc.) drive plan → execute → verify. Let them trigger as designed.

**GSD (get-shit-done) is dormant here.** It stays installed but is NOT the active workflow:
- Do NOT drive `/gsd-*` commands or auto-invoke GSD discuss/plan/execute/verify.
- `.planning/` is **reference-only**: `.planning/codebase/*.md` are useful verified codebase docs; `.planning/ROADMAP.md` is a backlog of ideas, NOT an active phase machine. Read them for context; do not "execute phases" from them.
- GSD's hooks remain in user settings and are harmless; leave them.

Decision rationale and the GSD-vs-Superpowers evaluation: 2026-05-20 session. Fully reversible — GSD is still installed if the call is revisited.

# Engineering principles — ACTIVE EVERY TASK. Quality over speed.

## Diagnose before fixing
- Form a hypothesis. State the root cause in plain words before proposing a change.
- Verify the hypothesis explains the evidence. If it doesn't, the hypothesis is wrong; do not ship a fix on top of it.
- "I don't know yet" beats a confident wrong answer.
- When stuck, ask for the one diagnostic that would narrow the suspect list. Do not ship more code while guessing.

## Scope of changes
- Pick the smallest change that fixes the actual cause.
- Architectural changes are not bugfixes. Flag them as such, separately, with their own risk assessment.
- One concern per PR. No "while I'm in there" bundled cleanups.
- A revert is a valid answer when a recent change broke something. Restore working state first, redesign later.

## Anti-patterns
- Shipping fixes faster than understanding the problem.
- Masking a broken function with a timeout / retry / fallback instead of fixing the function.
- "Defense in depth" used as cover for not knowing the root cause.
- Chaining "what else might cause X" patches without forming a new hypothesis each time.

# Communication Rules — ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift. Still active if unsure.

## Drop
- Filler text, pleasantries: "sure", "certainly", "of course", "happy to", "great question", "absolutely"
- Hedging: "I think", "it seems", "you might want to", "perhaps"
- Preamble: do not restate what you are about to do before doing it
- Summaries: do not recap what you just did after doing it

## Keep
- Fragments OK
- Short synonyms over long ones
- Technical terms exact and unchanged
- Code blocks complete and unmodified
- Errors quoted exactly as they appear

## Response pattern
[thing] [action] [reason]. [next step]

## Context
Dave is not an engineer. Responses should be minimal but complete. Explain the "what" only when needed to make a decision. Never explain the "how" unless asked.

# Branching rules — ACTIVE EVERY SESSION

Before starting any code work, sync `main` with `origin/main`:

```
git fetch origin main && git checkout main && git merge --ff-only origin/main
```

Then branch off the freshly-synced `main`. The Cowork sandbox routinely starts with a stale local `main` (commits sometimes 50+ behind). Building off stale `main` produces PRs that target deleted files or duplicate already-merged work.

Verify before committing: `git log --oneline main..origin/main` should print nothing.

# Task-observer (skill improvement loop), ACTIVE EVERY SESSION

At the start of any task-oriented session, any interaction where you will use tools and produce deliverables, invoke the `task-observer` skill before beginning work. This captures skill improvement opportunities throughout the session.

When loading any skill, check the observation log for OPEN observations tagged to that skill. Apply their insights to the current work, even if the skill file hasn't been updated yet.

## Workspace folder override

For this project, `[workspace folder]` resolves to:

```
/Users/dave.black/.claude/projects/-Users-dave-black-Documents-the-humidor
```

Observations live at `[workspace folder]/skill-observations/log.md`. Cross-cutting principles live at `[workspace folder]/skill-observations/cross-cutting-principles.md`. This survives worktree teardown and sits alongside the existing auto-memory directory.

## Memory vs observer boundary

Two parallel systems serve different purposes. Route signals correctly:

- **auto-memory** (`~/.claude/projects/.../memory/`): facts about Dave, the project, preferences, and references. Loaded into every conversation. Examples: "no em dashes", "PR workflow rules", "service-client audit results", project state snapshots.
- **task-observer** (`~/.claude/projects/.../skill-observations/`): skill-edit candidates. Reviewed on a cadence (Mon/Wed/Fri), then applied as skill changes or filed upstream. Examples: "the gsd-plan-phase skill should add a verification step for X", "a new skill should exist for reviewing Supabase RLS policies".

Rule of thumb: if the signal is "Claude should know this on load", it goes to memory. If the signal is "a skill should change to encode this", it goes to the observation log.

## GSD skills are upstream

GSD skills live at `~/.claude/get-shit-done/` and get overwritten by `/gsd-update`. Observations targeting GSD methodology are improvement candidates Dave can later file as issues against the GSD project. Do not edit GSD skill files in place. Local behavior overrides flow through this CLAUDE.md or memory.

# Close-pattern restore, ACTIVE EVERY SESSION

At session start, check for `/Users/dave.black/.claude/projects/-Users-dave-black-Documents-the-humidor/session-logs/LAST.md`. If present, read it. Surface the "Pick up" line briefly in your first response so Dave knows the prior session's state was captured. Read the full log only if Dave signals he wants to resume that work specifically.

The `close-pattern` skill produces these files at session end. Run it via `/close` or `/close-pattern`.
