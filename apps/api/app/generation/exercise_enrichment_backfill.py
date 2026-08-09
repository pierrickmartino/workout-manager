"""The Stub-enrichment backfill pass (issue #308, ADR-0041).

``backfill_stub_exercises`` is a deliberately human-triggered maintenance pass — it
is never wired into a route or run on deploy (the go/no-go the maintainer flagged in
ADR-0041, mirroring the muscle-emphasis re-enrichment HITL of ADR-0016). It lifts
existing **Stub** catalog Exercises up to at least **Listable** by filling each one's
description, targeted muscles, Execution Steps, and difficulty through the enrichment
path, so the corpus meets the shared quality bar rather than only newly minted rows.

This is a generalization of the muscle-emphasis re-enrichment pass from "split on
``ai_generated``" to "full bar on any Stub". It is honest by construction:

- **Provenance-blind eligibility.** It walks the whole catalog and classifies each
  row with the Catalog Completeness projection (ADR-0041), so a sub-bar ``curated``
  seed is lifted alongside a ``user_entered`` or ``ai_generated`` Stub.
- **Never changes Provenance.** AI-filled content on a ``user_entered`` row stays
  ``user_entered`` — trust and completeness are separate axes, so unvalidated AI
  content never masquerades as human-reviewed.
- **Never writes precautions or an Exercise Image.** The generator's schema carries
  no field for either; both stay curator-only, because a fabricated safety note or a
  wrong illustration is actively dangerous in an injury/rehab-cautious domain.
- **Idempotent-friendly.** A row already at or above Listable is skipped with no AI
  call, so a re-run pays no cost for the corpus it already lifted.
- **Fabricates nothing.** A Stub whose name is blank has no input to enrich from and
  is skipped before any AI call. And a fill the model could not produce honestly —
  one that would not even reach the Listable bar — is *not written*: the empty fill
  is discarded rather than blanking the row (which could erase a partial Stub's
  existing prose) or being miscounted as a lift. Such a row stays a Stub, so a re-run
  will retry it; that retry cost is the honest floor, since a name-only row's
  fillability can only be learned by asking.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.generation.exercise_enrichment import EnrichOutcome, enrich_exercise
from app.generation.exercise_enrichment_generator import ExerciseEnrichmentGenerator
from app.repositories.exercise_repository import ExerciseRepository

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EnrichmentSummary:
    """What the pass did, for the human who triggered it.

    ``enriched`` counts rows actually lifted to at least Listable this run; the
    ``skipped_*`` counts explain why the rest were left alone — already at or above
    the bar (no AI call), carrying nothing to work from (a blank name, no AI call),
    or generating a fill too thin to lift the row (an AI call was made, but nothing
    was written)."""

    enriched: int = 0
    skipped_already_complete: int = 0
    skipped_nothing_to_work_from: int = 0
    skipped_unfillable: int = 0


# Each per-row outcome maps to the summary counter it increments, so the batch tally
# stays a thin fold over the shared single-row step (``enrich_exercise``).
_OUTCOME_COUNTERS = {
    EnrichOutcome.ENRICHED: "enriched",
    EnrichOutcome.SKIPPED_ALREADY_COMPLETE: "skipped_already_complete",
    EnrichOutcome.SKIPPED_NOTHING_TO_WORK_FROM: "skipped_nothing_to_work_from",
    EnrichOutcome.SKIPPED_UNFILLABLE: "skipped_unfillable",
}


def backfill_stub_exercises(
    *,
    exercises: ExerciseRepository,
    generator: ExerciseEnrichmentGenerator,
) -> EnrichmentSummary:
    """Lift Stub catalog Exercises up to at least Listable.

    Walks the whole catalog and runs the shared single-row step (``enrich_exercise``)
    on each row — the same step the async-on-create worker uses (issue #309), so the
    two triggers never drift — tallying the per-row outcomes into an
    ``EnrichmentSummary`` of what was enriched and skipped.
    """

    counts = {counter: 0 for counter in _OUTCOME_COUNTERS.values()}
    for exercise in exercises.list_all():
        outcome = enrich_exercise(
            exercise, exercises=exercises, generator=generator
        )
        counts[_OUTCOME_COUNTERS[outcome]] += 1

    return EnrichmentSummary(**counts)


def main() -> EnrichmentSummary:
    """Human-triggered entrypoint: run the backfill against the real catalog.

    This is the deliberate go/no-go (ADR-0041, mirroring ADR-0016's HITL): the pass
    is wired only here behind ``python -m
    app.generation.exercise_enrichment_backfill``, never in a route or on deploy, so
    running an AI batch over the shared catalog is always a conscious human act.
    """

    # Imported inside ``main`` so importing the pass for tests never constructs a DB
    # engine or an LLM client — the batch's real, cost-bearing dependencies.
    from sqlmodel import Session

    from app.config import get_settings
    from app.db.session import get_engine
    from app.generation.exercise_enrichment_generator import (
        LlmExerciseEnrichmentGenerator,
    )
    from app.generation.llm import build_llm_client
    from app.repositories.exercise_repository import SqlExerciseRepository

    logging.basicConfig(level=logging.INFO)
    # The generator defaults to the EXERCISE_ENRICHMENT monitoring kind, so this
    # batch's spend reads as its own distinct line for the operator.
    generator = LlmExerciseEnrichmentGenerator(build_llm_client(get_settings()))
    with Session(get_engine()) as session:
        summary = backfill_stub_exercises(
            exercises=SqlExerciseRepository(session),
            generator=generator,
        )
    logger.info(
        "stub-enrichment backfill complete: enriched=%d, "
        "skipped_already_complete=%d, skipped_nothing_to_work_from=%d, "
        "skipped_unfillable=%d",
        summary.enriched,
        summary.skipped_already_complete,
        summary.skipped_nothing_to_work_from,
        summary.skipped_unfillable,
    )
    return summary


__all__ = ["EnrichmentSummary", "backfill_stub_exercises", "main"]


if __name__ == "__main__":  # pragma: no cover — deliberate human invocation
    main()
