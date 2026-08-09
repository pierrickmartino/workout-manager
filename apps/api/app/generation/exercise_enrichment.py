"""The shared single-row Stub-enrichment step (issues #308/#309, ADR-0041).

``enrich_exercise`` lifts one **Stub** catalog Exercise up to at least **Listable**
by filling its description, targeted muscles, Execution Steps, and difficulty through
the enrichment path. It is the one place that defines what "enrich a Stub" means, so
both triggers share it and can never drift:

- the human-triggered **backfill** (issue #308) walks the whole catalog and calls
  this per row;
- the async-on-create **worker** (issue #309) calls it once for a freshly minted
  Stub, out-of-band, so catalog creation stays AI-free (ADR-0002).

It is honest by construction — the same guarantees the backfill has always carried:

- **Provenance-blind eligibility.** Whether a row is a Stub is decided by the Catalog
  Completeness projection (ADR-0041), so a sub-bar ``curated`` seed is enriched
  alongside a ``user_entered`` or ``ai_generated`` Stub.
- **Never changes Provenance, precautions, the Exercise Image, or the emphasis
  split.** ``set_enrichment`` writes only the enrichable field set; trust and the
  curator-only / Enriched-tier fields are left untouched.
- **Idempotent-friendly.** A row already at or above Listable is skipped with no AI
  call, so a re-run (or a double-enqueue) pays no cost.
- **Fabricates nothing.** A blank name has no input to enrich from and is skipped
  before any AI call; and a fill too thin to actually clear the Listable bar is
  discarded unwritten rather than blanking a partial Stub's existing prose or being
  miscounted as a lift. Such a row stays a Stub, so a later run retries it — the
  honest floor, since a name-only row's fillability can only be learned by asking.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from app.domain.exercise import CatalogCompleteness, catalog_completeness
from app.generation.exercise_enrichment_generator import (
    EnrichmentRequest,
    ExerciseEnrichmentGenerator,
)
from app.generation.schema import GeneratedEnrichment
from app.repositories.exercise_repository import ExerciseRepository


class EnrichOutcome(str, Enum):
    """What ``enrich_exercise`` did with one row, so a caller can tally a batch.

    ``ENRICHED`` means the row was actually lifted to at least Listable; each
    ``SKIPPED_*`` explains why the row was left alone — already at or above the bar
    (no AI call), carrying nothing to work from (a blank name, no AI call), or a fill
    too thin to lift it (an AI call was made, but nothing was written)."""

    ENRICHED = "enriched"
    SKIPPED_ALREADY_COMPLETE = "skipped_already_complete"
    SKIPPED_NOTHING_TO_WORK_FROM = "skipped_nothing_to_work_from"
    SKIPPED_UNFILLABLE = "skipped_unfillable"


@dataclass(frozen=True)
class _ProspectiveRow:
    """The content fields of the row *as it would be* after a fill is written.

    A structural stand-in for ``catalog_completeness`` (its ``_Completable`` protocol
    is duck-typed), so the step can ask "would this fill lift the row?" through the
    one projection without constructing a DB model or re-stating the Listable rule."""

    description: str | None
    targeted_muscles: list[str]
    instructions: list[str]
    primary_muscles: list[str]
    secondary_muscles: list[str]
    difficulty: int | None
    precautions: list[str]
    image: str | None


def _would_lift(exercise, fill: GeneratedEnrichment) -> bool:
    """Whether applying ``fill`` to ``exercise`` would clear at least the Listable bar.

    Reuses the one Catalog Completeness projection (ADR-0041) rather than re-stating
    the Listable rule here, so the step and the read endpoints can never drift: it
    projects the *prospective* row — the enrichable fields the fill would write over,
    with the untouched gold-tier fields carried across — and asks whether that lands
    above ``STUB``. A fill the model returned empty for a too-vague name therefore
    reads as not-a-lift and is discarded by the caller."""

    prospective = _ProspectiveRow(
        description=fill.description,
        targeted_muscles=list(fill.targeted_muscles),
        instructions=list(fill.instructions),
        difficulty=fill.difficulty,
        # Enrichment never touches these, so the projection reads the row's own values.
        primary_muscles=exercise.primary_muscles,
        secondary_muscles=exercise.secondary_muscles,
        precautions=exercise.precautions,
        image=exercise.image,
    )
    return catalog_completeness(prospective) is not CatalogCompleteness.STUB


def enrich_exercise(
    exercise,
    *,
    exercises: ExerciseRepository,
    generator: ExerciseEnrichmentGenerator,
) -> EnrichOutcome:
    """Enrich one catalog Exercise if it is a fillable Stub; report what happened.

    Classifies ``exercise`` with the Catalog Completeness projection, enriches it
    through ``generator`` when it is a Stub with a name to work from, and writes back
    only the enrichable field set via ``exercises.set_enrichment`` — leaving
    Provenance, precautions, the image, and the emphasis split untouched. A fill too
    thin to clear the Listable bar is discarded unwritten. Returns an
    ``EnrichOutcome`` describing which branch was taken.
    """

    if catalog_completeness(exercise) is not CatalogCompleteness.STUB:
        return EnrichOutcome.SKIPPED_ALREADY_COMPLETE
    if not exercise.name.strip():
        return EnrichOutcome.SKIPPED_NOTHING_TO_WORK_FROM

    fill = generator.generate(
        EnrichmentRequest(
            exercise_name=exercise.name,
            description=exercise.description,
        )
    )
    if not _would_lift(exercise, fill):
        # An honest empty/too-thin fill: writing it would blank the row without
        # lifting it. Discard rather than fabricate or over-count (ADR-0041).
        return EnrichOutcome.SKIPPED_UNFILLABLE

    exercises.set_enrichment(
        exercise.id,
        description=fill.description,
        targeted_muscles=fill.targeted_muscles,
        instructions=fill.instructions,
        difficulty=fill.difficulty,
    )
    return EnrichOutcome.ENRICHED


__all__ = ["EnrichOutcome", "enrich_exercise"]
