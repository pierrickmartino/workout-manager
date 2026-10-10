# Competitive Audit: Workout Manager vs. Gript (griptapp.com)

**Date:** 2026-10-03
**Subject:** Gript — "Workout Tracker & Gym Log for iPhone & Android", by Gontech Ventures FZCO
**Verdict in one line:** Gript is not the same product we are, but it owns the moment we are worst at — the set being logged on the gym floor — and it has already conceded the ground we are best at. The threat is real and asymmetric, and it is not about features: it is about platform.

---

## 1. Scope, method, and what this report can and cannot claim

### 1.1 Evidence limits — read this before trusting any Gript number

**`griptapp.com` could not be fetched.** The session's egress proxy answered the request with a policy denial (`EGRESS_BLOCKED`), as it did for `apps.apple.com` and `play.google.com`. Per the proxy's own guidance, organization policy denials are reported rather than routed around. So **no claim about Gript in this report comes from reading Gript's own pages directly.** Everything about Gript here is reconstructed from search-engine indexing of:

- Gript's marketing site (`griptapp.com/`), reached only as indexed snippets
- Gript's own comparison pages (`griptapp.com/compare/hevy-review`, `/compare/strong-app-review`)
- Gript's own help pages (`griptapp.com/help/import-from-strong`, `/import-from-hevy`, `/import-from-jefit`, `/import-from-fitbod`, `/import-from-strengthlog`, `/export-workouts-from-hevy`, `/help/apple-watch-getting-started`)
- Third-party roundups and App Store / Play Store listing metadata

This matters in two ways. First, **a confidence rating is attached to every material Gript claim** (§9). Second, the richest source is *Gript's own competitive marketing*, which is simultaneously the best and the most self-serving description of the product. Where Gript describes its own gaps, I treat that as high-confidence (a company does not invent its own weaknesses). Where Gript describes its own strengths, I treat it as a marketing claim, not a measurement.

**Recommended follow-up:** have a human open `griptapp.com`, install the app, and log a week of real training. Half the findings below are about *feel on the gym floor*, which no amount of page-reading settles. §10 lists exactly what to verify.

### 1.2 Name disambiguation — there are at least four "GRIPT" apps

This is a genuine trap and getting it wrong would corrupt the whole analysis. The subject of this report is **only** the first row:

| Product | Identifier | What it actually is | Is it our competitor? |
| --- | --- | --- | --- |
| **Gript — Workout Tracker / Gym Log** | App Store `id6760785452`; `griptapp.com`; Gontech Ventures FZCO | Self-serve strength-training logger with analytics | **Yes — this report** |
| GRIPT App | App Store `id6752009335`; `com.gript.app`; GRIPT PTY LTD, South Yarra VIC, Australia | A branded hypertrophy *program* app ("GRIPT Hypertrophy Principles") | No — a content/coaching brand |
| GRIPT Booking App | `com.fitnessmobileapps.gript` | Mindbody-built class/gym booking app | No |
| GRIPT (Trainerize) | `com.trainerize.gript` | White-labelled Trainerize PT client app | No |

Several third-party roundups conflate these. Any claim sourced to "GRIPT PTY LTD", the Australian address, or the Trainerize/Mindbody bundle IDs has been **excluded** from the analysis below.

### 1.3 Our side of the comparison

Our side is grounded in the repository, not in aspiration: 112 ADRs under `docs/adr/`, the domain glossary in `GLOSSARY.md`, ~33,200 lines of Python across `apps/api/app`, 233 backend test files, 35 Next.js routes, and ~353 modules in `apps/web/lib`. Where I say we do not have something, I checked for it (§4.3 names the greps).

### 1.4 One note on prior work

`docs/research/` already contains market reports covering **Hevy (58 mentions), Fitbod (52), Strong (41), Boostcamp (20), JEFIT (8)**. **Gript appears zero times.** This competitor has not previously been assessed. That is itself a small finding: Gript is new enough to have escaped two rounds of our own market research, which is consistent with the traction signals in §2.5.

---

## 2. Gript: product profile

### 2.1 What it is

A **logger-first** strength-training app. The product thesis, in its own words, is that you *"log every set as you train — weight, reps, and effort"* and Gript *"turns that history into progress charts, personal records, and muscle balance breakdowns."*

Note what that sentence does **not** contain: any promise to tell you what to train. Gript's value chain starts at the moment of capture and runs forward into analysis. It does not run backward into programming.

### 2.2 The capture layer — this is their actual product

This is where Gript has invested, and it is formidable:

- **A custom keyboard built for lifting.** Weight steppers, one-tap RPE/RIR, plate entry, add-set and complete-set actions, all in the keypad itself. This is a dedicated input surface for the one interaction a lifter performs forty times a session.
- **Native Apple Watch app.** Start a routine or a quick workout from the wrist, log sets with the Digital Crown, run the rest timer, read heart rate and energy burned. *"Leave your phone in the locker."* Routines, most-frequent exercises, the full exercise library and settings all sync to the watch and stay current.
- **Rest timer as a first-class OS citizen.** Auto-starts after every set, **learns the rest you actually take**, runs as a Live Activity on the Lock Screen and in the Dynamic Island, and its alert *"breaks through Focus."*
- **Fully offline, syncs on its own.** No connection needed to train or to read your own history.
- **Guest-first onboarding.** Usable with no account; signing in with Apple or Google later enables cloud sync *"without losing data."*
- **Structured set semantics:** supersets, warm-up, failure, drop and cool-down sets.
- **Calculators:** plate calculator and warm-up calculator (PRO).

### 2.3 The analysis layer

- **Nine chart types** per their own comparison pages (the marketing site elsewhere says "15+ charts" — see §9 for the discrepancy): volume, estimated 1RM, max weight, total reps, working weight range, and a **weight-versus-reps scatter per exercise**.
- **A body map, a muscle balance radar, and a training load heatmap.**
- **Body measurements as a real feature:** weight, body fat, and thirteen body parts, each with goals, reminders, progress charts, **left/right comparison**, and **two-way Apple Health sync**, charted alongside training on a "Performance" tab.
- **Progression suggestions that show their reasoning:** *"suggests your next weight and reps from your logged sets and effort — and shows the reasoning behind every call."* (PRO, and only for routines you built yourself.)

### 2.4 Data portability — a deliberate weapon

- **Inbound:** imports CSV from **Hevy, Strong, JEFIT, Fitbod and 10–15 more apps**, preserving per-set weights, reps, set types and RPE. You can even *"share a CSV, PDF, or screenshot to Gript from any app."*
- **Outbound:** exports *"in Gript, Strong, or Hevy format"* from Profile → Export Workouts, with the explicit promise *"your data is yours."*

This is a **switching-cost demolition strategy**, and it is paired with an SEO content machine: a `/help/import-from-<competitor>` page for every rival and a `/compare/<competitor>-review` page for each major one. Gript is farming its competitors' brand searches and offering a one-tap escape hatch at the end of the funnel. It is the single most commercially intelligent thing about the product.

### 2.5 Commercial shape and traction

- **Platforms:** iPhone, iPad (full-screen, landscape, Split View / Slide Over), Apple Watch, Android (with Health Connect sync).
- **Free tier, and it is generous:** unlimited workouts, full history, 600+ exercises with video demos, core charts and personal records, Apple Watch, **3 routines**, **10 custom exercises**, and **12 weeks of chart history**.
- **Gript PRO:** unlimited routines and custom exercises, advanced charts, longer chart history, progression suggestions, the full Performance tab, and the plate/warm-up calculators. **~$4.99/month or ~$29.99/year, with a free trial. No lifetime option.**
- **Traction: small and early.** ~**4.7 average from ~37 ratings**. Developer **Gontech Ventures FZCO** (a UAE free-zone entity) — indie or small-team, not a funded incumbent.

### 2.6 What Gript openly does not have

From their own comparison pages, which is why this is high-confidence: **no web app. No Wear OS. No social feed. No widgets. No monthly report. No lifetime price. Six programs against Hevy's twenty-six. And no AI generation of any kind** — the progression suggestions are deterministic inferences over logged sets, explicitly explained rather than generated.

---

## 3. Workout Manager: product profile

### 3.1 What it is

A **planner-first, AI-assisted** training app whose architectural spine is a single distinction: **a plan is what was prescribed; a record is what was performed, and they are never the same object.** Every major design decision in 112 ADRs falls out of defending that line.

### 3.2 The planning layer — this is our actual product

Gript has no equivalent to any of this:

- **AI-generated multi-week Protocols** — fully enumerated, self-paced, calendar-free sequences with progression and deloads expressed as real per-week variation (ADR-0001).
- **AI-generated standalone Sessions**, **AI substitution** of a single movement, and **regeneration** of a plan.
- **Four interchangeable LLM providers** (Anthropic, OpenAI, Google, OpenRouter) behind one `StructuredLLM.complete` port with a provider factory and per-generator `parse_*` validation boundaries (ADR-0006). Async generation on cache miss via Redis/RQ (ADR-0005).
- **A two-layer generation cache with adopt-by-copy** (ADR-0003): shared immutable generated content keyed on a coarse normalized tuple; users mutate only their own copy.
- **A safety cache bypass that is a stated invariant, not an optimization:** a user with any Sensitive Constraint — injury, rehab, postpartum, medical — is *never* served cached or shared generation. Always a fresh generation.
- **A direct-manipulation Protocol Builder** (dnd-kit, keyboard-accessible) that reshapes weeks, per-week session counts and hand-authored prescriptions — and **touches only the un-performed tail**, because a performed Session is settled record (ADR-0020, ADR-0068).
- **Hand-Authored Sessions** as a first-class non-AI plan origin (ADR-0040), with Session Provenance carried so plan-quality affordances are never offered on a plan the AI did not write.
- **Calibration** that re-pitches the un-performed tail (ADR-0111), and a **selectable progression scheme registry** with a preview (ADR-0064).

### 3.3 The domain model — unusually rigorous

Our typed value discipline is genuinely rarer than any single feature:

- **`Load`** is a typed value with five kinds — absolute, bodyweight (+added), %1RM, qualitative, range — never a bare kg number.
- **`Quantity`** is typed across reps / distance / duration, because *"a 10 km run and a set of eight squats are both real sets."*
- **`Effort`** is `{scale, value}` over RPE or RIR, with cross-scale rendering as a read-time projection, on both the plan (Target Effort) and the record.
- **`Tempo`**, **`Set Type`** (with warm-up excluded from volume and strength records), **`Exercise Note`** / **`Set Note`**, **`Training Type`**.
- **An executable terminology guard** (`app/quality/terminology_guard.py`) that fails a pytest run on banned vocabulary regressions.

### 3.4 Records, analytics and gamification — all read-time

**No stored ledgers anywhere.** XP, Operator Level, Streak, Achievements and Personal Records are computed from Logged Sessions and Sets at read time — no `xp` column, no unlock table, no write hooks (ADR-0018/0019). Shipped surfaces include volume and distance charts, a training heatmap, muscle-group coverage with an honest **Unclassified** bucket, a weekly muscle-balance series, ranked strength trajectories as top-set small multiples, a paginated all-time PR timeline, per-exercise progress and records, and a **per-muscle anatomical Muscle Atlas** body map (ADR-0073/0079) with a drawn focus ring on its SVG regions.

Records are honest by construction: estimated 1RM and PRs come only from absolute-Load sets in a trustworthy rep range, and analytics windows are gated by history depth (ADR-0056) rather than drawn from two data points.

### 3.5 Logging, history and sharing

- **Live Session** that is ephemeral and client-side until finished (ADR-0012), with set tracking, prior-performance context, a rest countdown, a per-second tick confined to the leaf that renders it (ADR-0091), wake-lock, reopenable completed sets (ADR-0089), and an **idempotent finish outbox** so a finish is immediately real (ADR-0060).
- **Plan-less Logged Sessions** — record training with no plan at all (ADR-0031), resolving exercises by search-and-create (ADR-0033) — plus **Capture**, which promotes such a record into a reusable standalone plan (ADR-0044).
- **Log Correction** within a gap-free performed sequence (ADR-0034); Duplicate with lineage (ADR-0043); **cross-user share-by-copy over a revocable link** (ADR-0057/0058).
- **Data export** as a file download that deliberately bypasses the response envelope (ADR-0062), CSV and JSON.

### 3.6 A shared global Catalog with an admin curation plane

One movement definition per normalized name, owned by no user (ADR-0002), spanning `curated` / `ai_generated` / `user_entered` **Provenance** and a read-time **Catalog Completeness** projection. AI **Enrichment** fills fields but *never* launders provenance into "human-reviewed" — only a deliberate, audited admin act promotes an Exercise (ADR-0075). Plus retire-as-tombstone with guarded hard delete (ADR-0076), curated read-time Equipment and Muscle vocabularies (ADR-0077/0078), a read-time Movement Pattern taxonomy (ADR-0072) and a read-time Session Section projection (ADR-0074).

### 3.7 Frontend and accessibility rigor — our quiet crown jewel

This is, bluntly, better than almost anything shipping in consumer fitness, and it is **mechanically enforced** by ~30 fail-closed static guards in `apps/web/lib/*-policy.ts` plus browser audit harnesses in `apps/web/audit/`:

WCAG contrast floor at 4.6:1 across every Skin and Mode including System copies (ADR-0081); no call-site fade below the floor (ADR-0083); **every plotted datum retrievable as text** with year and unit (ADR-0084); **no sideways scroll at 320px** and field rows that stack at **200% text** (ADR-0085/0087); reduced-motion respected (ADR-0082); charts reached only through dynamic imports (ADR-0090); icons only through the design system (ADR-0092); form primitives that derive the correct mobile keypad from type and step (ADR-0093); section dividers that are real headings (ADR-0094); images that reserve their box (ADR-0095); instants rendered in the reader's clock (ADR-0096); the app's own confirm dialog instead of `window.confirm` (ADR-0098); every tap target answering the first tap (ADR-0099); shareable filter URLs (ADR-0100); typeset copy (ADR-0101); drawn focus indicators (ADR-0104). Audit journeys render pages at 320px, 200% text and 1440px.

### 3.8 Platform and commercial shape

**Web PWA only.** Next.js App Router, installable, with an offline fallback page — but **authenticated navigation is deliberately not cached** (ADR-0028), and offline projections stay server-computed with no client projection engine (ADR-0061). **Clerk authentication is required**; there is no guest mode. No native iOS or Android app, no watch app. No stated pricing.

---

## 4. Head-to-head

### 4.1 Where we are ahead

| Capability | Workout Manager | Gript |
| --- | --- | --- |
| AI multi-week plan generation | **Yes** — Protocols with progression/deloads | **No** |
| AI single-session generation | **Yes** | No |
| AI movement substitution | **Yes** | No |
| AI regeneration of a plan | **Yes** | No |
| Multi-provider LLM abstraction | **Yes** — 4 providers, one port | n/a |
| Injury/rehab/postpartum safety rule | **Yes** — cache bypass invariant | Not evidenced |
| Plan vs. record as a modelled distinction | **Yes** — the architectural spine | Implicit at best |
| Typed `Load` (5 kinds incl. %1RM, qualitative, range) | **Yes** | Partial — weight/plates/RPE |
| Typed `Quantity` (reps/distance/duration) | **Yes** | Not evidenced |
| Prescribed Target Effort on the plan | **Yes** | No plan side to carry it |
| Tempo notation with phase expansion | **Yes** | Not evidenced |
| Shared global catalog + provenance/trust model | **Yes** | Not evidenced |
| Admin curation & enrichment plane | **Yes** | Not evidenced |
| Read-time-only gamification (XP, Level, Streak, Achievements) | **Yes** — no ledger | Not evidenced |
| Cross-user share-by-copy, revocable | **Yes** | Not evidenced |
| Capture a plan-less record into a reusable plan | **Yes** | Not evidenced |
| Correct a logged session under contiguity rules | **Yes** | Partially (editable history) |
| Direct-manipulation plan builder, tail-only edits | **Yes** | Routine editing only |
| Web app | **Yes — PWA** | **No** (their own copy) |
| Mechanically enforced WCAG/reflow/a11y guards | **Yes — ~30 fail-closed guards** | Not evidenced |

### 4.2 Where Gript is ahead

| Capability | Gript | Workout Manager |
| --- | --- | --- |
| Native iPhone app | **Yes** | **No** — PWA only |
| Native Android app | **Yes** | **No** |
| Native Apple Watch app (log from wrist, Digital Crown) | **Yes** | **No** |
| Purpose-built lifting keyboard (steppers, 1-tap RPE/RIR, plates) | **Yes** | No — standard form controls |
| Full offline training **and** offline history | **Yes** | **No** — authenticated pages uncached by design |
| Rest timer as Live Activity / Lock Screen / Dynamic Island | **Yes** | In-app countdown only |
| Rest timer that learns your actual rest | **Yes** | No |
| Alert that breaks through Focus | **Yes** | No |
| Guest / no-account first run | **Yes** | **No** — Clerk required |
| Import from Hevy / Strong / JEFIT / Fitbod / 10+ more | **Yes** | **No inbound import at all** |
| Export in a *rival's* format | **Yes** (Strong, Hevy) | CSV/JSON, own shape |
| Apple Health / Health Connect two-way sync | **Yes** | **No** |
| Heart rate & energy burned during a workout | **Yes** (via Watch) | No |
| Body measurements: 13 parts, goals, reminders, L/R compare | **Yes** | Generic dated metric table, **no charts** |
| Exercise library with video demos | **Yes** — 600+ | Images only; catalog is AI/user-grown |
| Plate calculator | **Yes** | **No** |
| Warm-up calculator | **Yes** | **No** |
| Weight-vs-reps scatter per exercise | **Yes** | No |
| Max weight & total reps charts | **Yes** | Top-set trend & e1RM only |
| Progression suggestion with reasoning shown | **Yes** | Scheme preview, less legible |
| Published pricing & monetization | **Yes** — free + ~$4.99/mo | **None** |
| Competitor-targeted SEO funnel | **Yes** — compare/ + help/import pages | No |
| Shipping on app stores | **Yes** | No |

### 4.3 Gaps verified by search, not assumed

I grepped for each before asserting its absence: plate/warm-up calculator (`plate.calculator|warmup.calculator` — zero hits in source), HealthKit / Apple Health / Health Connect (hits **only** in `docs/research/*` and ADR-0019 prose — never in `apps/`), inbound CSV import (`apps/api/app` has `export/csv_serializer.py` and `routes/export.py` — **export only**, no import path), guest/anonymous auth (zero hits in `apps/api/app/auth`), and video on Exercise (zero hits in `domain/exercise.py` / `domain/exercise_image.py`). The metrics surface (`apps/web/app/metrics/page.tsx`) renders a `MetricTable` — a table, with no chart and no goal.

---

## 5. The strategic read

### 5.1 These are not the same product — and that is the good news

Gript sells **"log it well and see it clearly."** We sell **"we will write your training for you, and never confuse the plan with what you did."** A lifter who already knows what to train is Gript's customer. A lifter who does not is ours.

The overlap is the middle of the stack — history, charts, PRs, muscle balance — where we are roughly at parity on substance and Gript is ahead on breadth (scatter plots, max weight, total reps, body measurements) while we are ahead on honesty (typed loads, warm-up exclusion, Unclassified buckets, depth-gated windows, every datum available as text).

### 5.2 The bad news, and it is structural

**Capture is the daily habit; planning is a weekly-at-best act.** A lifter touches the logging surface forty times per session and the planning surface once a mesocycle. Gript has optimized the forty and we have optimized the one.

Worse, our deliberate architecture actively loses the gym floor:

1. **No native app and no watch app.** Gript's pitch is *"leave your phone in the locker."* We cannot be opened without a phone in hand and, realistically, a browser tab.
2. **ADR-0028 refuses to cache authenticated navigation, and ADR-0061 keeps projections server-side.** Both are defensible engineering positions. Their combined product consequence is that **our app degrades in exactly the environment lifters train in** — a basement gym with no signal. Gript works fully offline and syncs later. This is the single most dangerous line in this report, because it is not a missing feature: it is a shipped decision that a competitor has turned into their headline.
3. **Clerk-gated with no guest mode.** Gript's first run is "start logging"; ours is "create an account." In consumer fitness that difference is measured in multiples of activation rate.
4. **Zero inbound import.** Gript will read a prospect's entire Hevy/Strong/JEFIT history in one tap. We ask them to abandon years of training data. **Every serious lifter we want already has a history somewhere**, so this is not a convenience gap — it is a closed door at the top of our funnel.

### 5.3 Threat assessment: moderate now, high if they ship one thing

Gript today is **small** — ~37 ratings, an indie FZCO developer, no funding signal, no web app, no social layer, fewer programs than Hevy. They are not taking a market; they are taking *switchers from Hevy and Strong*, efficiently.

They become a genuine threat to us the moment they add **AI generation** on top of a capture layer this good. Nothing in their architecture prevents it, the deterministic "progression suggestions with reasoning shown" is a credible first step toward it, and the market is pushing every tracker that direction. If that happens, their capture advantage plus a generation story erases most of our distinctiveness, and our web-only platform leaves us with no ground to defend from.

Conversely, **we cannot beat them at logging ergonomics on the web.** We should not try. The strategy below is to make our planning advantage unmissable, close the four table-stakes gaps that cost us prospects before they ever see it, and stop donating the funnel.

### 5.4 One thing to learn from them immediately

Their **comparison-and-import SEO funnel** is cheap, compounding, and we have no equivalent. They publish a page per rival, rank for that rival's brand searches, and close with a one-tap migration. We have 112 ADRs of genuinely differentiated thinking and not one public page explaining why any of it matters to a lifter.

---

## 6. Recommendations, in priority order

### P0 — Close the doors that are costing us prospects

1. **Build inbound CSV import (Hevy, Strong, JEFIT first).** Highest leverage item in this report. It is a pure backend mapping job onto a model that is *richer* than the source — our typed `Load`, `Quantity`, `Effort` and `Set Type` can absorb per-set weight/reps/RPE/set-type without loss, and plan-less Logged Sessions (ADR-0031) are already the correct destination for imported history with no plan behind it. Route it through the repository seam, validate at the boundary, and it inherits every existing projection for free.
2. **Reopen the offline question as a product decision, not an architecture one.** ADR-0028 and ADR-0061 are coherent, but they were decided on security and correctness grounds without a competitor making offline training a headline. At minimum, write a new ADR that confronts the trade-off explicitly: cache the Next Session and the in-flight Live Session for offline read (the Live Session is *already* ephemeral and client-side per ADR-0012, and the finish outbox per ADR-0060 already handles deferred writes — so most of the machinery exists). The honest options are "cache the training path", "accept the gap and say so", or "native client". Picking by default is the only unacceptable option.
3. **Add a guest mode or a frictionless first run.** Let a user log one session before an account exists, then link it. Gript does exactly this and it is the difference between a trial and a bounce.

### P1 — Make the planning advantage legible and the daily loop tolerable

4. **Ship the plate calculator and the warm-up calculator.** Small, self-contained pure-domain additions that belong in `app/domain/` with unit tests, and they remove two line items from Gript's comparison table.
5. **Rebuild the set-entry keypad for the gym floor.** We already did the hard architectural half: ADR-0106 unified set entry into one `SetEntry` family and ADR-0093 derives the correct mobile keypad from type and step. Add weight steppers and one-tap RPE/RIR on top of that existing seam. This is where our frontend rigor should pay a visible dividend.
6. **Give body metrics a real surface.** Today it is a dated table. Charts, a goal, and more named parts would turn a stub into a feature — and the chart primitives, the `ChartValues` text-parity rule (ADR-0084) and the dynamic-import boundary (ADR-0090) are all already built.
7. **Surface progression reasoning the way Gript does.** We have more machinery than they do — a scheme registry (ADR-0064), scheme preview, Calibration (ADR-0111), typed Effort normalizing into the progression gate (ADR-0066). What we lack is the sentence that says *"we are suggesting 72.5 kg because…"*. That sentence is most of the perceived value, and for us it would be true at a depth they cannot match.

### P2 — Press the advantage

8. **Publish the differentiation.** A comparison page per rival and a "why plans and records are different things" explainer. Our ADR corpus is a content asset we are currently hiding in a repo.
9. **Lead with the safety invariant.** "If you tell us about an injury, a rehab, or a postpartum return, you are never served a cached or shared plan — always a fresh generation." No competitor found in this audit, Gript included, makes a claim like that. For the injured, the returning and the postpartum — a large, underserved, high-intent segment — it is the whole purchase decision.
10. **Decide on pricing.** Gript has published a tier structure; we have none. A free tier gated on *generation volume* rather than on history or charts would mirror our actual cost structure (LLM calls) and would be strictly more generous than Gript's 3-routine / 12-week-history cap on everything that is cheap for us to serve.
11. **Do not build a social feed.** Gript declined it, Hevy owns it, and it is orthogonal to our thesis. Our sharing model (revocable share-by-copy, ADR-0057) is the better-fitting primitive and it already ships.

---

## 7. Where a native client enters the picture

Items 2, 3, 5 and Gript's watch app all point at the same conclusion: **the web is the wrong surface for the in-gym moment, and no amount of PWA polish fixes it.** Live Activities, Dynamic Island, a Watch app, HealthKit/Health Connect, heart rate and a background-reliable rest timer are all platform capabilities that a browser does not expose.

I am **not** recommending a native build on the strength of this audit — it is a large strategic commitment and the decision needs traction data this report does not have. I am recommending that the question be **asked explicitly and answered in an ADR**, because our current position answers it implicitly in the negative every day. The intellectually honest middle path is to make the web app genuinely excellent at *planning, review and analytics* — where it is already ahead — and to treat the in-gym logging moment as a known, stated limitation until a native client is justified.

---

## 8. Bottom line

Gript is a well-built, narrowly-scoped, commercially shrewd logger from a small team with little traction yet. **It does not compete with our core: we generate training and it does not, and that gap is architectural on their side, not a backlog item.** But it is materially better than us at the thing a lifter does every single day, it works where lifters actually train and we do not, and it has built a migration funnel that drinks from our competitors' traffic while we have built none.

Our differentiation is real and deeper than theirs. The risk is not that Gript out-plans us. It is that a lifter never reaches our planning layer — because they could not bring their history in, could not start without an account, and could not open the app in the basement where they train.

**Close those three doors and this is a comfortable competitive position. Leave them open and the quality of the 112 ADRs behind them does not matter.**

---

## 9. Claim-by-claim confidence

| Claim about Gript | Confidence | Basis |
| --- | --- | --- |
| Logger-first positioning; no AI generation | **High** | Consistent across their own site copy and both comparison pages; absence corroborated by a dedicated AI-focused search returning no Gript AI feature |
| iPhone / iPad / Apple Watch / Android; **no web app, no Wear OS, no social feed, no widgets** | **High** | Stated on Gript's *own* comparison pages — self-reported weaknesses |
| Custom lifting keyboard; auto rest timer with Live Activity; fully offline | **High** | Repeated verbatim across multiple independent snippets |
| Import from Hevy/Strong/JEFIT/Fitbod + more; export in rival formats | **High** | A dedicated `/help/import-from-<app>` page exists per competitor |
| Free tier: 3 routines, 10 custom exercises, 12 weeks chart history, 600+ exercises with video | **Medium-High** | Consistent across snippets; exact caps not seen on the live page |
| Body measurements: 13 parts + weight + body fat, goals, reminders, L/R, two-way Apple Health | **Medium-High** | Detailed and consistent, but single-source-family |
| **PRO at ~$4.99/mo, ~$29.99/yr** | **Medium** | One roundup gives these figures; another says "12 weeks free before paid features", which describes the free *history window*, not a trial length. **Verify on the live page.** |
| Chart count: "nine chart types" vs "15+ charts" | **Medium** | Both appear. Likely nine *types* across 15+ rendered views; wording differs by page. Treat "nine types" as the conservative figure |
| ~4.7 average from ~37 ratings; Gontech Ventures FZCO | **Medium** | Single-source; App Store listing not directly readable. Ratings move fast |
| Progression suggestions are deterministic, not generative | **Medium** | Inferred from "shows the reasoning behind every call" plus the absence of any AI claim. Plausible but not proven |
| No social / community layer at all | **Medium-High** | Self-reported "no feed"; a lighter social surface could exist unmentioned |

Every claim about **Workout Manager** in this report is **High** confidence: read from the repository at commit-time state, with absences verified by the greps named in §4.3.

---

## 10. Verification checklist for a human with a phone

The blocked egress means these are open:

1. Open `griptapp.com` and confirm **PRO pricing**, the exact free-tier caps, and the real chart inventory.
2. Install Gript and **log one real session**. The custom keyboard and the learning rest timer are the two things this report rates highly on their own description alone.
3. Test their **Hevy or Strong import** with a real export file — specifically whether set types and RPE survive, which is what we would be matching in P0-1.
4. Check whether Gript has **any** social, programs marketplace, or coach-facing surface not mentioned in their marketing.
5. Re-check their release notes for **AI features**. That is the trigger condition in §5.3 and it is worth a standing watch.
6. Confirm the **App Store rating and review count** to size their traction properly.

---

## 11. Sources

Gript's own properties (reached as search-indexed snippets only — the domain is egress-blocked in this environment):
[griptapp.com](https://griptapp.com/) ·
[Hevy Review](https://griptapp.com/compare/hevy-review) ·
[Strong App Review](https://griptapp.com/compare/strong-app-review) ·
[Import from Strong](https://griptapp.com/help/import-from-strong) ·
[Import from Hevy](https://griptapp.com/help/import-from-hevy) ·
[Import from JEFIT](https://griptapp.com/help/import-from-jefit) ·
[Import from Fitbod](https://griptapp.com/help/import-from-fitbod) ·
[Import from StrengthLog](https://griptapp.com/help/import-from-strengthlog) ·
[Export from Hevy](https://griptapp.com/help/export-workouts-from-hevy) ·
[Apple Watch getting started](https://griptapp.com/help/apple-watch-getting-started)

Store listings (also egress-blocked; metadata via search):
[App Store — Gript, id6760785452](https://apps.apple.com/br/app/workout-tracker-gym-log-gript/id6760785452?l=en-GB)

Excluded as different products (name collision, §1.2):
[GRIPT App, id6752009335](https://apps.apple.com/in/app/gript-app/id6752009335) ·
[com.gript.app](https://play.google.com/store/apps/details?id=com.gript.app&hl=en_US) ·
[GRIPT Booking](https://play.google.com/store/apps/details?id=com.fitnessmobileapps.gript&hl=en_US) ·
[com.trainerize.gript](https://play.google.com/store/apps/details?id=com.trainerize.gript&hl=en_US)

Third-party context on the competitive set:
[Stronger — Best Workout Tracker Apps 2026](https://www.strongermobileapp.com/blog/best-workout-tracker-apps) ·
[Setgraph — Hevy vs Strong](https://setgraph.app/ai-blog/hevy-vs-strong-app-comparison-2026) ·
[GymNotePlus — Best Workout Tracking Apps](https://www.gymnoteplus.com/blog/best-workout-tracking-apps) ·
[LoadMuscle — 9 Best Workout Tracking Apps](https://loadmuscle.com/blog/best-workout-tracking-apps-2026) ·
[Push/Pull — Hevy vs Strong](https://push-pull.app/blog/hevy-vs-strong) ·
[Garage Gym Reviews — Best Workout Apps](https://www.garagegymreviews.com/best-workout-apps) ·
[Strong](https://www.strong.app/) ·
[Gravitus Pro](https://gravitus.com/pro/)

Internal: `CLAUDE.md`, `GLOSSARY.md`, `README.md`, `REVIEW.md`, `docs/adr/` (112 ADRs), `apps/api/app/`, `apps/web/`, `docs/research/`.
