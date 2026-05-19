# Feature Research — Ash & Ember Society

**Domain:** Premium mobile-first PWA for cigar enthusiasts (humidor management + community + discovery)
**Researched:** 2026-05-18
**Confidence:** MEDIUM overall (training-data-only — WebSearch/WebFetch denied this session)

> **Source-of-truth caveat:** Live web verification was blocked. Competitor claims below come from training knowledge of these products through ~2024. Where a competitor's exact current behavior matters for a roadmap decision, treat the claim as a hypothesis to verify with a manual install before building.

> **Scope guardrail:** Per `PROJECT.md`, the product is past MVP. This file does NOT re-research baseline features already shipped (humidor, burn report, lounge, catalog, shops, dashboard, subscriptions, PWA, push). It catalogues gaps and opportunities for a subsequent milestone.

---

## Feature Landscape

### Table Stakes (Users Expect These — Gaps Only)

Features common in the cigar/enthusiast-app peer group that are NOT yet shipped, where the absence is likely to feel like an omission to power users.

| Feature | Why Expected | Where It Exists | Complexity | Dependencies |
|---------|--------------|-----------------|------------|--------------|
| **Barcode / UPC scan to add cigar** | Cigar boxes have UPCs; tin/box scanning is faster than typing. Vivino (wine) made barcode-scan the default add path; users now expect it for any inventory app. | Vivino, Untappd (barcode for canned beer), Cigar Country | M | `cigar_catalog.upc` column (currently absent); camera permission UX. UPC database for cigars is sparse — fall back gracefully to manual when no match. |
| **Band photo scan with auto-fill** | Already in flight (Google Vision TEXT_DETECTION → VLM migration in `PROJECT.md` Active). Worth calling out as a table stake, not a differentiator: every modern cigar app advertises some form of "scan the band". | Cigar Scanner (whole product premise), Cigar Aficionado app (rumored, unverified), Cigar Country | M (migration already planned) | VLM endpoint (Haiku 4.5 / Gemini Flash via AI Gateway). `cigar_catalog` fuzzy-match. Rate-limit. |
| **Export humidor to CSV / share to a friend** | Insurance claims, estate planning, "show me your humidor" requests in cigar forums are routine. Spreadsheets are still the dominant tool the product is displacing — users WILL want to leave or share. | Power users do this manually with Google Sheets today; no cigar app does it well | S | None — server route + signed URL. Add re-import later for round-trip. |
| **Push notifications for aging-ready alerts** | The whole point of tracking aging dates. Without push the dashboard alert is a "I have to remember to check the app" feature. The push infra is shipped; the aging cron has to actually USE it. | None native to cigar apps; users currently set phone calendar reminders | S | Push subscription (✅ shipped), `app/api/cron/aging-ready` (✅ shipped — verify it actually fans out). User preference: how far in advance. |
| **Lounge thread sort + filter (newest / most active / unread)** | Forum-native expectation since phpBB. With category rooms shipped, users need to find the active conversation, not the freshest first-post. | Every forum since 1998 (Reddit, Discourse, Cigar Aficionado forums) | S | `forum_posts.last_activity_at` denorm column; index. Already flagged in `PROJECT.md` Active as schema drift to codify. |
| **Friends / follow another user** | Untappd, Vivino, Letterboxd all built their growth loop on this. Without a follow graph, the lounge is a forum, not a community. Burn reports from people you trust > burn reports from strangers. | Untappd, Vivino, Cigar Aficionado app (members only) | M | `follows` table; profile pages with public burn reports; privacy toggle on each burn report. Affects the "anti-feature: tag friends" section below. |
| **Public profile with sample burn reports** | Implicit follower-graph requirement — there has to be something to look AT when you click a username. Most cigar apps lock this behind "members only" and lose virality. | Untappd (public by default), Vivino (public by default) | M | Profile route at `/u/[handle]`. Privacy default decision (public vs opt-in). |
| **Search across burn reports** | "Have I smoked this before? What did I think?" is the #1 reason power users open a humidor app on the second visit. Today the burn report is one-way: write, never re-find. | Untappd "Check-in history search", Vivino "My Wines" filter | S-M | Postgres full-text on `smoke_logs.review_text` + cigar joins; SWR-paged search UI in `/humidor/burn-reports`. |
| **Pairing recall / pairing history per cigar** | "What did I drink with this last time?" is the #2 reason. The `pairing_drink` field is already collected on the burn report; it's just not surfaced anywhere. | Distiller (drinks side), Vivino food-pairing | S | Aggregation query on `smoke_logs.pairing_drink GROUP BY cigar_id`; add to cigar detail page. |
| **Manual humidity / temp log per humidor** | Users with multiple humidors track readings per cabinet. The current product implicitly assumes one humidor. The dashboard "Smoking Conditions" is outdoor weather, not humidor conditions. | Boveda Butler app (sensor-only), HumidorPro | M | `humidors` table (named locations); `humidity_logs` (timestamp, humidor_id, rh, temp, source). Manual entry first; Boveda integration is anti-feature territory. |

### Differentiators (Where Solo-Dev Can Compete)

High-leverage features the existing peer group does NOT do well. Each plays to the product's strengths (premium aesthetic, fast PWA, niche focus, no chain-store baggage).

| # | Feature | Value Proposition | Complexity | Dependencies |
|---|---------|-------------------|------------|--------------|
| 1 | **Flavor wheel / structured tasting notes** | The wine + whisky world has standardized flavor wheels (WSET, Flaviar). Cigars lag — Cigar Aficionado uses prose ("notes of cedar and leather"). A pickable, structured flavor tag UI (12-20 anchor flavors with weighting) would let users *find* "cigars that taste like the last one I loved" — a discovery surface nobody offers. **`flavor_tags` data layer already exists** (per `STRUCTURE.md`, `lib/data/flavor-tags.ts`); the question is whether the burn-report UI captures it and the cigar-detail page surfaces aggregated tags. | M | `flavor_tags` schema + many-to-many on `burn_reports`. Cigar detail page section: "Community flavor profile" (aggregated). Filter in Discover Cigars by tag. |
| 2 | **"Cigars like this" recommendations** | Once flavor tags + burn reports + wishlist exist, Vivino-style similarity discovery is achievable cheaply: weighted Jaccard / cosine on flavor-tag vectors + wrapper + filler country. No ML, no embeddings, just SQL. Solo-dev sustainable. Nobody in cigars does this. | M-L | Differentiator #1 (flavor tags) populated. Minimum ~50 burn reports per featured cigar to be useful (cold-start problem; gate by sample size, fall back to "popular in your style"). |
| 3 | **Cellar value / portfolio view** | Cigar collectors track $-value seriously (boxes appreciate; some bottlings are bought as long-aging investments). `humidor_items.price_paid_cents` is already captured. Surface as a "cellar value" dashboard: current value vs cost basis, smoked-and-gone $ totals, "smoke price per stick this month" — language borrowed from whisky-cellar apps (Distiller, Whisky Vault). | S-M | `humidor_items.price_paid_cents` (✅ exists). Optional `current_market_price_cents` (deferred — pricing is volatile, scraping is anti-feature). MVP: cost basis only. Premium tier could unlock market-price overlay later. |
| 4 | **Aging timeline / rest-period guidance per cigar** | Aging is the cigar-specific superpower (vs cigarettes / vapes — the product *gets better with time*). The dashboard's aging-alerts feature is preset windows; the differentiator is per-cigar guidance: "Your A. Fuente Hemingway typically peaks at 18-24 months from box date." Crowd-sourced from burn reports tagged "ready" vs "needs more time". | M | Burn report needs a "aging readiness" question (already partially captured?). `cigar_catalog` aging guidance column or derived view. Long-cold-start, but the dashboard already shows aging — incremental upgrade. |
| 5 | **Local shop check-in (lounge / event mode)** | The shop directory exists with map; what's missing is a check-in primitive — "I'm at Mike's Cigars right now" → friends/feed see it → encourages real-world meetups. Brick-and-mortar cigar lounges are the social heart of the hobby in a way bars aren't for whiskey. **This is the bridge feature** between the digital app and the physical lounges that are the actual community. | M | `shop_checkins` table; geofence approval; cooldown rate-limit (one per shop per 4h to prevent spam). Privacy: opt-in per check-in. Requires the friends-follow feature (table stake row 6) to be useful. |

### Anti-Features (Looks Attractive, Shouldn't Build)

Common requests that would harm the product if naively implemented. Each entry names the trap and the better alternative.

| # | Anti-Feature | Surface Appeal | Why It's a Trap | Better Alternative |
|---|--------------|----------------|------------------|--------------------|
| 1 | **E-commerce / sell cigars directly** | "We have 4,221 cigars catalogued and a member base — why not transact?" | Federal Tobacco Tax + state-by-state shipping bans + PACT Act age verification + payment processor restrictions (Stripe explicitly bans tobacco transactions in most jurisdictions). Solo-dev cannot maintain compliance. Membership tier model already monetizes; don't fight gravity. | Affiliate links to bonded retailers (already in the roadmap — `/discover/vendors`). Done right, this is more profitable than running a store. |
| 2 | **Real-time multi-sensor humidor integration (Boveda Butler, SensorPush, Govee)** | Boveda's Butler sensor exists; a "connect your humidor" feature looks magical in a demo. | Each vendor has a different (and changing) API; many are Bluetooth-only (no cloud API), which a PWA cannot read. Maintenance burden is unbounded for a one-vendor-at-a-time integration. The smart-sensor user base is a single-digit % of the broader collector base. | Manual humidity/temp log (covered in Table Stakes). Lets the user enter readings from whatever sensor they own. If usage justifies it, integrate Boveda's API first (they're the dominant brand). |
| 3 | **Native iOS / Android app** | Push notifications work better, App Store distribution feels legitimate. | Explicit out-of-scope per `PROJECT.md`. App Store gatekeeping for tobacco-adjacent apps is hostile (Apple in particular rejects or buries them). PWA install + push covers ~90% of native value. | Stay PWA. Invest the avoided effort in the PWA install UX (already partially built via `components/account/InstallSheet`). |
| 4 | **Photo-AI cigar identification ("hold the cigar up, we'll identify it")** | The "Shazam for cigars" pitch is irresistible. | Cigar bands look extremely similar across hundreds of brands and the OCR-quality variance is huge (gold-on-gold foil, embossed text, oblique angles). The band-scan path that IS in the roadmap is for *band photos* (text on a flat surface) — that's tractable. "Identify a cigar from a photo of the cigar" is not, and failing to do so erodes trust in the rest of the OCR. | Keep band-OCR (VLM migration already planned). Market it as "auto-fill, you confirm" — never "we identify." |
| 5 | **Real-time chat / DMs between members** | "Premium lounge experience" framing suggests it. Discord-style chat is sticky. | Moderation is a 24/7 job. The lounge forum is already async-moderation-friendly (edit windows, threading). Real-time chat needs human moderators. Solo dev cannot staff that. Also: real-time WebSocket connections fight the PWA cache strategy. | Threaded forum + push notifications on @-mentions (mentions are a small follow-up; chat is not). If a user wants real-time, route them to the existing brick-and-mortar lounge directory. |
| 6 | **Gamification: badges, achievements, leaderboards beyond the digital membership card** | Untappd built itself on badges. Easy to copy. | The current product positions as a "premium leather-bound dossier" (per `PROJECT.md` Core Value). Cartoon achievement unlocks corrode that. Cigar audience skews older + more affluent than the Untappd beer-hunter audience — different aesthetic norms. | One classy mechanic only: the digital membership card with QR + tier (already shipped). Optional: yearly summary (Spotify Wrapped style, end-of-year retrospective). That's it. |
| 7 | **Generic cigar Q&A AI chatbot ("Ask the Sommelier")** | LLMs are cheap; cigar trivia is bounded; a built-in chat assistant looks impressive. | (a) Cigar info is recipe-specific (filler blends are trade secrets) — the model will hallucinate confidently. (b) Liability: smoking advice + nicotine + health = LLM disclaimer hell. (c) Compute cost scales with usage and adds nothing the lounge community + cigar news section don't already provide. | The lounge feed IS the Q&A surface. Surface popular questions on the dashboard ("Trending Lounge" — ✅ shipped). |
| 8 | **Open-API / public REST API for third-party apps** | "Build an ecosystem!" Untappd has an API. Looks credible. | Solo dev cannot maintain an external API contract. Every breaking change becomes a support ticket. The 4,221-cigar catalog is the data asset — exposing it as a free API gives away the moat. | If a partner relationship emerges, build a one-off integration. Until then: no API. (Export-to-CSV in Table Stakes covers user-side data portability.) |

---

## Feature Dependencies

```
Burn-Report Search (Table-Stake row 8)
    └──requires──> Postgres FTS on smoke_logs.review_text

Pairing Recall (Table-Stake row 9)
    └──requires──> pairing_drink populated (✅ already collected)

Public Profile (Table-Stake row 7)
    └──enables──> Friends/Follow (Table-Stake row 6)
                       └──enables──> Shop Check-In (Differentiator #5)

Flavor Wheel (Differentiator #1)
    └──enables──> "Cigars Like This" (Differentiator #2)
    └──enhances──> Burn-Report Search (more filter dimensions)

Multi-Humidor Tracking (Table-Stake row 10)
    └──requires──> humidors table; backfill default humidor for existing users
    └──enables──> Manual Humidity Log (same Table-Stake row)

Cellar Value (Differentiator #3)
    └──no hard deps; price_paid_cents already exists
    └──enhances──> Burn-Report Search ("cigars I smoked this year, total $")

UPC Scan (Table-Stake row 1)
    └──requires──> cigar_catalog.upc column
    └──enhances──> Band-scan (parallel path)

Aging Timeline (Differentiator #4)
    └──requires──> burn report tagged "ready / over-rested / needs more time"
    └──enables──> per-cigar aging guidance on cigar detail page
```

### Dependency Notes

- **Public profile blocks Friends, which blocks Shop Check-In.** This is the longest dependency chain in the recommendations. Sequence them in this order in any milestone.
- **Flavor wheel data is the gating asset.** Differentiator #1 must populate before #2 (similarity recs) is anything but cold-start noise. Plan for a 4-6 week "filling the data" period after flavor-wheel ships before recommendations are surfaced publicly.
- **Multi-humidor breaks an implicit assumption.** Every existing query `WHERE user_id = $1` becomes `WHERE user_id = $1 AND humidor_id = $2`. Backfill a "Default" humidor for every existing user before exposing the UI; otherwise existing users see a broken empty state.
- **Burn-report search and pairing recall are the two cheapest high-value items.** Both are S-complexity, both use already-collected data. They are the obvious "first thing to ship next" pair.

---

## MVP+ Definition (Subsequent Milestone)

Since the product is past MVP, framing as **"the next coherent ship"**:

### Ship Next (highest ROI, lowest risk)

- [ ] **Burn-report search** — S complexity; uses existing data; closes the "I write reviews but never re-find them" gap.
- [ ] **Pairing recall on cigar detail page** — S complexity; uses existing `pairing_drink` field.
- [ ] **Push for aging-ready alerts** — verify the existing cron actually fans out; closes the loop on a feature users already see on the dashboard.
- [ ] **Lounge thread sort/filter (newest / most active / unread)** — S; codifies the `forum_posts` schema drift already flagged as Active.
- [ ] **CSV export of humidor** — S; insurance + portability; cheap unlock of trust for paid tiers.

### Add After Validation (second wave)

- [ ] **Flavor wheel / structured tasting tags on burn report** — M; gating asset for recommendations.
- [ ] **Public profile + follow** — M; growth-loop foundation.
- [ ] **Multi-humidor tracking + manual humidity log** — M; serves the power-user collector segment that is the highest LTV.
- [ ] **UPC scan** — M; reduces add-cigar friction (only after VLM band-OCR ships).

### Future / Speculative

- [ ] **Cigars-like-this recommendations** — needs flavor-wheel data populated for 4-6 weeks first.
- [ ] **Shop check-in** — needs follow graph populated first.
- [ ] **Cellar value dashboard** — easy to build, but only resonates for collectors with significant inventory; ship after multi-humidor.
- [ ] **Aging timeline per-cigar guidance** — needs sustained burn-report volume per featured cigar.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|-----------|---------------------|----------|
| Burn-report search | HIGH | LOW | P1 |
| Pairing recall on cigar detail | HIGH | LOW | P1 |
| Aging-ready push notifications (verify) | HIGH | LOW | P1 |
| Lounge sort/filter | MEDIUM | LOW | P1 |
| CSV export | MEDIUM | LOW | P1 |
| UPC scan | MEDIUM | MEDIUM | P2 |
| Flavor wheel | HIGH | MEDIUM | P2 |
| Public profile + follow | HIGH | MEDIUM | P2 |
| Multi-humidor tracking | HIGH | MEDIUM | P2 |
| Cellar value dashboard | MEDIUM | LOW-MEDIUM | P2 |
| "Cigars like this" recs | HIGH | MEDIUM-HIGH | P3 |
| Shop check-in | MEDIUM | MEDIUM | P3 |
| Aging timeline per cigar | MEDIUM | MEDIUM (long cold start) | P3 |

**Priority key:**
- **P1** = ship next milestone. All are S complexity, use already-collected data, no new schema.
- **P2** = second milestone. M complexity, new schema, larger UX investment.
- **P3** = needs P1/P2 data to be useful; revisit after a quarter of usage data.

---

## Competitor Feature Comparison

| Feature | Cigar Aficionado app | Cigar Scanner | Cigar Country / Cigopedia | Untappd (adjacent) | Vivino (adjacent) | Ash & Ember (current) |
|---------|----------------------|---------------|---------------------------|--------------------|-------------------|----------------------|
| Cigar catalog | Yes (Top 25, editor reviews) | Yes (community) | Yes (community-built) | n/a | n/a | **Yes — 4,221 curated** |
| Humidor tracking | Limited | Yes | Yes | n/a | Yes (cellar) | **Yes — full** |
| Burn / tasting log | Editor reviews only | Yes (basic) | Yes (basic) | Yes (check-in) | Yes (review) | **Yes — multi-step ratings + pairing + duration** |
| Band scan OCR | No (claimed) | Whole product premise | No | No | Label OCR (whole premise) | **Planned (VLM migration)** |
| UPC / barcode scan | No | Yes (claimed) | No | Yes (cans) | Yes (the killer feature) | No |
| Flavor wheel / structured tags | No | No | No | Yes (style filters) | Yes (food pairing tags) | **`flavor_tags` data layer exists; UI?** |
| Community feed / forum | Editorial only | Limited | Forum | Activity feed | Activity feed | **Yes — lounge** |
| Friends / follow | No (members only) | Limited | Limited | Yes (core) | Yes (core) | **No** |
| Public profile | Limited | Limited | Yes | Yes | Yes | **No** |
| Recommendations | Editorial Top 25 | No | No | "You might like" | "Wines like this" (core) | **No** |
| Shop directory | Yes | No | No | Brewery / venue check-in | Wine shop lookup | **Yes — with map** |
| Shop check-in | No | No | No | Yes (venue) | Limited | **No** |
| Subscription tiers | Yes ($) | Free | Free | Free (ads) | Freemium | **Yes — Free / Member / Premium** |
| Push notifications | Yes (news) | No | No | Yes | Yes | **Yes — infra shipped** |
| PWA install | No (native only) | No (native only) | No (native only) | No (native only) | No (native only) | **Yes — distinctive** |
| Cellar value | No | No | No | n/a | Yes (premium tier) | **No (data exists)** |
| Premium aesthetic | Dated | Functional / dated | Functional / dated | Cartoonish | Cleaner / consumer | **Premium lounge — distinctive** |

**Read of the matrix:** The product is already strongest on aesthetic, catalog quality, and the burn-report depth. The biggest competitive gaps are on the *social* axis (no follow graph, no public profiles) and the *discovery* axis (no flavor-wheel-driven recommendations). Those are the differentiator opportunities. The peer cigar apps (column 1-3) are vulnerable here — none of them are particularly social, and none do real recommendations. The adjacent enthusiast apps (columns 4-5) DO, which is exactly why their features are listed as the table-stake baseline.

---

## Sources

- **Primary source: training-data knowledge** of Cigar Aficionado app, Cigar Scanner, Cigar Country, Cigopedia, Untappd, Vivino, Distiller through ~2024. **LOW confidence on current state** (live verification denied this session).
- **Codebase ground truth:** `.planning/PROJECT.md`, `.planning/codebase/STRUCTURE.md`, `.planning/codebase/ARCHITECTURE.md`, `PROJECT_STATE.md` — HIGH confidence (read directly).
- **Industry standards referenced (general knowledge):**
  - PACT Act / tobacco compliance restrictions (anti-feature #1 reasoning)
  - Apple App Store policy on tobacco-adjacent apps (anti-feature #3 reasoning)
  - Stripe's tobacco merchant policy (anti-feature #1 reasoning)

### Verification To-Do Before Building

Items in this file that would benefit from manual verification before committing to a roadmap phase:

- [ ] Install Cigar Aficionado app today and verify whether it has barcode scan, follow graph, public profiles.
- [ ] Confirm Cigar Scanner's current OCR accuracy on real cigar bands (a Vision API benchmark before the VLM migration would also serve this).
- [ ] Confirm Vivino's current "Wines Like This" mechanism — pure flavor-tag, or does it use review embeddings? Calibrates the "Cigars Like This" complexity estimate.
- [ ] Spot-check Boveda Butler current API (or absence of one) before promising or anti-feature-ing humidor integration.

---

*Feature research for: premium cigar enthusiast PWA, subsequent milestone scope*
*Researched: 2026-05-18*
