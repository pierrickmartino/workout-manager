# Equipment discovery groups by a curated, read-time Equipment vocabulary

Equipment is free text everywhere today: a Fitness Profile's Default / Available Equipment is a
comma-separated string (`lib/equipment-presets.ts` parses and dedupes it only by exact lowercase
match), a catalog Exercise carries its required equipment as free-form strings, and the Catalog
browse equipment facet (ADR-0042/0072) filters over those raw strings. The consequence a UI/UX
review of `polish.pen` surfaced (screens 06 and 11): "barbell" and "barbells" never merge, casing
and singular/plural variants multiply the facet, and the profile equipment field is an unbounded
line of text. Filtering is unpredictable and the option set is noisy.

We fix this with a **curated Equipment vocabulary** — a small, fixed set of canonical equipment
names (never AI- or user-invented, the same species as **Muscle Group**, **Training Type**, and
**Progression Scheme**) plus an **alias map** that resolves each free-text string to its canonical
Equipment. Canonicalization is a **read-time projection** over the strings already present — the
same species as the Muscle Group roll-up, Movement Pattern (ADR-0072), and Catalog Completeness
(ADR-0041): computed by a pure `app.domain.equipment.classify_equipment`, **never a stored column**,
needing **no migration and no write hook**, re-derived for free as equipment strings change. A
string no alias claims falls into an explicit **Unmapped** ("Other") bucket rather than being
silently dropped — the honesty twin of leaving a muscle **Unclassified** or a movement **General**.

The canonical set is **user-facing**: it is the option set behind the Catalog equipment facet and
the Fitness Profile's equipment multi-select. Free-text entry stays allowed (it maps, or falls to
Unmapped), but discovery and filtering group by the canonical Equipment. Canonicalization is a
**discovery / filter** aid only — it does not change what generation reads. A generation request
still receives the raw equipment list, and the Default-vs-Available fallback (ADR-0038) is
untouched, so no cache key or generation input shifts.

## Considered options

- **An open, normalized Equipment catalog** — one row per normalized name that *grows* as AI or
  users introduce kit, alias-resolved and deduped, mirroring the shared Exercise Catalog (ADR-0002).
  Rejected: equipment is a bounded, dozens-of-items space, not an open movement universe, so it
  needs no growth machinery, no dedup governance, and no membership table. A curated closed set with
  an alias map is simpler and gives a clean, stable facet; the Exercise Catalog's open model would
  be over-engineering here.
- **Store a canonical `equipment` column with a canonicalize-on-write hook (and a migration)** —
  rejected: it violates the read-time-projection invariant (ADR-0018/0019), adds a migration and a
  write path to keep in sync, and buys nothing a read-time projection over the same strings does not
  already give. Canonicalization is cheap and deterministic.
- **Display-normalization only (case + singular/plural folding, no curated concept)** — rejected as
  insufficient: it de-noises the label but yields no closed option set to drive a predictable facet
  or a profile multi-select, and folding rules alone will not map genuine synonyms
  ("kettlebell"/"KB", "pull-up bar"/"chin-up bar").
- **An LLM call to canonicalize each equipment string** — rejected: needless cost and
  nondeterminism for a coarse, curated bucket that a name-keyword alias map resolves reliably; the
  same reasoning that keeps Muscle Group and Movement Pattern curated maps, not an AI call per read.

## Consequences

- Introduces **one new domain term, Equipment** (see `CONTEXT.md`), and **no data-model change**:
  no column, no migration, no write hook.
- The canonical set and its alias map are **curated data** — auditable and unit-tested — with a
  keyword-first resolver and an **Unmapped** fallback. Its rules are the load-bearing part and live
  beside the Muscle Group and Movement Pattern classifiers in `app.domain`.
- The Catalog equipment facet and per-exercise projection group by canonical Equipment; the profile
  equipment field becomes a multi-select over the canonical set that still round-trips free text.
  Because canonicalization is a pure projection, it recomputes automatically as equipment strings
  change — no backfill.
- Equipment is a **discovery / filter** projection only: it feeds no generation input, no cache key,
  and no progression, so it never reaches a plan the AI conditions on. Generation continues to read
  the raw equipment list under ADR-0038.
- The **Unmapped** bucket is disclosed, never hidden: a genuinely novel piece of kit still filters
  and displays under "Other" rather than vanishing, keeping the facet honest about its own coverage.

## Amendment: a write-time normalization boundary complements the read-time projection

Canonicalization for **discovery and display** stays a read-time projection exactly as above —
`classify_equipment` / `canonical_equipment` re-derive the facet, the per-exercise chip, and the
profile roll-up from whatever strings are present, with no stored column and no migration. We
**add** one thing this ADR originally left out: a **write-time normalization boundary** on the
single path that mints a *new* catalog Exercise (`_new_exercise`, covering AI generation, the
substitute generator, and the admin edit). It is **input validation at a boundary**, not the
rejected "canonicalize-on-write hook + migration": it rewrites the surface form of the *same*
free-text `required_equipment` list as it is first stored — a mapped string is kept in its
canonical token form so the `barbell`/`barbells`/`Floor` proliferation never enters the shared
catalog at all — and it adds **no column and no migration**.

Crucially it preserves this ADR's two load-bearing guarantees:

- **Unmapped is never dropped.** A string no alias claims is stored **verbatim** (a product name
  like `Atletica R8 …` survives as typed), so nothing novel is lost and a later alias-map
  improvement still re-buckets it at read time — the re-derivability the read-time model was
  chosen for is intact.
- **Generation is untouched.** The stored equipment metadata still feeds no generation input and
  no cache key; generation reads the raw available-equipment list under ADR-0038 as before, and
  the Default-vs-Available fallback is unchanged.

The boundary also logs each unmapped string as a **tripwire** — the one place a hallucinated or
genuinely new piece of kit entering the global catalog is *seen* — without rewriting or dropping
it. Existing rows are **not backfilled** (still no migration): the read-time projection already
makes their messy stored strings read canonically on every discovery surface, so a backfill would
buy nothing the projection does not already give. The net effect is that *new* writes are clean at
the source while *old* rows are cleaned only where it matters — on read.
