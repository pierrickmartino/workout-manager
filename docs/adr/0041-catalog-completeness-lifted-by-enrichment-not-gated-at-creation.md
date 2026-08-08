# 0041 — Catalog Completeness is a projection lifted by Enrichment, not a creation gate

We want every catalog Exercise to meet a quality bar — a description, targeted
muscles, Execution Steps, and ideally a picture — whether the movement was created
by the AI or by a human. There are two ways to get there: **gate** creation (refuse
sub-bar movements) or **guarantee enrichment** (accept them, then lift them). We
chose enrichment. Gating fights the deliberate name-only `user_entered` tier
(ADR-0031/0033) — a user mid-workout typing a movement just to log a set must not be
forced through a detail form — and it would require an AI call on the write path,
which ADR-0002 forbids (catalog identity is pure normalized-name dedup, no I/O on
write). So creation stays frictionless, and a new **Catalog Completeness** axis plus
an out-of-band **Enrichment** mechanism carry the quality guarantee.

## Considered options

- **Gate at creation (rejected).** Refuse an Exercise below the bar. Simple to reason
  about, but breaks the plan-less quick-log flow (ADR-0031/0033) and can't fill fields
  without an AI call on the write path (ADR-0002).
- **Guarantee enrichment, keep frictionless creation (chosen).** Accept a name-only
  Stub; make "below the bar" a first-class, visible state; lift it out-of-band. Gating
  the slower, more deliberate *hand-authoring* path (ADR-0040) is left open for a future
  ADR.
- **Human-triggered batch only (partially adopted).** Cheap and safe but not timely —
  "guaranteed" would mean "eventually, when someone runs it." Kept as the backfill for
  the existing catalog, not the primary path for new Stubs.

## Consequences

- **Catalog Completeness is a read-time projection, never a column.** Computed from
  which fields are populated, in `app/domain/exercise.py`, consistent with the
  load-bearing "read-time projections, never stored ledgers" invariant (ADR-0018/0019).
  Three states — **Stub → Listable → Enriched** — surfaced in the Exercise Library and
  on Exercise Detail alongside the Provenance marker already shown.
- **Measured provenance-blind.** A `curated`, `ai_generated`, or `user_entered` Exercise
  is held to the same yardstick, so a curated seed that ships only single-step guidance
  (`seed_movements.py`) can read as sub-bar and get a *human* top-up — Completeness is a
  distinct axis from Provenance (content presence, not trust).
- **The minimum (Listable) bar excludes the emphasis split — respecting ADR-0016.**
  Listable = description + non-empty flat `targeted_muscles` + ≥1 Execution Step. The
  Primary/Secondary split is **Enriched-tier only**: requiring it at the minimum would
  fight ADR-0016's "no fabricated primacy / flat is honest" and pressure invented
  primacy.
- **Enrichment runs out-of-band; the write stays AI-free.** Minting a Stub enqueues an
  async job on the existing RQ worker (the async-on-cache-miss pattern, ADR-0005); a
  human-triggered batch — a generalization of the muscle-emphasis re-enrichment pass
  (ADR-0016) from "split on `ai_generated`" to "full bar on any Stub" — backfills the
  existing corpus. ADR-0002's no-AI-on-write rule is untouched.
- **Provenance is immutable origin; Enrichment never promotes it.** AI-filled content on
  a `user_entered` movement leaves it `user_entered` — trust and completeness are
  separate axes, so unvalidated AI content never masquerades as human-reviewed. This
  mirrors the muscle-emphasis pass, which enriches `ai_generated` rows without changing
  their Provenance.
- **Precautions and the Exercise Image are curator-only.** The enrichment AI never writes
  them: a fabricated safety clearance or an anatomically wrong illustration is actively
  dangerous in an injury/rehab-cautious domain, worse than an empty field. Both are
  Enriched-tier, so their absence never blocks the Listable bar. User-uploaded images are
  deferred.
- **New schema: an optional `image` field on Exercise.** Net-new, nullable, filled from
  curated sources only.
