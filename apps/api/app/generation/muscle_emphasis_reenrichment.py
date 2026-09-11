"""The one-off muscle-emphasis re-enrichment pass (issue #107, ADR-0016).

``reenrich_muscle_emphasis`` is a deliberately human-triggered maintenance pass — it
is never wired into a route or run on deploy (the HITL go/no-go the maintainer
flagged in ADR-0016). It fills the Primary/Secondary emphasis split on catalog
Exercises invented before the split shipped, so the SPECS muscle map is useful for
most movements rather than only newly generated ones.

The pass is scoped and honest by construction:

- **`ai_generated` rows only.** It reads the catalog through
  ``list_by_provenance(AI_GENERATED)``, so `curated` rows are never seen, never
  overwritten by an AI batch, and Provenance (ADR-0002) stays meaningful.
- **The union is untouched.** It classifies each row's *existing* ``targeted_muscles``
  and writes back only the split via ``set_muscle_emphasis``, so the durable
  analytics-facing union the F3 Muscle Group roll-up reads is unaffected.
- **No fabricated primacy.** A row with no muscles at all has nothing to split and is
  skipped rather than given an empty or invented split.
- **Idempotent-friendly.** A row that already carries a split is left alone, so a
  re-run pays no AI cost and asserts nothing new.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.domain.exercise import Provenance, has_emphasis_split
from app.generation.muscle_emphasis_generator import (
    MuscleEmphasisGenerator,
    MuscleEmphasisRequest,
)
from app.repositories.exercise_repository import ExerciseRepository

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ReenrichmentSummary:
    """What the pass did, for the human who triggered it.

    ``enriched`` counts rows that gained a split this run; the ``skipped_*`` counts
    explain why the rest were left alone — already split, or carrying no muscles to
    split. ``curated`` rows never enter the pass, so they are not counted here."""

    enriched: int = 0
    skipped_already_split: int = 0
    skipped_no_muscles: int = 0


def reenrich_muscle_emphasis(
    *,
    exercises: ExerciseRepository,
    generator: MuscleEmphasisGenerator,
) -> ReenrichmentSummary:
    """Fill the Primary/Secondary split on ``ai_generated`` catalog Exercises.

    Classifies each eligible row's existing ``targeted_muscles`` through the
    enrichment ``generator`` and writes back only the split. Returns a
    ``ReenrichmentSummary`` of what was enriched and what was skipped.
    """

    enriched = 0
    skipped_already_split = 0
    skipped_no_muscles = 0

    for exercise in exercises.list_by_provenance(Provenance.AI_GENERATED):
        if has_emphasis_split(exercise):
            skipped_already_split += 1
            continue
        if not exercise.targeted_muscles:
            skipped_no_muscles += 1
            continue

        split = generator.generate(
            MuscleEmphasisRequest(
                exercise_name=exercise.name,
                description=exercise.description,
                targeted_muscles=tuple(exercise.targeted_muscles),
            )
        )
        exercises.set_muscle_emphasis(
            exercise.id,
            primary_muscles=split.primary_muscles,
            secondary_muscles=split.secondary_muscles,
        )
        enriched += 1

    return ReenrichmentSummary(
        enriched=enriched,
        skipped_already_split=skipped_already_split,
        skipped_no_muscles=skipped_no_muscles,
    )


def main() -> ReenrichmentSummary:
    """Human-triggered entrypoint: run the pass against the real catalog.

    This is the deliberate go/no-go the maintainer flagged (ADR-0016 HITL): the pass
    is wired only here behind ``python -m
    app.generation.muscle_emphasis_reenrichment``, never in a route or on deploy, so
    running an AI batch over the shared catalog is always a conscious human act.
    """

    # Imported inside ``main`` so importing the pass for tests never constructs a DB
    # engine or an LLM client — the batch's real, cost-bearing dependencies.
    from sqlmodel import Session

    from app.config import get_settings
    from app.db.session import get_engine
    from app.generation.llm import build_llm_client
    from app.generation.monitoring.call import GeneratorKind
    from app.generation.muscle_emphasis_generator import LlmMuscleEmphasisGenerator
    from app.repositories.exercise_repository import SqlExerciseRepository

    logging.basicConfig(level=logging.INFO)
    # Tag this batch as EXERCISE_ENRICHMENT (not the live MUSCLE_EMPHASIS split) so the
    # operator sees the one-off re-enrichment pass as its own line of AI spend.
    generator = LlmMuscleEmphasisGenerator(
        build_llm_client(get_settings()), kind=GeneratorKind.EXERCISE_ENRICHMENT
    )
    with Session(get_engine()) as session:
        summary = reenrich_muscle_emphasis(
            exercises=SqlExerciseRepository(session),
            generator=generator,
        )
    logger.info(
        "muscle-emphasis re-enrichment complete: enriched=%d, "
        "skipped_already_split=%d, skipped_no_muscles=%d",
        summary.enriched,
        summary.skipped_already_split,
        summary.skipped_no_muscles,
    )
    return summary


__all__ = ["ReenrichmentSummary", "reenrich_muscle_emphasis", "main"]


if __name__ == "__main__":  # pragma: no cover — deliberate human invocation
    main()
