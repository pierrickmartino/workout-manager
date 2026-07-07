# Pulse — Unimplemented Feature Gap Analysis

A comparison of the **Pulse** design variant (`docs/design/pulse.pen`, 11 screens) against the
current Workout Manager web app (`apps/web/app`).

**Legend:** ❌ missing · 🟡 partial (data/model exists, designed UX does not) · ✅ shipped since this analysis · ⭐ highest-leverage gap

> **Key finding:** The API is complete for the plan/record loop (generate, log, feedback,
> regenerate, substitute, progress, metrics). Almost every Pulse gap is **frontend experience**,
> plus two net-new capabilities: a **PR/1RM/volume engine** and a **gamification layer**.

> **Update (2026-07-03):** The Pulse **presentation layer has since shipped** — the full dark
> "operator" theme is transcribed into `app/globals.css` (`@theme` tokens, Space Grotesk +
> JetBrains Mono via `next/font`), backed by a shadcn `components/ui/*` primitive set and a
> custom `components/pulse/*` component library, applied across **every** page. A fixed bottom
> `TabBar` and a slim branded top bar are wired into the root layout. This closes the two
> **Foundational** presentation gaps and the Home greeting; it does **not** close any feature
> capability — there is still no charting dependency, no live-session/timer, and no PR or
> gamification logic. The remaining gaps below are the *capabilities* the styling now frames.

> **Update (2026-07-05):** The **F1 — Home / Dashboard** screen has now been largely **built out**
> (feature, not just styling). A new `GET /api/home` endpoint (`app/routes/home.py`) aggregates the
> screen's read into `{ readiness, current_protocol }`, and a pure **Readiness domain**
> (`app/domain/readiness.py`) turns the Fitness Profile + Logged Sessions into a qualitative
> three-state signal. On the client, the dashboard now renders a **Session Hero**, a positional
> **Week Cycle strip**, and a **Queue list** off the Current Protocol's progressed view. Two
> ADRs frame the deliberate deviations from Pulse's dated mock: **ADR-0008** (F1 reinterprets
> Pulse's calendar-based design for the self-paced, calendar-free plan model) and **ADR-0009**
> (the week strip is whole-Protocol and positional). What is intentionally **not** built —
> because there is no honest basis for it (ADR-0008) — is the numeric **readiness percentage**,
> the **target-calorie**, and any single **volume/tonnage** figure. Live-session mode is still
> deferred to F2. The F1 section below is updated to match; the remaining sections are unchanged.

> **Update (2026-07-06):** The **F3 — Analytics** screen has now been **built out** across six
> vertical slices (feature, not just styling), and the long-missing **PR / 1RM / volume engine**
> now exists as shared backend capability. A new `GET /api/analytics?range=7d|30d|90d` endpoint
> (`app/routes/analytics.py`) is fed by a pure orchestration read model (`app/logbook/analytics.py`)
> over five net-new pure domain modules: **`load.py`** (a typed **Load** value object at the write
> boundary — ADR-0010 — persisted as JSON via migration 0010, so downstream reads never re-guess
> the free-text vocabulary), **`one_rep_max.py`** (Epley **Estimated 1RM**, trustworthy 1–12-rep
> window), **`personal_records.py`** (read-time **PR** detection — no PR table), **`muscle_groups.py`**
> (curated six-group roll-up, set-count weighted), and **`volume.py`** (total-volume series with a
> disclosed **coverage %**, now converting absolute, range, bodyweight, and %-1RM loads). The client
> renders a count-based **bento** (sessions · active days · sets · new PRs), a **muscle-distribution**
> bar split, a **Recent Records** feed, and a **total-volume line chart** — the first use of
> **Recharts**, which is now installed, closing the "no charting dependency" blocker that gated F3,
> F6, and the Home volume figure. **ADR-0010** and **ADR-0011** frame the typed-Load engine and F3's
> deliberate reinterpretation of Pulse onto honest aggregates. What is intentionally **not** built:
> the 1Y range, and any figure with no honest basis. The F3 and Cross-cutting sections below are
> updated to match; the remaining sections are unchanged.

> **Update (2026-07-07):** The **F2 — Active / Live Session** screen — this document's ⭐ *largest
> gap* — has now been **built out** across six vertical slices (feature, not just styling), closing
> the core plan/record loop. Running a Session live is an **ephemeral, client-side performance**
> (**ADR-0012**): React state persisted to a single `localStorage` slot (surviving refresh, crash,
> and phone-lock), with nothing reaching the backend until finish, at which point the existing
> `POST /api/sessions/{id}/logs` records the Logged Session at **per-set** granularity. The client
> (`components/LiveSessionScreen.tsx`, off a live hydration read `fetchLiveSession`) renders a
> **set-by-set table** pre-filled from progression-adjusted loads with a **previous-performance**
> column to beat, a **wall-clock elapsed timer** and a **rest countdown** (`−15 / SKIP / +15`,
> auto-resuming the next set — timers are timestamp-based so they survive backgrounding), a
> **set-based `% complete`** progress bar, and a **next-exercise preview**. Three ADRs frame the
> new domain rules: **ADR-0012** (ephemeral client-side Live Session), **ADR-0013** (a client-declared
> **Completion Outcome** — *Completed* / *Incomplete* — where only a *Completed* log advances the
> Protocol, so a partial workout leaves its Session as Next to be retried; backed by
> `domain/completion.py` and `protocols/progress.py`), and **ADR-0014** (**Session Duration** recorded
> from start to last activity, idle gaps excluded, with a 30-minute inactivity gap **auto-ending** the
> Live Session as Incomplete on the next foreground). Entry is wired from Home: the `SessionHero` CTA
> now launches live mode, and a `ResumeSessionBanner` surfaces an unfinished Live Session. At most
> **one** Live Session exists at a time (single slot), enforced rather than silently superseded. What
> is intentionally **not** built: cross-device resume (the one capability ADR-0012 forgoes) and a
> server-persisted Active Session entity. The F2 and F1 (SessionHero) sections plus the Cross-cutting
> and build-order sections below are updated to match; the remaining sections are unchanged.

---

## Onboarding & Auth (FO1–FO4)

Current state: a single Clerk modal sign-in + one flat profile form (`app/onboarding`).

- ❌ **Welcome / splash screen** (FO1) — branding, tagline ("Train by the numbers"), `INITIALIZE` / `LOG IN`.
- 🟡 **Favorite training-types step** (FO2) — multi-select of the domain's `TRAINING_TYPES` (strength / cardio / hiit / yoga / mobility). The chosen set becomes the keys of `fitness_levels`; the model exists and the profile-edit form already writes these, but the onboarding multi-select UX does not.
- 🟡 **Per-type level calibration** (FO3) — a 1–10 level for each selected training type. Maps **directly** onto `fitness_levels: Record<string, number>`; `app/profile/edit` already renders `level_<type>` inputs, so only the designed stepper/scale onboarding UX is missing.
- ❌ **Multi-step onboarding wizard** — the `01/03 → 03/03` stepper; current onboarding is one flat form.
- ❌ **Social auth** (FO4) — "Continue with Apple / Google".

## F1 — Home / Dashboard

Current state: a data-backed dashboard driven by `GET /api/home` — greeting + Readiness badge header, a **Session Hero** for the Current Protocol's Next Session (or a generate-training CTA in the empty state), a positional **Week Cycle strip**, a **Queue list**, an operations nav row, and a `DataList` profile snapshot (`app/dashboard/page.tsx`).

- ✅ **"Today's Protocol" hero card** — the `SessionHero` (`components/pulse/session-hero.tsx`) now renders the Current Protocol's Next Session with an honestly-backed stat row (**DURATION · MODULES · SETS**) and an `Open session` CTA to the Session page; the loads already carry the ADR-0004 Progression adjustment. The `Open session` CTA now **launches live mode** (`/sessions/{id}/live`) — the F2 Live Session has since shipped — and a `ResumeSessionBanner` surfaces above the hero whenever an unfinished Live Session is held in `localStorage`. **Deviations (ADR-0008):** no `target kcal` and no single volume/tonnage figure (no honest basis). The generate-training CTA remains as the empty state (no Current Protocol).
- 🟡 **Readiness score** ("87% READY") — a real, **computed** three-state badge (`READY` / `CAUTION` / `EXTRA CAUTION`) now renders in the header, derived server-side by `assess_readiness` (`app/domain/readiness.py`) from the profile's constraints + the most-recent Logged Session's difficulty — replacing the former static `is_sensitive`-only badge. The designed **numeric percentage** is deliberately not built: the calendar-free plan model gives no honest recovery clock (ADR-0008).
- ✅ **Week Cycle strip** — `WeekCycleStrip` (`components/pulse/week-cycle-strip.tsx`) shows the Current Protocol's Sessions as done / active / upcoming with a `WEEK n/total` overline. **Deviation (ADR-0008/0009):** it is **positional over the whole Protocol**, not a M–S calendar week — there are no weekday dots or dates.
- ✅ **Queued Protocols list** — `QueueList` (`components/pulse/queue-list.tsx`) lists the remaining upcoming Sessions under an honest `X/N` completion header, with a "view all" to the Protocol detail. **Deviation (ADR-0008):** no per-session completion/readiness **%**.
- ✅ **Personalized greeting** ("Hey, {display_name}") — shipped.

## F2 — Active / Live Session (was ⭐ largest gap — now shipped)

Current state: a client-side **Live Session** (`app/sessions/[id]/live`, `components/LiveSessionScreen.tsx`)
runs a Session set-by-set and records it per set on finish. The static after-the-fact form
(`LogSessionForm`) remains as the fallback path (and the only path for a performance not tracked live).
The Live Session is an **ephemeral client-side performance** (ADR-0012): React state persisted to a
single `localStorage` slot, nothing reaching the backend until finish.

- ✅ **In-progress session screen** — `LiveSessionScreen` runs the Session live with a **set-based `% complete`** progress bar. **Deviation (ADR-0013):** the bar reaches 100% exactly when every prescribed set is attempted — the bar *is* the Completed criterion — rather than tracking Pulse's `module 03/07` position.
- ✅ **Live set-by-set table** — per-set rows pre-filled from progression-adjusted loads, each Exercise carrying a **previous-performance** value to beat (hydrated by `fetchLiveSession`, F2·S5), with per-set completion advancing the current-set pointer. Logs at **per-set** granularity (one Logged Set per completed set) versus the static form's one-per-Exercise collapse.
- ✅ **Rest timer** — a wall-clock countdown between sets (`−15 / SKIP / +15`, `REST_ADJUST_STEP_SECONDS = 15`) that auto-resumes into the next set on elapse. Timestamp-based (`lib/live-timer.ts`), so it survives a phone lock — the first timer in the app.
- ✅ **Elapsed workout timer** — a wall-clock elapsed timer derived from the stored `startedAt` against a ticking `now`, backing the recorded **Session Duration** (ADR-0014, start-to-last-activity with idle gaps excluded; a 30-minute idle gap auto-ends the session Incomplete on next foreground).
- ✅ **Next-exercise preview** — a "Next up: {exercise}" line from `nextExercise(state)`.

## F3 — Analytics

Current state: a data-backed Analytics screen (`app/analytics/page.tsx`) driven by
`GET /api/analytics?range=7d|30d|90d` — a count-based bento, a muscle-distribution split, a
Recent Records feed, and a total-volume line chart. `app/metrics` (body-metric table) and
`app/history` (session list) remain as their own list/table surfaces.

- ✅ **Total volume chart** with trend + % delta — `VolumeChart` (`components/pulse/volume-chart.tsx`, the app's first **Recharts** use) plots daily-bucketed volume from `domain/volume.py`, with a `+N%` delta over the preceding equal-length window and a **coverage caption** disclosing the share of logged reps that actually converted. Absolute, range, bodyweight, and %-1RM loads all convert; qualitative/load-less sets fall into the disclosed uncovered fraction rather than being fabricated as zero. **Deviation (ADR-0011):** no fixed headline figure like "128,400 KG" — the honest number is window- and coverage-dependent.
- 🟡 **Range toggle** — a shared **7D / 30D / 90D** toggle is wired across every tile and the chart. **Deviation:** Pulse's **1Y** is replaced by 90D (no honest basis for a year of aggregates on the current data volume).
- ✅ **Bento stats** — `Bento` (`components/pulse/bento.tsx`) renders four honest tiles: **sessions**, **active days** (distinct performed-on), **total sets**, and range-scoped **new PRs**. **Deviation:** "avg time" is not shown — Session Duration is now recorded for *live-tracked* performances (ADR-0014) but not for statically-logged ones, so an honest average is not yet surfaced here.
- ✅ **Muscle distribution** — labeled operator-theme bars from `domain/muscle_groups.py`, a curated roll-up of each Exercise's free-form `targeted_muscles` into six groups (Legs / Chest / Back / Shoulders / Arms / Core) plus an explicit **Unclassified** bucket, weighted by set count and split evenly across the groups a Set maps to (percentages sum to 100%).
- ✅ **Recent Records / PR feed** — the last 8 all-time PRs (exercise · new Estimated 1RM · gain over prior PR · date), from read-time `domain/personal_records.py` on top of Epley `domain/one_rep_max.py`. Decoupled from the range toggle so the feed is rarely empty; only absolute-Load sets in the 1–12-rep window qualify.

## F4 — Protocol Builder

Current state: AI generation form + read-only protocol view (`app/protocols/new`, `app/protocols/[id]`). No manual/visual builder.

- ❌ **Visual week matrix** — M–S grid with per-day module counts.
- ❌ **Day/module editor** — add, remove, edit Exercise Prescriptions (sets×reps, load) directly.
- ❌ **`ADD MODULE`** interaction.
- ❌ **Exercise Library browser** — searchable catalog ("420 movements", `QUERY MOVEMENTS…`). No exercise-search UI exists.
- ❌ **Protocol config panel** — frequency / cycle length / mode as editable knobs.
- ❌ **`SIMULATE` / `DEPLOY PROTOCOL`** flow.

## F5 — Profile

Current state: a profile-edit form (`app/profile/edit`).

- ❌ **Gamification** — user Level + XP with progress-to-next ("LVL 12 · 760 XP → LEVEL 13"). *(Separate from the domain's per-type `fitness_levels`.)*
- ❌ **Lifetime stats** — total workouts, total hours, current streak.
- ❌ **Achievements / badges** — locked & unlocked states, "See all".
- ❌ **Settings panel** — units (kg/lb), default rest-timer duration, appearance. *(The app is now committed dark-only via `globals.css` `color-scheme: dark`; a light theme would be net-new.)*
- ❌ **Health integrations** — Apple Health linking.
- ❌ **Account section** — notifications, privacy & data, help & support, log out (only Clerk's `UserButton` today).

## F6 — Exercise Detail

Current state: name, description, difficulty, muscles, variations/alternatives (`app/exercises/[id]`).

- ❌ **Tabbed layout** — Specs / History / Records.
- ❌ **Numbered execution steps** — instructions exist in the catalog but aren't rendered step-by-step.
- ❌ **Muscle map** — primary/secondary visualization.
- ❌ **Per-exercise stats** — Personal Best, estimated 1RM, total logs count.
- 🟡 **Top-set trend chart** — last N sessions ("+7.5KG"). `/exercises/[id]/progress` returns the time series; the charting blocker is now gone (**Recharts** shipped with F3), so this is wiring the existing series into a `VolumeChart`-style component.
- ❌ **`ADD TO PROTOCOL`** action.

## Cross-cutting / Foundational

- ✅ **Bottom tab bar navigation** — a fixed `TabBar` (`components/pulse/tab-bar.tsx`) is wired into the layout for signed-in users. **Deviation:** it collapses Pulse's five tabs into **four** — Home / Train / Stats / Profile — mapping onto *existing* routes (`/dashboard`, `/sessions`, `/history`, `/profile`), because the dedicated Session / Analytics / Builder destinations don't exist yet. Re-expanding to five tabs is a follow-up once F2–F4 land.
- ✅ **Design system** — Pulse's dark, mono-accented "operator" theme is transcribed into `app/globals.css` as `@theme` tokens (`--color-*`, `--radius-*`, `--spacing-shell`, fonts via `next/font`), consumed through shadcn `components/ui/*` + custom `components/pulse/*` primitives across all pages. Replaces the former `system-ui` + inline styles.
- ✅ **Personal Records (PR) engine** — now shipped as shared read-time capability on top of the typed Load (ADR-0010): `domain/one_rep_max.py` (Epley **Estimated 1RM**, 1–12-rep window) and `domain/personal_records.py` (**PR** detection over a chronological Logged-Set stream — a set is a PR when its Estimated 1RM strictly beats every prior set's for that Exercise). Read-time only — **no PR table, no write hook**. Surfaced on Analytics (F3) today; still to be wired into Home and Exercise Detail (F6). A companion `domain/volume.py` engine converts typed loads (absolute, range, bodyweight, %-1RM) into total volume with a disclosed coverage %.
- 🟡 **Readiness / target-calorie metrics** — **Readiness** now ships as a computed, qualitative three-state signal (`app/domain/readiness.py`, surfaced on Home via `GET /api/home`); the numeric **readiness percentage** and **target-calorie** are deliberately not built (no honest basis, ADR-0008). The Active Session (F2) has since shipped but, consistent with ADR-0008, surfaces neither on it.
- 🟡 **Completion Outcome + Session Duration** — new domain rules landed with F2: a client-declared **Completion Outcome** (Completed / Incomplete) gates Protocol advancement (ADR-0013, `domain/completion.py` + `protocols/progress.py`), and a live-tracked **Session Duration** is now recorded, idle-bounded (ADR-0014). Duration is known only for **live-tracked** performances; ADR-0011's "avg time" figure gains an honest basis but is not yet surfaced on Analytics.
- ❌ **Streak tracking** — appears on Profile and implicitly in Analytics ("active days").

---

## Highest-leverage missing capabilities (suggested build order)

1. ~~**Live Active Session + rest timer** (F2)~~ — **shipped** (ADR-0012/0013/0014): the core plan/record loop is now closed with a per-set live mode, rest + elapsed timers, and Completion-Outcome-gated advancement.
2. **Gamification layer** (XP / levels / streaks / achievements) — powers F5 and recurs on Home & Analytics. Now the largest net-new gap; **Streak tracking** is a natural first slice off the existing "active days" aggregate.
3. **Fan the PR / 1RM / volume engine out** to F6 (Exercise Detail Personal Best / estimated 1RM / top-set trend) and F1 (Home), reusing the shared `one_rep_max` / `personal_records` / `volume` domain modules already backing Analytics.

Both #1 (the F2 Live Session) and the **PR / 1RM / volume analytics engine** (F3) have now shipped, so
the remaining work is **capability, not styling** *and no longer net-new analytics logic or the live
loop*: item 2 is the last big fresh domain, and item 3 plus the lower-leverage gaps (Protocol Builder
F4, Exercise Detail tabs/charts F6) are mostly *wiring already-existing data* (protocols, sessions,
prescriptions, logs, metrics, exercise catalog, the `/exercises/[id]/progress` time series, and now the
analytics engine) into the styled components. The charting-library blocker is gone — **Recharts** shipped
with F3.
