# Muscle is a curated, read-time vocabulary beneath the six Muscle Groups

The Muscle Atlas (ADR-0073) renders training coverage over a **six-region** silhouette: the
six coarse **Muscle Groups** (Legs, Chest, Back, Shoulders, Arms, Core) a catalog Exercise's
free-form `targeted_muscles` roll up into via `muscle_groups.classify`. Six regions is a
legible start, but the next step for the atlas is a **full anatomical body map** — heat over
~40–50 *individual* muscles, not six blocks. That step needs two things the codebase does not
yet have: a **canonical muscle vocabulary** finer than the six groups, and each Logged Set's
**Primary/Secondary emphasis** (ADR-0016) reachable by the coverage read, since per-muscle
heat is emphasis-weighted (a set's primary movers should read hotter than its assistors).

This ADR is the **prefactor** for that step ("make the change easy, then make the easy
change"): it stands up the vocabulary and threads the emphasis data through the read path, so
the later per-muscle read is a small, additive slice. **Nothing user-visible changes yet** —
the six-group atlas still renders exactly as today.

## Decision

- Introduce a curated canonical **`Muscle`** vocabulary (`app.domain.muscles`) of ~40
  individual muscles, where **each Muscle nests under exactly one of the six real Muscle
  Groups** (`MUSCLE_TO_GROUP`, asserted exhaustive by a completeness test). The six groups
  stay the **roll-up tier**: Muscle Split, Muscle Balance, the Full-Coverage achievement, and
  the Coverage read keep reading `muscle_groups.classify` unchanged, on top.
- Add a curated free-form→`Muscle` map and `classify_muscle`, mirroring
  `muscle_groups._MUSCLE_TO_GROUP` / `classify` term-for-term: case- and
  whitespace-insensitive (keyed by the *same* `normalize_muscle`), with unknown /
  AI-invented / bare-region strings falling through to `Muscle.UNCLASSIFIED` — never guessed
  at, the honesty twin of the group tier's Unclassified. The finer tier **never
  contradicts** the coarse one where both classify a term (a unit-tested invariant); it may
  *refine* a term the group map leaves Unclassified (e.g. "hams" → Hamstrings → Legs).
- **Thread the Primary/Secondary emphasis split through the read path.** `LoggedSetView`
  gains `primary_muscles` / `secondary_muscles`, denormalized off the Exercise exactly as
  `targeted_muscles` already is, so the coverage read layer can reach each set's emphasis —
  not just the flat union. `muscle_groups.emphasis_of` exposes it with a **"no split → all
  primary"** fallback (the whole `targeted_muscles` union as primary, no secondary), matching
  the SPECS render's "no asserted split → flat list" behaviour so a split-less set still
  contributes every muscle at full emphasis rather than vanishing.
- **No schema change, no migration, no write hook.** Canonical-muscle classification is a
  **read-time projection** of the existing free-form union — the same species as ADR-0073's
  enriched coverage read and the Movement Pattern / Equipment vocabularies (ADR-0072/0077).
  No new stored column, no per-user ledger (ADR-0018/0019).

## Considered options

- **Split every muscle into anatomical heads (vastus lateralis / medialis…, three deltoid
  heads).** Rejected for v1: it forces a whole-vs-part ambiguity (bulk "quadriceps" has no
  single head to claim) and over-fabricates primacy the catalog does not assert. The
  vocabulary stays at the level a lifter/catalog actually names — "Quadriceps", "Deltoids" —
  with a bulk region term like "deltoids" left Unclassified at the muscle tier rather than
  guessed into one head. Heads can deepen later without touching the group roll-up.
- **Store a canonical `muscle` column with a classify-on-write hook (and a migration).**
  Rejected: violates the read-time-projection invariant (ADR-0018/0019), adds a write path to
  keep in sync, and buys nothing over re-deriving from the same free-form strings the group
  roll-up already reads.
- **Backfill "all primary" onto split-less Exercises.** Rejected at the *storage* layer
  (ADR-0016: "all primary" is a false claim, not a null one — primacy is populated only where
  enrichment or a curator asserts it). The all-primary fallback lives only in the **read**
  accessor `emphasis_of`, so no fabricated split ever enters the catalog.
- **An LLM call to classify each muscle string.** Rejected: needless cost and nondeterminism
  for a coarse, curated mapping a keyword table resolves reliably — the same reasoning that
  keeps Muscle Group, Movement Pattern, and Equipment curated maps, not AI calls per read.

## Consequences

- Introduces **one new domain term, `Muscle`** (see `CONTEXT.md`), the finer tier beneath
  Muscle Group. `terminology_guard` needs **no** new entry: nothing is retired or renamed —
  `Muscle` is additive, and the six-group roll-up's identifiers are untouched.
- **No data-model change.** `LoggedSetView` carries the emphasis split as a denormalized
  read-side field (defaulting empty, so every existing construction is unaffected); the HTTP
  responses are unchanged until a later slice serializes it.
- The vocabulary and its alias map are **curated data** — auditable and unit-tested — living
  beside the Muscle Group, Movement Pattern, and Equipment classifiers in `app.domain`. The
  completeness invariant (every Muscle has a group) and the no-contradiction invariant (the
  muscle tier never disagrees with the group tier) are the load-bearing, tested parts.
- The dependent slice — per-muscle, emphasis-weighted atlas heat — is now a small additive
  step: classify each set's `emphasis_of` primaries/secondaries to canonical Muscles and
  weight the two tiers, with the group roll-up and every existing surface untouched beneath.
