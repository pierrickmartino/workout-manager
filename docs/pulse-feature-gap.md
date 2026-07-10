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

> **Update (2026-07-08):** The **F6 — Exercise Detail** screen has now been **built out** across seven
> vertical slices (feature, not just styling), fanning the shipped Estimated-1RM / PR engine (ADR-0010)
> out onto a per-exercise screen — item 3 of the build order below. The page is now Pulse's **tabbed
> layout** — a stat header over **SPECS / HISTORY / RECORDS** — with the active lens URL-driven via
> `?tab=` (`components/exercise/exercise-tabs.tsx`, off a `toExerciseTab` view helper). A new
> `GET /api/exercises/{id}/records` endpoint (`app/routes/records.py`) over a pure read model
> (`app/logbook/exercise_records.py`) reuses `one_rep_max.py` / `personal_records.py` — **no new
> strength logic** — to serve the header's **PERSONAL RECORD** (highest Estimated 1RM) + **TOTAL SETS**
> tiles, the **Top-Set Trend** series (best Est. 1RM per qualifying session, last 8), and the **RECORDS**
> PR-milestone feed. **SPECS** renders numbered **Execution Steps** and a **PRIMARY / SECONDARY** muscle
> map, and **HISTORY** absorbs the former standalone `/exercises/[id]/progress` list (now redirected). Two
> of the three catalog-touching slices changed the *shared catalog* schema: **`instructions` became an
> ordered `list[str]`** (ADR-0015, migration 0013) and the catalog gained stored **`primary_muscles` /
> `secondary_muscles`** (ADR-0016, migration 0014) as an emphasis annotation over the kept
> `targeted_muscles` union — so F3's muscle roll-up is untouched — populated for `ai_generated` rows by a
> one-off re-enrichment pass (`app/generation/muscle_emphasis_reenrichment.py`). Three ADRs frame the
> deviations: **ADR-0015** (Execution Steps, no sentence-chopping), **ADR-0016** (muscle emphasis split,
> amends ADR-0011), and **ADR-0017** (F6 shows **one** strength tile not two, hides strength surfaces for
> non-absolute exercises rather than zeroing them, and treats "top set" as best Est. 1RM). What is
> intentionally **not** built: `ADD TO PROTOCOL` (a real add needs the F4 Protocol-Builder mutation model —
> ADR-0001/0017 — so it ships as an honest **disabled seam**, never a faked write), plus the mock's hero
> photo and favorite control (no honest basis). The F6, Cross-cutting, and build-order sections below are
> updated to match; the remaining sections are unchanged.

> **Update (2026-07-08, later):** The **F5 — Profile** screen and its **gamification layer** — item 2 of
> the build order below and *the last big net-new domain* — have now been **built out** across four vertical
> slices (feature, not just styling). The whole game layer is a **read-time projection of the Logged record,
> not a ledger** (**ADR-0018**): exactly like the PR engine (ADR-0010) there is **no XP table, no unlock
> table, and no write-path hook** — every figure recomputes from the logs on read, so it can never drift,
> backfills every existing user for free, and is honestly **non-monotonic** (deleting logs lowers XP, can
> drop the Level, and re-locks a badge). A new `GET /api/profile/progress` endpoint (`app/routes/profile_progress.py`)
> over a pure read model (`app/logbook/profile_progress.py`) projects the user's Logged Sessions onto three
> net-new pure domain modules: **`experience.py`** (**XP** = a flat `SESSION_XP` per Logged Session + `PER_SET_XP`
> per attempted Logged Set — training-type-neutral, live-vs-static-neutral, outcome-neutral by construction —
> feeding a closed-form, unbounded **Operator Level** curve with no stored table), **`streak.py`** (the **Streak**
> — consecutive weeks with ≥1 Logged Session, plus `longest_week_run` behind the streak Achievements), and
> **`achievements.py`** (a curated, **type-neutral** catalog — 5/25/100 Sessions, 4/12-week Streak, all-six
> Muscle-Group coverage, first Personal Record — each unlocked iff its predicate currently holds, with live
> `current/target` progress while locked and an honest `unlocked_on` recovered by chronological replay). The
> client's net-new Profile view (`app/profile/page.tsx`) renders a `LevelBadge` (XP progress bar), a **LIFETIME**
> bento (**Streak · Total Sessions · Total Sets**), a compact `AchievementWall` with a "see all" to the full
> catalog (`app/profile/achievements/page.tsx`), and an **Account** section (edit-profile link + explicit
> `SignOutRow`). **ADR-0019** frames the screen-level scope: the **Streak is weekly, not daily** — deliberately,
> because the plan model is calendar-free (ADR-0008) *and* a daily chain would pressure users to train through
> the rest days this safety-first domain treats as legitimate. Slice 4 also shipped the first real **Setting** —
> a **default rest-timer duration** on the Fitness Profile (nullable `default_rest_seconds`, migration 0015),
> which the Live Session's `resolveRestSeconds` now prefers over each Prescription's own `rest_seconds`
> (an independent settings value, *not* part of the gamification projection). What is intentionally **not**
> built (ADR-0019, honestly-unbuildable not deferred): **total-hours** lifetime stat (Session Duration is
> live-only, ADR-0014 — same call as Analytics' avg-time), **appearance/theme** (the app is committed dark-only),
> **Apple Health** (HealthKit has no web API), and **notifications settings** (no subsystem to configure).
> Named future slices: **units (kg/lb)**, **account/data deletion**, and the **Home/Analytics gamification
> fan-out**. The F5, Cross-cutting, and build-order sections below are updated to match; the remaining sections
> are unchanged.

> **Update (2026-07-10):** The **F4 — Protocol Builder** screen — the last big open screen and the app's
> **first manual authoring / mutation model** — has now been **built out** across seven vertical slices
> (feature, not just styling), so *every* Pulse screen is now feature-backed. Until now a Protocol could be
> created **only** by Adopt (ADR-0003) and changed **only** by Substitution / Regeneration; F4 lets a user edit
> the plan itself — grow/shrink weeks and per-week session count, add/remove Sessions, and author, reorder, and
> delete Exercise Prescriptions by hand. The central safety rule is **ADR-0020**: editing only ever reaches the
> **un-performed tail** — a Session with an advancing Logged Session (ADR-0013) is settled record and is never
> rewritten, so Logged Sessions, PRs (ADR-0010), and the Progression overlay (ADR-0004) can never be orphaned.
> Edits **stage client-side** (mirroring the Live Session's ephemeral posture, ADR-0012) and commit atomically
> with **`DEPLOY`**, which sends the desired un-performed tail; the server **replaces that tail in place**,
> preserving performed `session_id`s untouched, and is the single **validation gate** (rejecting empty Sessions,
> Prescriptions with no valid catalog Exercise, `sets < 1`, or an empty rep target — load stays optional). The
> **frozen performed prefix is server-enforced** (`app/protocols/deploy_validation.py`), not merely respected by
> the client. A new `POST /api/protocols/{id}/deploy` endpoint drives the tail-replace over
> `app/protocols/reenumeration.py`, backed by a nullable Protocol **`name`** column (Pulse's "PROTOCOL ID",
> migration 0016, with a derived `objective · training_type` fallback label so existing Protocols read fine
> unbackfilled) and a net-new `GET /api/exercises?query=` **Exercise Library** search (the catalog had only
> `get`-by-id before). On the client, a net-new `ProtocolBuilder` (`components/ProtocolBuilder.tsx`, off
> `app/protocols/[id]/edit`) hosts the whole staged draft over `lib/protocol-builder.ts`, with an
> `ExerciseLibrary` pick panel and a `MuscleSplit` preview. **ADR-0021** frames the screen-level reinterpretation
> (as with every prior F): the week matrix is **positional Week × session-slot**, not a M–S weekday grid
> (calendar-free, ADR-0001/0009); **`MODE`/`HYPER` is dropped** (no field behind it); **`SIMULATE` is a
> non-predictive balance preview** (`POST /api/protocols/{id}/simulate` over `app/protocols/balance_preview.py`,
> reusing the curated Muscle-Group roll-up, ADR-0011 — no fatigue/volume prediction, just "this plan is 60% Legs"
> before you commit); and the **Exercise Library is pick-only over the shared catalog** — no manual free-create,
> because a raw name-only insert would pollute the global deduped/enriched catalog (ADR-0002) for every user.
> Hand-set loads stay **Progression-adjustable** (no pin flag) and `sessions_per_week` becomes a **soft default**,
> not a rigid invariant (ADR-0020). Slice 7 also **unblocks F6's `ADD TO PROTOCOL`**: the disabled seam ADR-0017
> left now **deep-links into the builder** with the Exercise queued for placement into an un-performed Session of
> the user's Current Protocol — staying the honest disabled seam only when there is no Protocol or no un-performed
> Session. What is intentionally **not** built: **blank-slate authoring** of a brand-new Protocol (a larger
> surface that partly duplicates generation — v1 layers "create empty + apply these edits" on later over exactly
> these primitives, ADR-0020); **manual Exercise free-create** (a generation concern, ADR-0021); the **`MODE`
> knob**; editable **`objective` / `training_type` / `duration_minutes`** (generation/cache provenance, cascade
> ambiguity with no payoff); and any predictive simulation. The F4, F6 (`ADD TO PROTOCOL`), Cross-cutting, and
> build-order sections below are updated to match; the remaining sections are unchanged.

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

## F4 — Protocol Builder (now shipped)

Current state: a manual **Protocol Builder** (`app/protocols/[id]/edit`, `components/ProtocolBuilder.tsx`) edits an adopted Protocol's shape and Prescriptions as a client-side staged draft, committed atomically by `DEPLOY`. The AI generation form (`app/protocols/new`) and read-only protocol view (`app/protocols/[id]`) remain. This is the app's **first manual authoring / mutation model** — it edits only the **un-performed tail**, leaving the settled record frozen (ADR-0020).

- ✅ **Visual week matrix** — a **positional Week × session-slot** grid (rows = weeks, columns = the 1..N Sessions in that week, cell = Prescription count). **Deviation (ADR-0021/0009):** it is positional, **not** an M–S weekday grid with dates — the plan model is self-paced and calendar-free (ADR-0001), and it renders the *actual* per-week count rather than assuming a fixed frequency (deload weeks legitimately differ).
- ✅ **Day/module editor** — Exercise Prescriptions can be added, removed, edited (sets × reps, load), **and reordered** (`position` is just a field) within any un-performed Session, staged in `lib/protocol-builder.ts`. Load entry **reuses the log form's kind-picker** (`load_from_input`) so building a Prescription and logging a set speak one Load language. Hand-set loads stay **Progression-adjustable** (no pin flag, ADR-0020) — a manual load is simply the base the ADR-0004 overlay nudges from.
- ✅ **`ADD MODULE` interaction** — new Session slots are created by growing the shape (more weeks / higher frequency) as **empty skeletons** the user fills from the catalog; `DEPLOY` rejects any still-empty Session (an empty Session would otherwise surface as the Next Session and launch an empty Live Session). **Deviation (ADR-0020):** `sessions_per_week` is a **soft default / header value**, not a rigid invariant — a frequency change applies to un-performed/new weeks while frozen performed weeks keep their real counts.
- ✅ **Exercise Library browser** — a searchable catalog panel (`components/ExerciseLibrary.tsx`) over the net-new `GET /api/exercises?query=` (the catalog had only `get`-by-id before), surfacing each row's `provenance` exactly as the Session view and Exercise Detail do. **Deviation (ADR-0021):** it is **pick-only** — no manual free-create, because a raw name-only insert would pollute the global deduped/enriched shared catalog (ADR-0002) for every user; a wanted-but-absent movement is a **generation** concern, a documented v1 limitation not a faked seam.
- 🟡 **Protocol config panel** — an editable **`name`** (Pulse's "PROTOCOL ID", nullable, migration 0016, derived `objective · training_type` fallback) plus **frequency** and **weeks**. **Deviations (ADR-0021):** the config is deliberately narrowed to `name` + frequency + weeks; **`objective` / `training_type` / `duration_minutes`** are shown but **not editable** in v1 (generation/cache provenance, cascade-to-Sessions ambiguity with no payoff), and Pulse's **`MODE`/`HYPER` knob is dropped** — no `mode` field exists and none is added (a fabricated control with nothing behind it).
- ✅ **`SIMULATE` / `DEPLOY PROTOCOL` flow** — **`DEPLOY`** (`POST /api/protocols/{id}/deploy`) is the single commit + validation gate: it sends the desired un-performed tail and the server **replaces that tail in place** (performed `session_id`s preserved untouched, frozen prefix **server-enforced** via `app/protocols/deploy_validation.py` + `app/protocols/reenumeration.py`), rejecting empty Sessions, Prescriptions with no valid catalog Exercise, `sets < 1`, or an empty rep target. **`SIMULATE`** (`POST /api/protocols/{id}/simulate`, `app/protocols/balance_preview.py`) is reinterpreted as a **non-predictive balance preview** — per-week session/set counts and the **Muscle-Group distribution across the whole edited Protocol** (reusing `domain/muscle_groups.py`, ADR-0011). **Deviation (ADR-0021):** no fatigue/volume/1RM projection (no fatigue model, no recovery clock, no honest headline volume) — just what the plan you built actually *is*.

**Deviation — blank-slate authoring (ADR-0020):** creating a brand-new Protocol from scratch is intentionally **not** in v1 scope (a larger surface that partly duplicates generation); the builder edits an existing adopted Protocol, and "create empty + apply the same edits" can layer on later over exactly these primitives.

## F5 — Profile (now largely shipped)

Current state: a data-backed Profile view (`app/profile/page.tsx`) driven by `GET /api/profile/progress` — an Operator-Level badge with an XP progress bar, a LIFETIME bento (Streak · Total Sessions · Total Sets), a compact Achievement wall with a "see all" to the full catalog (`app/profile/achievements`), and an Account section. The `app/profile/edit` form remains as the Fitness Profile editor. The whole gamification layer is a read-time projection of the Logged record — no XP/unlock table, no write hook (ADR-0018).

- ✅ **Gamification** — user Level + XP with progress-to-next. `LevelBadge` (`components/pulse/level-badge.tsx`) renders the **Operator Level** and an XP bar toward the next level, from `domain/experience.py`: **XP** is a flat `SESSION_XP` per Logged Session + `PER_SET_XP` per attempted Logged Set (training-type-neutral, live-vs-static-neutral, outcome-neutral by construction), and **Operator Level** is a closed-form, unbounded curve over that XP with no stored table. **Deviation (ADR-0018):** every figure is read-time and **non-monotonic** (deleting logs lowers XP and can drop the Level); this is distinct in every dimension from the domain's per-type `fitness_levels` (ability vs. account-wide investment).
- 🟡 **Lifetime stats** — a LIFETIME `Bento` shows **Streak · Total Sessions · Total Sets**, all-time counts over the whole record. **Deviation (ADR-0019):** **total hours is dropped** — Session Duration is known only for live-tracked performances (ADR-0014), so a lifetime total would badly understate reality (the same call that kept avg-time off the Analytics bento, ADR-0011); it earns its place once statically-logged Sessions also capture a duration.
- ✅ **Achievements / badges** — `AchievementWall` (`components/pulse/achievement-wall.tsx`) renders a curated, **type-neutral** catalog from `domain/achievements.py` (5/25/100 Sessions, 4/12-week Streak, all-six-Muscle-Group coverage, first Personal Record), each unlocked iff its predicate currently holds, with live `current/target` progress while locked and an honest `unlocked_on` recovered by chronological replay. The compact Profile summary shows the first four with a **SEE ALL** to the full catalog page. **Deviation (ADR-0018):** no unlock table — a badge re-locks if the logs behind it are deleted; the type-neutral majority means a yoga/mobility user never faces an all-locked strength wall.
- 🟡 **Settings panel** — the first real setting shipped: a **default rest-timer duration** on the Fitness Profile edit form (nullable `default_rest_seconds`, migration 0015), which the Live Session's `resolveRestSeconds` now prefers over each Prescription's own `rest_seconds` (ADR-0019, F5 Slice 4). **Deviations (ADR-0019):** **units (kg/lb)** is a named future slice (scoped as store-canonical-kg / convert-at-every-boundary, not a smuggled toggle), and **appearance/theme** is omitted as honestly-unbuildable — the app is committed dark-only (`globals.css` `color-scheme: dark`); a light theme is net-new effort, not a toggle.
- ❌ **Health integrations** — Apple Health linking. **Omitted, not deferred (ADR-0019):** HealthKit has no web API and there is no native iOS shell to bridge through, so it is not buildable in this architecture — never stubbed as a faked seam.
- 🟡 **Account section** — an **Account** card with an edit-fitness-profile link and an explicit **log out** (`SignOutRow`, surfaced from the existing Clerk control). **Deviations (ADR-0019):** **notifications settings** are omitted (no notification subsystem to configure), and **account/data deletion** is a named future slice built to *actually* cascade-delete (a button that only promised deletion would be the worst faked seam).

## F6 — Exercise Detail (now shipped)

Current state: a tabbed Exercise Detail screen (`app/exercises/[id]/page.tsx`) — a Personal Record + Total Sets stat header over **SPECS / HISTORY / RECORDS** tabs (URL-driven via `?tab=`), backed by `GET /api/exercises/{id}/records` and reusing the shipped Estimated-1RM / PR engine (ADR-0010). The former standalone `/exercises/[id]/progress` list is folded into HISTORY and redirected.

- ✅ **Tabbed layout** — `ExerciseTabs` (`components/exercise/exercise-tabs.tsx`) renders three non-redundant lenses (ADR-0017): **SPECS** (Execution Steps · muscle map · top-set trend), **HISTORY** (every Logged Session of this Exercise), **RECORDS** (only the PR-setting sets). The active tab is URL-driven so refresh and shared links land on the same lens.
- ✅ **Numbered execution steps** — `instructions` is now an ordered `list[str]` in the shared catalog (ADR-0015, migration 0013), rendered by `SpecsPanel` as a numbered `01…0N` list. **Deviation (ADR-0015):** the step count is exactly what the author wrote — a single-element list renders as an un-numbered guidance block (never a lone "01"), and legacy prose backfilled by **newline split only**, no sentence-chopping.
- ✅ **Muscle map** — a **PRIMARY / SECONDARY** split now stored on the catalog (`primary_muscles` / `secondary_muscles`, ADR-0016, migration 0014) as an emphasis annotation over the kept `targeted_muscles` union. **Deviation (ADR-0016):** primacy is only shown where enrichment actually asserts it (populated for `ai_generated` rows by a one-off re-enrichment pass); an Exercise with no asserted split falls back to a flat targeted-muscle row rather than fabricating primacy. No anatomical diagram — labeled muscle sections, consistent with the operator theme.
- 🟡 **Per-exercise stats** — `StatHeader` (`components/exercise/stat-header.tsx`) shows a single **PERSONAL RECORD** (highest Estimated 1RM) beside **TOTAL SETS** (a Logged-Set count). **Deviation (ADR-0017):** one strength tile, not Pulse's two (`PERSONAL BEST` load + `EST. 1RM`) — CONTEXT.md reserves "Personal Record" for the highest Est. 1RM. For a bodyweight / qualitative / %-1RM / range exercise the PR tile is **hidden, not zeroed** (TOTAL SETS always shows); a `0 kg` would be fabricated.
- ✅ **Top-set trend chart** — `TopSetTrendChart` (`components/exercise/top-set-trend-chart.tsx`), a Recharts bar chart of the best **Est. 1RM per qualifying session** (last 8, no zero-padding) with a `latest − oldest` pill. **Deviation (ADR-0017):** "top set" is defined as best Est. 1RM so the trend, the PR tile, and the RECORDS tab tell **one** strength story on the same yardstick; one qualifying session shows a single bar and no pill, and the chart is hidden entirely for non-absolute exercises.
- ✅ **`ADD TO PROTOCOL`** action — now **wired to the Protocol Builder** (F4 Slice 7, ADR-0021): the CTA **deep-links into the builder** with this Exercise queued for placement into an un-performed Session of the user's Current Protocol (a staged edit, deployed like any other, ADR-0020). **Deviation (ADR-0017/0021):** when there is no Current Protocol or no un-performed Session it stays the honest **disabled seam** ADR-0017 left — never a faked write — since a real add still requires the F4 mutation model and an editable target.

## Cross-cutting / Foundational

- ✅ **Bottom tab bar navigation** — a fixed `TabBar` (`components/pulse/tab-bar.tsx`) is wired into the layout for signed-in users. **Deviation:** it collapses Pulse's five tabs into **four** — Home / Train / Stats / Profile — where `TRAIN` now spans the shipped Session / Protocol / Exercise / Builder destinations (`match: ["/sessions", "/protocols", "/exercises"]`) and `STATS` spans Analytics / History / Metrics, rather than giving the Builder its own tab. Now that F2–F4 have all landed, re-expanding to a dedicated fifth tab is an optional polish call, not a blocked follow-up.
- ✅ **Design system** — Pulse's dark, mono-accented "operator" theme is transcribed into `app/globals.css` as `@theme` tokens (`--color-*`, `--radius-*`, `--spacing-shell`, fonts via `next/font`), consumed through shadcn `components/ui/*` + custom `components/pulse/*` primitives across all pages. Replaces the former `system-ui` + inline styles.
- ✅ **Personal Records (PR) engine** — now shipped as shared read-time capability on top of the typed Load (ADR-0010): `domain/one_rep_max.py` (Epley **Estimated 1RM**, 1–12-rep window) and `domain/personal_records.py` (**PR** detection over a chronological Logged-Set stream — a set is a PR when its Estimated 1RM strictly beats every prior set's for that Exercise). Read-time only — **no PR table, no write hook**. Surfaced on Analytics (F3) and now on Exercise Detail (F6, via `logbook/exercise_records.py` — Personal Record tile, Top-Set Trend, RECORDS feed); still to be wired into Home. A companion `domain/volume.py` engine converts typed loads (absolute, range, bodyweight, %-1RM) into total volume with a disclosed coverage %.
- 🟡 **Readiness / target-calorie metrics** — **Readiness** now ships as a computed, qualitative three-state signal (`app/domain/readiness.py`, surfaced on Home via `GET /api/home`); the numeric **readiness percentage** and **target-calorie** are deliberately not built (no honest basis, ADR-0008). The Active Session (F2) has since shipped but, consistent with ADR-0008, surfaces neither on it.
- 🟡 **Completion Outcome + Session Duration** — new domain rules landed with F2: a client-declared **Completion Outcome** (Completed / Incomplete) gates Protocol advancement (ADR-0013, `domain/completion.py` + `protocols/progress.py`), and a live-tracked **Session Duration** is now recorded, idle-bounded (ADR-0014). Duration is known only for **live-tracked** performances; ADR-0011's "avg time" figure gains an honest basis but is not yet surfaced on Analytics.
- ✅ **Gamification engine** — now shipped as a shared read-time projection of the Logged record (ADR-0018), mirroring the PR engine (ADR-0010): `domain/experience.py` (**XP** + closed-form **Operator Level**), `domain/streak.py` (weekly **Streak** + `longest_week_run`), and `domain/achievements.py` (a curated, type-neutral **Achievement** catalog). Read-time only — **no XP table, no unlock table, no write hook** — so every figure recomputes from the logs, backfills existing users for free, and is non-monotonic. Surfaced on **Profile (F5)** via `logbook/profile_progress.py` + `GET /api/profile/progress`; the **Home / Analytics fan-out** is a named later slice (as the PR engine landed on Analytics before Home).
- ✅ **Streak tracking** — a weekly **Streak** (`domain/streak.py`) now ships on Profile: consecutive weeks with ≥1 Logged Session, on the same distinct-date basis as Analytics' active days. **Deviation (ADR-0019):** deliberately **weekly, not daily** — the plan model is calendar-free (ADR-0008) *and* a daily don't-break-the-chain mechanic would pressure users to train through the rest days a safety-first domain (Sensitive Constraints, Readiness caution) treats as legitimate.

---

## Highest-leverage missing capabilities (suggested build order)

1. ~~**Live Active Session + rest timer** (F2)~~ — **shipped** (ADR-0012/0013/0014): the core plan/record loop is now closed with a per-set live mode, rest + elapsed timers, and Completion-Outcome-gated advancement.
2. ~~**Gamification layer** (XP / levels / streaks / achievements)~~ — **F5 (Profile) shipped** (ADR-0018/0019): XP + Operator Level, the weekly Streak, and the type-neutral Achievement catalog all ship as a **read-time projection of the Logged record** (no XP/unlock table, no write hook), over the net-new `domain/experience.py` / `streak.py` / `achievements.py` and the `logbook/profile_progress.py` read model. The remaining fan-out target is **Home / Analytics** (surfacing XP/Level/Streak off the same endpoint), and the named F5 follow-on slices — **units (kg/lb)**, **account/data deletion** — are self-contained settings work, not fresh domain.
3. ~~**Fan the PR / 1RM / volume engine out** to F6~~ — **F6 (Exercise Detail) shipped** (ADR-0015/0016/0017): the Personal Record tile, Top-Set Trend, and RECORDS feed reuse the shared `one_rep_max` / `personal_records` engine over the new `logbook/exercise_records.py` read model. The remaining fan-out target is **F1 (Home)**, plus the two catalog-schema pieces this landed (Execution Steps as `list[str]`, muscle emphasis split) are now available to any future consumer.

4. ~~**Protocol Builder** (F4) — the manual mutation model~~ — **F4 (Protocol Builder) shipped** (ADR-0020/0021):
   the app's first manual authoring model edits the **un-performed tail** of an adopted Protocol (frozen performed
   prefix, server-enforced), staging a client-side draft that commits atomically via `POST /api/protocols/{id}/deploy`,
   with a net-new `GET /api/exercises?query=` Exercise Library, a non-predictive `SIMULATE` balance preview, and a
   Protocol `name`. This also unblocked F6's `ADD TO PROTOCOL` (Slice 7). Remaining v1 limitations are **blank-slate
   authoring** and **manual Exercise free-create** (both scoped out, not faked).

#1 (the F2 Live Session), the **PR / 1RM / volume analytics engine** (F3), **F6 (Exercise Detail)**, the
**F5 (Profile) gamification layer**, and now the **F4 (Protocol Builder) mutation model** have all shipped —
so *every net-new domain the analysis called out is built* **and every Pulse screen is now feature-backed**:
the live loop, the analytics engine, the per-exercise records screen, the XP/Level/Streak/Achievement engine,
and the manual authoring model. The remaining work is **capability wiring, not fresh domain or styling** —
*fanning already-shipped engines* (gamification onto Home/Analytics, the PR engine onto Home) and *self-contained
settings* (units, account deletion) into the styled components, plus the two documented F4 v1 limitations
(blank-slate authoring, manual Exercise create) — over data and engines that already exist (protocols, sessions,
prescriptions, logs, metrics, exercise catalog, and the analytics / exercise-records / gamification / builder
engines). The charting-library blocker is long gone — **Recharts** shipped with F3 and backs the F6 Top-Set
Trend chart too.
