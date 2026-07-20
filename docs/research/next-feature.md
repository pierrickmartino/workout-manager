# Next Features — Research-Sourced Improvement Backlog

A web-research sweep (July 2026) of where fitness / workout apps are heading,
classified into candidate features and improvements for **workout-manager**.
Each item is a title plus a short description. Where the market pulls against a
load-bearing invariant (`CLAUDE.md`, `CONTEXT.md`, `docs/adr/`), the item says so
explicitly — the point is a *conscious* position, not a silent adoption. Nothing
here changes source, ADRs, or `CONTEXT.md`; it is forward-looking fuel for the
issue tracker.

Sources are listed at the end.

---

## 1. AI & Adaptive Coaching

### Conversational Coach Layer
The 2026 consensus critique is that most apps are "loggers, not coaches." Leaders
(Ray, Zing, Caliber) wrap generation in a chat surface: the user asks "make this
easier", "I only have 30 minutes", "my shoulder feels off", and the plan changes
with an explanation. We already have the seams — the LLM port (ADR-0006),
Regeneration, and Substitution — but no natural-language front door to them. A
scoped conversational layer that translates intent into our existing typed
operations (regenerate this Session, substitute this Prescription, adjust Load)
would close the biggest perceived gap without inventing new domain concepts.
It must route through `parse_*` boundaries and never mutate the cache — only the
user's own copy. This is narrative and UX, not new domain machinery.

### Adaptive Progression Narration
Our Progression is already deterministic and read-time (no AI, no stored ledger),
which is a strength — but it is silent. Competitors sell "the plan adapts to you"
by *explaining* the adjustment ("you hit all reps at low effort, so Load went up").
The feature is a read-time explanation string attached to each Progression
decision, surfaced on the Next Session card. No new state, no write hook — it
reads the same Logged Sets the Progression already consumes and renders the
"why". This turns an invisible correctness property into a visible selling point,
and reinforces the honest-projection stance (ADR-0018/0019) rather than eroding it.

### Type-Neutral Coaching Narrative
Research shows named competitor gaps: Fitbod has no cardio/conditioning, Freeletics
"feels generic" for non-strength work. Our multi-training-type spine (strength /
cardio / hiit / yoga / mobility), type-neutral XP and Achievements, and typed
`Load` are a real wedge — but nothing in the product *says* "trains every modality
honestly." This is a copy/onboarding feature: surface the modality coverage during
generation and on Analytics so a yoga or mobility user sees themselves as
first-class. Zero domain change; it makes an existing invariant legible to the user.

---

## 2. Live Session & In-Workout Experience

### Voice-Guided Live Session
Ray and similar apps "feel like a trainer is in the gym with you" — calling the
next set, cueing rest, reading the Prescription aloud hands-free. Our Live Session
is already ephemeral and client-side (ADR-0012), which fits voice perfectly: the
guidance reads the in-flight state (current set, rest timer) with no backend round
trips. A Web Speech API layer that announces the next Exercise Prescription and
counts down rest keeps the phone-on-the-bench user moving. It must stay honest to
Session Duration — announced idle never counts as training time — and degrade
cleanly where the API is unavailable. Client-only, no new persisted record.

### On-Device Rep Counting & Form Cue (Exploratory)
Camera-based rep counting and form feedback (Sculptor, Gymscore, Zing) are the
flashiest 2026 trend, drawing a skeleton over the user mid-set. This is a large,
uncertain bet: it needs on-device pose estimation, is accuracy-sensitive, and
touches the injury/rehab caution posture, so any "form is fine" claim is a safety
liability. Framed as *exploratory*: prototype opt-in rep autofill for the Live
Session (the user confirms the count), never automated form correction for
Sensitive-Constraint users. Value is reduced between-set friction — the single
biggest cited reason users abandon trackers — not medical form judgment.

### Rest-Timer & Superset Round Cues — Shipped
A low-cost, high-value polish item: an explicit rest timer that respects the
Superset model — rest falls only at the **round boundary**, never between members
(CONTEXT 'Superset'). Most trackers get supersets wrong; ours already models them
correctly, so a timer that cues "round 2 of 3, next: goblet squat" is a
differentiator that falls straight out of existing structure. Ephemeral,
client-side, and part of the Live Session only. Pairs naturally with the
voice-guided item above and needs no schema change.

**Delivered.** The rest timer and round-major Superset expansion already shipped
(F2·S4 / ADR-0023), so this reduced to a polish pass: (1) the rest card now cues the
**on-deck set** directly — `next: {exercise} · round N/M` (or `· set N/M` when solo) —
reading the current-set pointer rather than the forward look-ahead, which at a round
boundary honestly names the member you'll perform next instead of the one after it;
(2) the persistent "Next up" line mirrors that on-deck set while resting so the two
surfaces never disagree; and (3) a correctness fix — a Superset's deliberate
`round_rest_seconds` now wins over the user's global default-rest preference at the
round boundary (**amends ADR-0023**: "the Superset owns its round-rest"), so the global
default can no longer silently shorten a Superset's prescribed rest. Logic lives in the
pure `restCue` / `resolveRestSeconds` view-model with co-located tests; no schema change.

---

## 3. Wearables & Health Data Integration

### Apple Health / Health Connect Sync
"Syncing with Apple Health, Google Fit, and major wearables is essential
infrastructure" in 2026, and Health Connect has superseded Google Fit on Android.
The safe, invariant-respecting slice is **write-out**: publish a finished Logged
Session (duration, exercises) to Apple Health / Health Connect so our data joins
the user's health graph. Read-in of heart rate is a larger, later step. This adds
platform reach without touching the plan model, and respects that a Logged Session
is settled record — we export it, we don't let the platform rewrite it. PWA
constraints on iOS (no background sync) mean export happens at finish time, in
the foreground.

### Recovery Signals — Deliberate Non-Adoption (Documented Fork)
The loudest 2026 trend is "recovery-first" training: apps read HRV / sleep / RHR
daily and rewrite *today's* session, showing an "87% recovered" score. Our stance
is the opposite by design — self-paced, calendar-free, no "today", and Readiness
is a **3-state signal, not a percentage** (ADR-0001, CONTEXT 'Readiness'). This is
a genuine strategic fork, not a missing feature. Documented here so it stays a
*conscious* position: if we ever ingest wearable data, it must feed the qualitative
Readiness signal (Ready / Caution / Extra Caution), never a recovery score, and
never a dated schedule. Recording the fork protects the invariant from drift.

---

## 4. Progress, Analytics & Strength Intelligence

### Strength Intelligence Dashboard — Shipped
Users in 2026 want "more than sets and reps" — estimated strength, volume,
muscle-level progress, and trends over time. We already compute Estimated 1RM,
Top Set, Personal Records, Muscle Group roll-ups, and volume — the domain is
richer than most competitors. The gap is a *consolidated* Analytics surface that
fans these out: a per-Exercise strength trajectory (Top Set trend), Muscle Group
balance over time, and PR history, all read-time from Logged Sets. No new
computation, only presentation — honoring the "only absolute-Load sets in a
trustworthy rep range" rule so the numbers never lie.

**Delivered.** Shipped as a dedicated **Strength Analytics** screen at
`/analytics/strength`, linked from `/analytics` (**ADR-0024**), read-time over
Logged Sets with no LLM and no stored ledger. It fans out three sections: (1) a
per-Exercise strength trajectory rendered as **ranked small-multiples** — the top
~5–6 qualifying Exercises by recent frequency, each a mini Top-Set trend that taps
through to the canonical single-story chart on `/exercises/[id]` rather than
re-rendering it here (avoiding the "competing bests" problem ADR-0017 killed); (2)
**Muscle Group balance over time** — deliberately the *one* exception to
"presentation only", a new pure `muscle_groups` weekly-composition series (with
tests) bucketed on **weeks** to reuse the Streak's self-paced cadence (ADR-0001),
descriptive-only and never flagging an under-trained bucket; and (3) the full
all-time, all-Exercise **flat reverse-chronological PR timeline** (reusing
`detect_personal_records` verbatim), with the `/analytics` Recent Records feed
re-cast as a teaser that links in (**amends ADR-0011**). The strength lens is
**gated**: the nav entry appears only for users with qualifying absolute-Load
history in the trustworthy 1–12-rep window, with honest per-section hides and a
single teaching empty state — never a wall of zeros — for the partial or
non-strength case (ADR-0017 / ADR-0018/0019). Named **"Strength Analytics"**, not
"Strength Intelligence Dashboard": "Intelligence" would falsely imply an AI judging
the user's strength when every figure is a deterministic projection, so the honest
name won (a UI/naming call — `CONTEXT.md` unchanged). Domain logic lives in pure
`logbook/strength_analytics`, `logbook/top_sets`, and `domain/muscle_groups`
functions with co-located view-models and tests.

### Data Export & Portability
A recurring user demand and a trust signal: let users export their own record
(Logged Sessions, Logged Sets, PRs) as CSV/JSON. Because everything gamified is a
read-time projection over the record, an export of the raw record is both
sufficient and honest — the user can recompute XP, Streak, and Achievements
themselves. This is cheap to build behind a repository read, strengthens the
data-ownership story, and pairs with the Health-platform sync above. Add
rate-limiting and scope it strictly to the requesting user's own data.

### Muscle Group Balance & Coverage Prompts — Shipped
Extending the Achievement that rewards covering all six Muscle Groups: a passive
Analytics insight that shows distribution and flags an under-trained bucket
("Back is 4% of recent volume"). It reads the same curated roll-up (with the
explicit Unclassified bucket, never silently dropped) and never prescribes — it
informs. This nudges balanced training without a calendar or a "you missed leg
day" guilt mechanic, staying inside the self-paced posture. Pure read-time
projection; no new stored state.

**Delivered — but deliberately reframed, not built as proposed.** Designed against
the domain, the "flags an under-trained bucket" framing came out the other way and
shipped as a neutral, descriptive **Muscle Group Coverage** signal that never flags,
ranks, or prescribes (**ADR-0025**). Three decisions carried the reframing: (1)
**coverage, not proportion** — the "% of recent volume" framing is dropped entirely
(doubly wrong: the roll-up is set-count, never volume, and the moment a surface says
"4% is *low*" it becomes the banned flag), so it reads strictly *presence* — "trained
/ not trained in this window" per group, a fact not a verdict — while balance-over-time
already shipped as ADR-0024's drift chart; (2) a **fixed, labeled 8-week window** rather
than the screen's 7d/30d/90d toggle (over 7 days a perfectly-rotated self-paced user
would read "2 of 6", the exact "you missed leg day" rebuke ADR-0001 rejects), reusing the
drift chart's `MUSCLE_BALANCE_WEEKS` span and weekly cadence so the two can never
contradict; and (3) it lives **ungated on the main `/analytics` screen** beside the
snapshot Muscle Split — coverage is type-neutral (reachable from a pure yoga/mobility
history), so placing it behind the strength gate would hide it from exactly the users it
is most for. A single `covered_groups` predicate is now shared with the Full Coverage
Achievement (read all-time by the achievement, over 8 weeks by coverage) so the two
surfaces cannot drift, and any in-window **Unclassified** work is disclosed as a neutral
footnote — never a seventh checklist row or a coverage target — keeping the "of 6"
denominator honest. Domain logic lives in pure `domain/muscle_groups` (`recent_coverage`
returning frozen `GroupCoverage` rows plus an `unclassified_present` flag) with a
`toCoverageView` view-model and a thin `MuscleCoverage` renderer (icon-plus-text per
state, never colour alone), all co-located with tests. No stored state, no write hook, no
LLM, no schema change.

---

## 5. Gamification & Social

### Weekly Consistency & Streak Surfacing
Research: achievement mechanics drive day-one retention; streaks with social
visibility drive sustained return. We already have a **weekly** Streak (not daily —
deliberately, per ADR-0001) and read-time Achievements. The feature is surfacing:
a richer Streak visualization and Achievement progress on Home and Profile, with
live "progress toward next unlock" for locked Achievements. It must preserve the
weekly cadence — a daily streak would pressure training through legitimate rest
days the safety posture protects. Presentation only; the projections already exist.

### Opt-In Social Comparison & Challenges
The social-fitness segment is growing fast (Strava, Hevy), and community is a top
retention driver. This is the most invasive item: it introduces cross-user surfaces
where the app is otherwise strictly single-user (Adopt-by-copy, no shared mutable
state). A conservative, privacy-first slice: opt-in shareable Achievement / PR
cards and lightweight friend challenges keyed on type-neutral XP, so a yoga user
competes fairly with a lifter. Must never leak one user's Protocol into another's,
and must respect that PR/XP are honest projections, not editable scores. Treat as a
larger design effort with its own ADR.

### Shareable Milestone Cards
A low-risk subset of the social item: generate a shareable image when a user hits a
Personal Record, a Streak length, or an Operator Level. Because these are honest
read-time projections, a milestone card is trustworthy by construction — it can
never claim an unearned achievement. This gives organic acquisition (Nike Run Club
/ Strava's growth loop) without building a full social graph. Client-side rendering,
no new persisted state, and no cross-user data.

---

## 6. Platform, PWA & Accessibility

### iOS PWA Storage Resilience for Live Session
The sharpest platform risk: iOS evicts script-writable storage (localStorage /
IndexedDB) after a ~7-day unused window and offers no Background Sync. Our Live
Session is localStorage-only (ADR-0012), which aligns with "no background sync" but
means a paused in-progress Session and the ResumeSessionBanner are real data-loss
candidates. The feature is resilience: warn on long-paused sessions, and offer an
explicit "finish now" nudge before eviction risk grows. Keeps the ephemeral-until-
finished invariant while protecting the user's in-flight work on the one platform
that actively threatens it.

### Accessibility & Inclusive Design Pass
2026 trends highlight older-adult (50+) programming, multilingual support, and
accessible UIs as growth areas. Concretely: a WCAG audit of the Pulse design
system, full keyboard access (which the committed drag-to-reorder Builder work,
ADR-0023, must satisfy anyway), screen-reader labels on strength/analytics tiles,
and readiness/effort states that never rely on color alone. This widens the
addressable audience and is largely presentation-layer work in `apps/web`, with
co-located view-model tests where logic is involved.

### Offline-First Logging Robustness
Users abandon trackers when logging has friction; offline gaps are a common cause.
Harden the PWA so logging a Session works with no connectivity and reconciles on
reconnect — treating a finished Live Session as the durable unit to sync. This
respects that a performed Session is settled record: sync transmits it, the server
never reorders it. Given iOS's no-background-sync reality, reconciliation triggers
on next foreground load, not in the background. Improves the core loop that every
other feature depends on.

---

## 7. Nutrition & Holistic (Longer-Horizon)

### Nutrition & Holistic Integration (Scoped)
The market is weaving workouts + nutrition + sleep + mindset together (MyFitnessPal,
Noom, Supersapiens). This is deliberately parked as longer-horizon: it is a whole
new domain with its own terminology risk, and bolting it on carelessly would
violate the "small, cohesive, feature-organized" posture and dilute the plan-vs-
record clarity that is the product's spine. If pursued, it belongs behind its own
port and ADR, kept strictly separate from Protocol/Session, and probably starts as
a read-only bridge to an existing nutrition source rather than a built-in tracker.
Recorded so the demand is acknowledged without scope-creeping the core.

---

## Sources

- [8 Best AI Workout Apps in 2026 — LoadMuscle](https://loadmuscle.com/blog/best-ai-workout-apps-2026)
- [Top AI Fitness Apps 2026: Product Team Guide — RapidNative](https://www.rapidnative.com/blogs/ai-fitness-apps)
- [Emerging Trends of AI Fitness Apps in 2026 — SoluteLabs](https://www.solutelabs.com/blog/future-of-fitness)
- [Best AI Personal Trainer & Wellness Coach Apps 2026 — Ray](https://www.rayfit.com/blog/2026/02/best-ai-personal-trainer-app/)
- [9 Best Workout Tracking Apps in 2026 — LoadMuscle](https://loadmuscle.com/blog/best-workout-tracking-apps-2026)
- [The 9 best fitness apps in 2026 — Zapier](https://zapier.com/blog/best-fitness-tracking-apps/)
- [Best Workout Tracker App for 2026 — Hevy](https://www.hevyapp.com/best-workout-tracker-app/)
- [13 Strategies to Increase Fitness App Engagement & Retention — Orangesoft](https://orangesoft.co/blog/strategies-to-increase-fitness-app-engagement-and-retention)
- [10 Best Gamified Fitness Apps (Ranked 2026) — Yu-kai Chou](https://yukaichou.com/gamification-analysis/top-10-gamification-in-fitness/)
- [The 2026 digital fitness ecosystem report — Feed.fm](https://www.feed.fm/2026-digital-fitness-ecosystem-report)
- [Athlytic Review (2026) — Cora App](https://www.corahealth.app/compare/athlytic)
- [How to Track Recovery on Apple Watch (2026 Guide) — Livity](https://livity-app.com/en/blog/apple-watch-recovery-tracking)
- [Best Fitness Apps That Sync with Apple Health (2026) — Cora App](https://www.corahealth.app/blog/best-apple-health-fitness-apps)
- [Best AI Workout Form Check Apps (2026) — SensAI](https://www.sensai.fit/blog/best-ai-workout-form-check-apps-2026)
- [Sculptor — AI Rep Counter & Form Analysis](https://www.sculptorapp.com/)
- [Every Wearable and Device Integration for Calorie Tracking 2026 — Nutrola](https://nutrola.app/en/blog/every-wearable-device-integration-explained-complete-encyclopedia-2026)
- [ACSM Top 10 Fitness Trends for 2026](https://fitnessappsolutions.com/blog/acsm-fitness-trends-2026/)
- [Essential Features to Include in Your Fitness App for 2026 — Techweblabs](https://techweblabs.com/blogs/essential-features-to-include-in-your-fitness-app-for-2026)
