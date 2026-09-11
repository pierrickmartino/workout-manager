# 0032 — Quantity: the typed per-set amount axis

With records able to stand alone (ADR-0031), a run can finally *reach* the record
model — but it cannot be *expressed* by it. A Logged Set's quantity is a bare
`reps: int`, and a 10 km run has no repetitions just as it has no kilograms. This
ADR records that the **quantity axis of a set becomes a typed value object,
`Quantity`** — the sibling ADR-0010 already wrote for the resistance axis, `Load`.

**A set has two axes, and only one was typed.** ADR-0010 established the pattern:
the thing that varies is not a number but a *kind*, fixed once at the write
boundary so downstream analytics never re-guess. Load typed *how hard*; `reps:int`
left *how much* un-typed. Running proves `reps` was the un-typed axis all along, so
`Quantity` carries a `kind` — `repetitions` (a count), `distance` (metres, with an
optional companion duration), or `duration` (seconds) — mirroring `ParsedLoad`.
Like Load it keeps the original `text` verbatim, so the typed value is
display-ready and a backfill loses nothing. `Quantity` is born as a pure domain
value object in `app/domain/quantity.py` (no ORM, no HTTP), exactly like
`domain/load.py`, so a later plan-side adoption is an import, not a redesign.

**Canonical number plus verbatim text — no stored derived figures.** A `distance`
stores canonical `metres` (miles convert on the way in) plus `text`; a `duration`
stores canonical `seconds` plus `text` — one figure for all math, the original
string for display, the same shape as `ParsedLoad.kg`. **Pace is never stored.** It
is arithmetic on two measured numbers (distance and duration) and is a *read-time
projection* of a `distance` Quantity that carries a `duration_s`, defined only when
both are present — the endurance counterpart to how Estimated 1RM projects from a
Load (ADR-0010/0018). Storing pace would invent exactly the stored-derived-value
those ADRs eliminated.

**Stored as a JSON column mirroring `load`.** `LoggedSet.reps: int` retires into a
`quantity` JSON column (`{kind: "repetitions", count: 8}`), so the axis is typed in
the table, not just in the domain. A one-time migration converts every historical
row, and the strength read paths — `one_rep_max`, `personal_records`, `volume` —
move from `.reps` (int) to `.quantity.repetitions` (`int | None`). This is the
largest single piece of the change: it touches the strength engine ADR-0010/0024
built and every guard that assumed integer reps now has a `None` path.

**Record-side only, for now.** _(Superseded by ADR-0050, which types the plan side —
`ExercisePrescription` gains a prescribed `Quantity`. The record-side decision below
stands unchanged; only this "for now" deferral was lifted.)_ `ExercisePrescription.reps`
stays free text; typing the *plan* side (prescribed running: the generation prompt,
the parse boundary, the cache key, the builder, `progression.py`) is a separate future
feature. Logging a
run and being prescribed a run are deliberately different features — and there is
**no plan→record bridge**: the client never parses a prescription's `"5 km"` into a
Quantity, because that is the re-guessing outside the write boundary ADR-0010
forbids. Ad-hoc runs have no prescription to bridge from, and prescribed cardio
keeps behaving as it does today.

## Considered options

- **Leave quantity a bare `int`** — rejected: cannot express a run at all, and
  would put distance/duration on the *session* rather than the *set*, making a
  hybrid session (run then squats) unrepresentable.
- **Separate nullable `distance_m` / `duration_s` columns beside `reps`** —
  rejected: three mutually-exclusive columns whose exclusivity is enforced by hand
  forever, and a fourth kind later is another column and another migration. A typed
  value makes "exactly one kind" structural.
- **A `pace` kind on `Load`** — rejected: pace is an outcome, not resistance, and
  storing it inverts what happened (the measured time becomes a function of a
  computed pace) and contaminates every Load-kind guard in `volume`, `one_rep_max`,
  and `progression`.
- **Duration as only a field on `distance`, or only a standalone kind** — rejected:
  the first cannot express a timeless hold (plank, yoga) or a distance-unknown
  treadmill session; the second makes a timed run *either* distance *or* time,
  losing pace. `distance` carries an optional `duration_s` **and** `duration` is its
  own kind — the same shape as `bodyweight`'s optional `added_kg`.

## Consequences

- A running set excludes itself from Estimated 1RM, Personal Records, and tonnage
  **honestly and without special-casing**: it has no `absolute` Load (so
  `estimate_1rm` already returns `None`) *and* no repetitions, so the existing
  graceful-degradation paths in `domain/volume.py` cover it with no "is this a run?"
  branch.
- A running **Personal Record** (pace as the endurance yardstick, mirroring
  Estimated 1RM) is now *derivable* from the record but is deliberately **not built
  here**; it is a future read-time projection over the new `distance` Quantity.
- The `quantity` migration is the one irreversible-ish step; the kinds, the pace
  derivation, and the read-path extraction are pure functions, tunable later without
  a schema change.
- **Left standing:** `muscle_groups.distribution` and `experience.py` both weight by
  **set count**, so `6 × 800 m` logged as six intervals over-weights Legs and
  over-earns XP versus the same run logged as one 10 km set. This distortion — the
  set-count metric meeting a training type where set count is arbitrary — is a known
  consequence of this ADR, not resolved by it.
