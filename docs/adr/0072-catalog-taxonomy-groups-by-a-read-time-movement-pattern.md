# Browse the Catalog is a field-guide taxonomy grouped by a read-time Movement Pattern

The Catalog browse (ADR-0042) was a flat, ranked, paginated list faceted by Muscle Group,
equipment, and difficulty. To make discovery **feel like a field guide** — visual, scannable
by movement family rather than a name index — we reorganize the browse into a **taxonomy**:
the filtered Catalog is grouped into a small set of broad **Movement Patterns** — Squat,
Hinge, Push, Pull, Carry, Locomotion, Core — with a **General** bucket for anything no
pattern confidently fits. Each family carries a single consistent line illustration, so the
library gains variety without a bespoke drawing per movement.

A Movement Pattern is a **read-time projection** over an Exercise's existing fields — its
name first, its targeted muscles as a conservative fallback — computed by the pure
`app.domain.movement_pattern.classify_movement_pattern`, the same species as the Muscle
Group roll-up (`classify`) and Catalog Completeness. It is **never a stored column**, needs
**no migration and no write hook**, and re-derives for free whenever a movement's name or
muscles are enriched. A pattern is asserted only when it accurately fits; an unknown or
ambiguous movement stays **General** rather than being forced into a family — the pattern
twin of leaving an unmapped muscle Unclassified.

The taxonomy is served by `GET /api/exercises/taxonomy`, which shares the browse facets and
groups the **whole filtered set** (via the repository's new unpaged `browse_all`) so each
family's `count` is accurate. It is deliberately **unpaged**: grouping needs the whole
filtered set, and the Catalog is a bounded shared set. The per-exercise browse projection
also gains a `movement_pattern` field so a row and its section agree on the family.

## Considered options

- **Store `movement_pattern` as a column (with a migration and a classify-on-write hook)** —
  rejected: it violates the read-time-projection invariant (ADR-0018/0019), adds a migration
  and a write path to keep in sync as Enrichment fills names/muscles, and buys nothing a
  read-time projection over the same fields does not already give. Classification is cheap
  and deterministic.
- **Classify on the frontend** — rejected for this repo: the frontend already routes domain
  logic to the backend, and a client-only classifier could not group across pages or return
  accurate per-family counts. The one classifier on the server keeps the row's pattern and
  the taxonomy's grouping from ever disagreeing.
- **Keep pagination and group within each loaded page** — rejected: per-family counts would
  be partial and the same family would fragment across "Load more" steps, which reads as a
  broken taxonomy rather than a field guide.
- **An LLM call to tag each movement's pattern** — rejected: needless cost and nondeterminism
  for a coarse, curated seven-way bucket that name + muscle keywords classify reliably; the
  same reasoning that keeps Muscle Group a curated map, not an AI call per read.

## Consequences

- Introduces **one new domain term, Movement Pattern** (see `CONTEXT.md`), and **no
  data-model change**: no column, no migration, no write hook.
- The classifier is name-keyword-first with a conservative muscle-mix fallback and a General
  bucket; its order is load-bearing (Locomotion before Pull so a rowing *machine* is not a
  *row*; Core before Push/Pull so "Pallof Press" is core; Hinge before Pull so a clean reads
  as a hip drive). The rules are curated data, auditable and unit-tested.
- `browse_all` returns the whole filtered, ranked set; the taxonomy route groups it. The
  existing paged `browse` and its facets are unchanged and still back the pick-mode Exercise
  Library.
- The frontend Catalog browse (`/exercises`) is reshaped from a flat list into collapsible
  Movement Pattern sections with a bottom-drawer Exercise detail; the flat list is retired
  from that surface. The pick-mode Library widget is untouched.
- Because a pattern is a pure projection over name + muscles, it recomputes automatically as
  Enrichment fills a Stub — a movement can move from General into a real family with no
  backfill.
- Movement Pattern is a **discovery/presentation** projection only: it feeds no generation
  input, no cache key, and no progression, so it never reaches a plan the AI conditions on.
