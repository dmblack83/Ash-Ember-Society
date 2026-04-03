# Ash & Ember Society

I've been into cigars for years. Over time I became obsessed with the process and the love for the craft behind them. A good cigar slows you down in a way almost nothing else does. You can't rush it. Enjoyed by yourself, but even better when the moment is shared with people who get it.

The community and culture have deep roots, but there are aspects where technology could genuinely improve the experience and the connection. So I'm building it.

Ash & Ember Society is a full-stack web app for cigar enthusiasts, from newcomers to full-blown aficionados. The design system is built around a single question: what does it feel like to be in a room where people take cigars seriously? That informed every color token, every font choice, every interaction. Dark, warm, editorial.

The core is the humidor manager. You build your digital collection, track aging, manage wishlists, and file Burn Reports to log your experiences. Each report captures draw, burn, construction, flavor profile, pairing, and an overall rating. Over time that becomes a personal tasting history that teaches you your own preferences. Phase 2 opens up the community layer, where members share thoughts, Burn Reports, and their virtual humidors with other aficionados. People from all walks of life, connected by one thing.

**Tech Stack**

- **Next.js 14 App Router** — Full-stack React framework. The App Router architecture handles server components, layouts, and route groups — the app is split into `(auth)` and `(app)` route groups so unauthenticated users are cleanly fenced off from protected pages.

- **TypeScript** — End to end. Every component, server action, database query, and API route is fully typed.

- **Tailwind CSS** — Custom design token system built on top of Tailwind's utility layer. The dark lounge palette, custom utilities like `.glass` and `.glow-ember`, and all animation tokens are defined in `tailwind.config.ts` and consumed across every component.

- **Supabase** — Handles the database (Postgres), authentication, and file storage in one platform. Row-level security is enabled on every table, which means every query is automatically scoped to the authenticated user at the database level — not the application layer.

- **Stripe** — Powers the three-tier membership model (Free, Member at $9.99/mo, Premium at $19.99/mo). Full webhook integration keeps membership status in sync across upgrades, downgrades, cancellations, and payment failures. The Customer Portal handles billing management without custom UI.

- **Google Maps API** — Used for the shop directory. The map is rendered with a custom dark styling pass so it matches the app aesthetic instead of the default Google light theme.

- **Recharts** — Charting library for the stats dashboard. Tracks smoking frequency, flavor profile patterns, ratings over time, and collection breakdown.

- **shadcn/ui** — Component primitives restyled throughout to match the lounge theme. Dialogs, sheets, dropdowns, and form elements all inherit the dark palette and custom border/radius tokens rather than shipping with default shadcn styling.

- **Playfair Display + Inter** — Loaded via `next/font` for zero layout shift. Playfair Display (serif) handles all editorial headings and the brand name. Inter covers body copy and UI labels.

-- Dave
