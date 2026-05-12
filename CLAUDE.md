@AGENTS.md
@PROJECT_STATE.md

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
