# A step down stays loadable

The coach review of the four Curated Protocols (issue #694, ADR-0130) found two back-offs
that asked for a weight nobody can put on a bar. A Greyskull-style reset took 10% off the
current Load exactly, so 42.5 kg reset to 38.25 kg. A step down could also go under the
empty bar: Double Progression's −5 kg took a 20 kg overhead press to 15 kg. The coach ruled
that both must be fixed before release.

- **A Greyskull reset rounds down to a loadable weight.** The reset is still 90% of the
  current Load (`RESET_FRACTION`), floored to the 2.5 kg step (`domain/loadable.py`, the rule
  a Curated Protocol's prefill and wave weeks already used). 42.5 kg resets to 37.5 kg. A Load
  under one step (below about 2.8 kg) keeps the plain fraction, so a light Load never becomes
  0 kg. Added kilograms on a bodyweight movement are unchanged.
- **A barbell Prescription never steps below the empty bar.** The read-time Progression
  overlay holds a step down at `EMPTY_BAR_KG` (20 kg) when the Prescription's Exercise needs a
  barbell (`floored_at`, applied in `protocols/progress.py`). The floor only stops a step
  down. A Load already under 20 kg holds where it is, because an EZ bar also reads as a
  barbell. Every other kind of step, and every movement without a barbell, behaves as before.

Both rules apply to every Protocol, not only Curated ones. An unloadable weight is wrong
wherever it appears, and the engine is shared (ADR-0064). Progression stays a pure,
read-time projection: nothing stored moves (ADR-0004).

The same review added a gate to the wave program. Its weeks are worked out from a set the user
actually did, so a main lift with no qualifying logged set (an absolute Load at 1–12 reps)
can't be adopted or previewed. The list row names those lifts
(`lifts_needing_a_logged_set`), and the 20 kg × 5 default working set is gone.

## Considered options

- **Floor the step in the scheme functions.** Rejected: a scheme sees only the free-text
  Load and reps, never the equipment. Threading a floor through every scheme's signature would
  widen the closed registry for one rule that the overlay can apply after dispatch.
- **Floor every absolute Load at 20 kg.** Rejected: a dumbbell or cable movement goes well
  under 20 kg.

## Consequences

- `tests/test_progression.py` holds the rounding, and `tests/test_progression_scheme_overlay.py`
  holds the bar floor, including the light-bar and no-barbell cases.
- The Curated Protocols' descriptions still say "drops back 10%" and "goes down 5 kg". The coach
  approved that wording, and the rounding only moves the result to the nearest loadable weight
  below it.
