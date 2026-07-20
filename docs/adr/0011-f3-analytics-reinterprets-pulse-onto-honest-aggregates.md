# 0011 — F3 Analytics reinterprets Pulse onto honestly-backed aggregates

Like F1 (ADR-0008), Pulse's Analytics screen is drawn around numbers the record
can't all honestly back: a total volume in KG with a % delta, a 7D/30D/1Y range
toggle, a bento of *sessions · avg time · new PRs · active days*, a
*Chest/Back/Legs/Arms* muscle split, and a Recent Records feed. F3 keeps Pulse's
layout and feel but, screen-by-screen, shows **only what the record can honestly
support** — the same stance ADR-0008 took for Home. The backing capability
(typed Load, Estimated-1RM PRs, coverage-honest volume) is recorded separately in
ADR-0010; this ADR records the **screen-level reinterpretations and the deliberate
deviations from the Pulse mock**.

Concretely:

- **Volume is real, but only behind the engine and with disclosed coverage.**
  ADR-0008 dropped a single tonnage figure outright because free-text loads would
  silently exclude bodyweight and %-based work. F3 **amends that** narrowly: it
  now computes and charts KG volume — but *only* on top of ADR-0010's typed Load +
  conversion, and *only* with an on-chart coverage percentage. The reason 0008
  dropped it (silent exclusion) is answered, not ignored.
- **Range toggle is 7D / 30D / 90D, not 7D / 30D / 1Y.** A single **daily** bucket
  spans all three ranges. 1Y is dropped: a year of daily points is an unreadable
  comb nobody has logged this early, and monthly buckets would hide the detail the
  screen exists to show. One bucket width also keeps the engine simple.
- **The delta compares equal windows.** "+12%" is the selected window against the
  immediately preceding equal-length window (this 30D vs. the prior 30D) — the only
  honest period-over-period read.
- **Bento is sessions · active days · new PRs · total sets — avg time is
  dropped.** The record captures **no elapsed time**: `duration_minutes` is the
  *planned* length on the plan, and logging is post-hoc, so even a row's
  `created_at` is "when it was written," not workout duration. There is no timer
  anywhere (the F2 gap). Rather than fabricate a duration, the fourth tile is
  **total sets** (a pure count from Logged Sets); genuine session time waits for
  F2's live timer.
- **Muscle distribution uses six curated groups plus Unclassified, not Pulse's
  four.** `Exercise.targeted_muscles` is a free-form string list with no
  primary/secondary flag, so "primary mover only" isn't available. A **curated**
  map rolls muscles into **Legs / Chest / Back / Shoulders / Arms / Core**;
  collapsing Shoulders and dropping Core (as Pulse's four groups do) would
  misrepresent real programs. Unknown/AI-invented muscles fall into an explicit
  **Unclassified** bucket — shown, not dropped. Distribution is weighted by **set
  count**, each logged set split **evenly across the distinct groups** its Exercise
  maps to, so the percentages sum to 100% and are **independent of load
  conversion** (a heavy lift can't dominate the split).
- **The Recent Records feed is decoupled from the range toggle.** PRs are sparse,
  so a window-scoped feed would read as empty/broken. The feed shows the **last 8
  PRs all-time**, newest first (Exercise · new Estimated 1RM · gain over the prior
  PR · date). The window-scoped view of PRs lives in the bento's **new-PRs count**,
  not the feed. **Amended by ADR-0024 (issue #179):** the 8-cap feed is now a
  **teaser**, not the only PR-history surface. When the user has qualifying strength
  history it carries a *"See all records →"* affordance into the full, all-time PR
  timeline on the Strength Analytics screen (`/analytics/strength`); the affordance
  is gated on the same condition as that screen's nav entry, so it never lands on an
  empty gate. The last-8 content itself is unchanged.

## Consequences

- The screen matches Pulse's *layout* while diverging from its *dated, load-naïve
  semantics*. A future reader comparing the two should treat 90D-not-1Y,
  total-sets-not-avg-time, and six-groups-not-four as **deliberate**, not an
  incomplete port.
- This ADR **amends ADR-0008's "single-number tonnage is dropped" bullet**: KG
  volume is now shown, but only under ADR-0010's engine and coverage disclosure.
  Every other ADR-0008 reinterpretation stands.
- Real "avg time" and a range-scoped records view can layer on later — the former
  once F2 records elapsed time — without reworking this screen.
