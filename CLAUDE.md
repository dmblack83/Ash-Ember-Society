@AGENTS.md
@PROJECT_STATE.md

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
