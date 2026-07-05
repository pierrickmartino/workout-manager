# 0010 — Typed Load, Estimated-1RM PRs, and a coverage-honest volume engine

F3 (Analytics) needs a **total volume** number, a **Personal Records** feed, and
a **new-PRs** count. None have a backing capability today, and the naïve
implementations are all dishonest against the current data: `load` (on both
`ExercisePrescription.recommended_load` and `LoggedSet.load`) is **free text** —
`"70kg"`, `"70% 1RM"`, `"bodyweight"`, `"moderate"`, `"70-80 kg"` — so summing
"kg lifted" silently drops every bodyweight and %-based set, exactly the
distortion ADR-0008 refused when it dropped single-number tonnage from Home. This
ADR records the net-new engine that makes those numbers honest.

**Load becomes a typed value object, not a bare number.** Free-text-ness is
**essential domain vocabulary**, not an accident: the AI legitimately prescribes
`bodyweight` and `70% 1RM`, and a numeric-only column would force it to lie or
emit null for a large share of real prescriptions. So a Load carries a `kind` —
`absolute` (a kg value), `bodyweight` (optional added kg), `percent_1rm` (a
percentage), `qualitative` (`"moderate"`), or `range` (low/high kg) — and only
some kinds resolve to a number. This is a **write-time** structuring: it changes
the generator's structured-output contract (ADR-0006), the `LogSessionForm`
input, and requires a one-time migration parsing existing free-text rows.
Note this does **not** remove the free-text parser — it relocates it to the
generation-ingestion boundary and the backfill migration.

**A Personal Record is the highest Estimated 1RM, detected read-time.** The
Estimated 1RM (Epley, `1RM = kg × (1 + reps/30)`) is the common strength yardstick
— comparable across rep ranges, so a heavier estimated max at five reps outranks
a lighter true single. A set contributes an estimate only when its Load is
`absolute` and its integer reps fall in a **1–12 window**: above ~12 reps every
1RM formula inflates wildly, so an AMRAP or 30-rep set would fabricate a
record-smashing max. PRs are a **read-time projection** over Logged Sets — a set
is a PR if its Estimated 1RM beats every prior set's for that Exercise — with no
`personal_record` table and no write-path hook, matching the existing
projection-over-the-record pattern (`logbook/progress.py`, `domain/readiness.py`).

**Volume converts what it can and discloses coverage.** With the PR engine in
place, `bodyweight` sets convert via `Profile.weight_kg` and `percent_1rm` sets
via the Exercise's existing Estimated 1RM; `range` uses the midpoint; `qualitative`
never converts; and any set whose conversion inputs are missing stays
unconverted. The chart therefore reports the **fraction of logged volume it
actually computed** ("from N% of your logged volume") rather than presenting a
silently-partial total as authoritative — the ADR-0008 anti-silent-exclusion
principle, now as a first-class chart affordance.

## Considered options

- **Read-time free-text parsing, no schema change** — rejected: the parse still
  has to run somewhere, and leaving `load` untyped keeps the generator and the
  log form free to emit ambiguous strings the analytics layer must re-guess
  forever. Structuring at the boundary fixes the meaning once.
- **Absolute-weight PR (heaviest kg ever)** — rejected: never fires for
  rep-range progress (100kg×5 never beats 105kg×1) and ignores the estimator F6
  already wants.
- **Persisted PR events** — rejected: a table, a write hook, a backfill, and
  drift when history is edited, for no benefit at one user's data scale.
- **Rep-max PRs (best weight at each rep count)** — rejected: richer than
  Pulse's mock shows, and multiplies storage and feed complexity.

## Consequences

- Estimated 1RM is a **shared** capability: it powers F3's PRs/volume conversion
  and F6's per-Exercise "estimated 1RM" from one estimator.
- Conversion is **best-effort**: a user with no recorded body weight or no prior
  absolute-load history on an Exercise will see coverage below 100%. That is the
  honest state, surfaced, not hidden.
- The typed-Load migration is the one irreversible-ish step; the estimator,
  rep-window cap, and detection rule are pure functions and can be tuned later
  without a schema change.
