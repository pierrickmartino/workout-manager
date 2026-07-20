# 0026 — Bodyweight becomes a first-class, resolved strength load

Calisthenics is a first-class use case (bodyweight is a typed Load kind, ADR-0010;
variations model progressions), but the *progress* half of the app was blind to it:
the Estimated-1RM / PR / Top-Set engine scores only `absolute` Loads, and the
Progression engine only moves kg. A pure-bodyweight athlete going 5→10 pull-ups, or
adding a belt to their dips, saw no record and no auto-adjustment. This ADR records
how bodyweight becomes a scored strength load — and the honesty guards that make it
safe to. It **amends ADR-0010** (which rejected bodyweight and rep-max PRs),
**ADR-0024** (strength-screen gating), and **ADR-0004** (load-only progression).

**Body weight at performance is captured onto the Logged Set — Performed Body
Weight.** A bodyweight set carries no kg, so scoring it needs the user's mass, which
lives *outside* the set (mutable `Profile.weight_kg`). Resolving read-time against
current mass would make a discrete milestone silently drift — lose 5 kg and your
pull-up PR evaporates, the exact dishonesty ADR-0010's pure-projection PR was built
to avoid. So the mass at the moment of performance is snapshotted onto the record (a
nullable `LoggedSet.body_weight_kg`), a raw fact like reps or load — not a derived
value. PR/Top-Set detection stays a pure read-time projection over now-complete
records and can never drift. No backfill: sets logged before the snapshot (or with no
weight on file) stay record-ineligible rather than being resolved against a guessed
mass. This is the one migration-ish, hard-to-reverse step.

**Estimated 1RM extends to bodyweight, but only as a within-Exercise yardstick.**
Once a set carries a Performed Body Weight, `bodyweight + added` resolves to a
kg-equivalent and the *existing* Epley estimator scores it — so more reps at fixed
mass raise the estimate, and one engine yields both weighted-calisthenics PRs and
low/moderate-rep pure-bodyweight progress, with **no separate rep-max concept** (the
alternative ADR-0010 rejected). Two honesty guards hold: (1) the **1–12-rep window is
kept** — high-rep endurance work stays intentionally unscored, because a max-strength
estimate is dishonest there, not merely absent (that is the deferred Type-Neutral
Coaching feature, not this); (2) full body weight is an unreliable absolute *across*
movements (a push-up lifts far less of it than a pull-up), so the estimate is used
only to order records **within** one Exercise, and a bodyweight record is surfaced as
the **set that achieved it** (reps and any added load), never a kilogram headline
comparable to a barbell lift.

**Progression gains a rep axis and a suggested-variation ceiling.** Deterministic
in-copy Progression (ADR-0004 mechanism 1) now advances bodyweight work: for a set
carrying added load it steps that added load with the existing increment logic; for
pure bodyweight — no weight to add — it steps the target reps, and at the top of the
range **suggests** advancing to a harder Variation rather than growing reps without
bound. It never auto-swaps the movement: that stays a user-initiated Substitution
(CONTEXT), which also keeps a Sensitive-Constraint user (ADR-0003) from being silently
pushed onto a harder exercise.

## Considered options

- **Read-time resolution against current mass** — rejected: makes a discrete PR
  drift when weight changes; tolerable for a coverage-disclosed volume aggregate
  (ADR-0010) but not for a milestone. Snapshotting fixes the meaning at performance.
- **A separate rep-max / Rep Record engine for pure bodyweight** — rejected (again,
  per ADR-0010): the Performed-Body-Weight snapshot lets the *one* Est.-1RM yardstick
  cover it, so a second record concept and its feed complexity buy nothing.
- **Show the bodyweight Est. 1RM as a kg figure everywhere** — rejected: overstates
  wildly for low-bodyweight-fraction movements and invites a false cross-movement
  read ("my push-up 1RM beats my bench").
- **Auto-advancing to a harder Variation at the rep ceiling** — rejected: silently
  changes a user's movement, colliding with user-initiated Substitution and the
  safety posture. Suggest, don't swap.
- **Backfilling Performed Body Weight from dated `MetricEntry` readings** — rejected:
  sparse, and only helps users who logged weight *and* trained before this shipped;
  honest silence on old data is simpler and consistent with the snapshot stance.

## Consequences

- **Amends ADR-0024**: the strength screen's gate ("any qualifying strength history")
  now admits a pure-calisthenics user, which is the intended outcome — but the empty-
  and record-state copy ("sets logged with a weight in kg / absolute-load sets") is
  now wrong and must be updated to name the bodyweight path.
- Estimated 1RM's meaning is now **load-kind-aware**: a shared kg magnitude for
  absolute loads, a within-Exercise ordering scalar for bodyweight. Surfaces must
  branch on load kind (the code already hides the PR tile for bodyweight today).
- The Performed Body Weight snapshot also gives Volume a historically honest mass to
  convert bodyweight sets against, instead of today's current-mass read — a latent
  improvement, not pursued here.
- The estimator, rep window, and increment rules stay pure functions, tunable later
  without a schema change; only the `LoggedSet.body_weight_kg` column is structural.
