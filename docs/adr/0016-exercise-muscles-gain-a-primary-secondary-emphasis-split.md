# 0016 — Exercise muscles gain a Primary/Secondary emphasis split (amends ADR-0011)

F6's Exercise Detail wants Pulse's muscle map — **PRIMARY** vs **SECONDARY** muscles.
ADR-0011 explicitly recorded the opposite: "`targeted_muscles` is a free-form string
list with **no primary/secondary flag**," a stance `muscle_groups.py` still cites in a
comment. We decided to **reopen that**: the catalog gains stored `primary_muscles` /
`secondary_muscles` as an **emphasis annotation** on top of the existing
`targeted_muscles`, which is **kept** as the durable analytics-facing union. This
amends ADR-0011's muscle bullet; every other ADR-0011 reinterpretation stands.

## Considered options

- **Keep the flat list, honor ADR-0011 (rejected here, but the honest fallback).**
  Render targeted muscles as one chip row, no primacy. This remains the *degraded*
  rendering for any Exercise without an asserted split.
- **`primary_muscles` as a subset of `targeted_muscles`, secondary derived (considered).**
  Additive and F3-safe, but models secondary as "the remainder" rather than a
  first-class assertion.
- **Two stored lists (`primary_muscles` / `secondary_muscles`) with `targeted_muscles`
  kept as the stored union (chosen).** The split is a first-class stored pair; the union
  stays the analytics-facing field so the F3 Muscle Group roll-up is **untouched**.

## Consequences

- **No fabricated primacy.** A flat muscle list carries *no* signal about which muscle is
  primary — unlike Execution Steps' newlines (ADR-0015), there is nothing to recover. So
  existing rows are **not** backfilled by guessing (e.g. "all primary" is a false claim,
  not a null one). Primacy is populated only where enrichment (or a curator) actually
  asserts it.
- **Re-enrichment is scoped to `ai_generated` rows only.** A one-off AI pass fills the
  split for AI-invented movements; **`curated` rows are left flat** and never overwritten
  by a batch, keeping Provenance (ADR-0002) meaningful.
- **Render rule.** PRIMARY/SECONDARY sections show only when the split is populated;
  otherwise the screen falls back to a flat targeted-muscle row. No Exercise ever shows a
  primacy it doesn't actually have.
- **F3 is unaffected.** `muscle_groups.py` keeps reading `targeted_muscles` (the union);
  its ADR-0011-citing comment should be updated to point here, but its behaviour does not
  change.
