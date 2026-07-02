# LLM Wiki — Ash & Ember Society

Reference for LLM coding agents working in this repo. Written for a fresh session with
zero context. Read order depends on the task:

| Task | Read first |
|---|---|
| Any task | [05-gotchas.md](05-gotchas.md) — landmines that cost real debugging time |
| Feature work / bug fix | [01-architecture.md](01-architecture.md), then [03-conventions.md](03-conventions.md) |
| Anything touching data | [02-data-model.md](02-data-model.md) |
| Anything touching bundle/rendering/SW | [04-performance.md](04-performance.md) |
| Branching, PRs, shipping | [06-workflows.md](06-workflows.md) |

## What this app is

Premium mobile-first PWA for cigar enthusiasts (humidor management, burn logs, cigar
catalog, community lounge, shop directory). Next.js App Router + TypeScript, Supabase
(auth/DB/storage), Stripe subscriptions, Serwist service worker, Vercel. Dark lounge
aesthetic — an exclusive cigar lounge, not generic tech dark mode.

## Ground rules that override everything

1. **Never break functioning code.** Minimal change for the actual cause; verify
   before claiming done.
2. **This Next.js version differs from your training data.** Read
   `node_modules/next/dist/docs/` before writing framework code.
3. **Performance is paramount.** Every change is weighed against bundle size, LCP,
   INP, and SW behavior. CI enforces a bundle budget.
4. **RLS and the proxy shape all data access.** `auth.uid()` is NULL in RSC; profiles
   is own-row; cross-user reads use `public_profiles`. See 02-data-model.md.
5. **SQL migrations are applied manually** in the Supabase SQL editor and drift has
   caused production incidents. Treat every migration as a deploy gate.

## Maintenance

Update the relevant page in the same PR whenever a change invalidates a claim here
(new route pattern, new table, new perf mechanism, new hard-won gotcha). A wiki that
drifts from the code is worse than no wiki — stale claims get executed as fact by
future agents. `PROJECT_STATE.md` remains the session-to-session state snapshot;
this wiki holds the durable knowledge.
