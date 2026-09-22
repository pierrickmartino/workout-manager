"""The one-off muscle-granularity re-enrichment pass (issue #545, ADR-0016/0078).

``reenrich_muscle_granularity`` is a deliberately human-triggered maintenance pass — it
is never wired into a route or run on deploy (the HITL go/no-go the maintainer flagged in
ADR-0016, mirroring the muscle-emphasis re-enrichment of that same ADR). It sharpens the
flat ``targeted_muscles`` union on catalog Exercises that still name muscles at a coarse,
group level ("back", "shoulders", "core") up to **individual-muscle** resolution
("latissimus dorsi", "trapezius", "rhomboids"), so the Muscle Atlas heat reads real
per-muscle coverage instead of a group-level blob. Because canonical-muscle classification
is a read-time projection of that same union (ADR-0078), the finer union sharpens **both**
tiers automatically — it still rolls up to the same six Muscle Groups, and now also lights
specific muscles — with no schema change and no new column.

The pass is scoped and honest by construction:

- **`ai_generated` rows only.** It reads the catalog through
  ``list_by_provenance(AI_GENERATED)``, so `curated` rows are never seen, never overwritten
  by an AI batch, and Provenance (ADR-0002) stays meaningful.
- **The roll-up is unchanged by construction.** A refinement is written only when its real
  Muscle-Group fingerprint (``real_groups_of``) is **identical** to the original union's, so
  a finer union can never fabricate a group the exercise did not work nor drop one it did
  (issue #545). A refinement that would change the roll-up — or that comes back empty, or
  that fails to actually sharpen every coarse region — is discarded unwritten.
- **Only the union is touched.** It writes back through ``set_targeted_muscles``, leaving the
  Primary/Secondary split (ADR-0016), description, Execution Steps, and difficulty untouched.
  This is deliberate: ADR-0016 stores the union and the split as **independent** fields, and
  the coverage/Atlas heat — the surface this issue sharpens — drives presence off the *union*,
  with a coarse split term simply going inert (every refined muscle then reads at the
  ``emphasis_of`` "no split → all primary" weight). A consequence worth naming: right after
  this pass a row can carry a *fine* union beside a still-*coarse* split (e.g. primary
  ``["back"]``), so the single-exercise emphasis highlight (issue #544) keeps reading coarse
  until the muscle-emphasis re-enrichment pass (issue #107, same ADR-0016 HITL) re-splits the
  now-fine union. The two passes compose; neither fabricates primacy the catalog does not
  assert.
- **Nothing to sharpen is skipped.** A row whose union carries no coarse region term is
  already as fine as the read tier reads and is left alone with no AI call, so a re-run pays
  no cost for the corpus it already sharpened.
- **No fabricated coverage.** A row with no muscles at all has nothing to refine and is
  skipped before any AI call.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass

from app.domain.exercise import Provenance
from app.domain.muscles import is_coarse_region, real_groups_of
from app.generation.muscle_granularity_generator import (
    MuscleGranularityGenerator,
    MuscleGranularityRequest,
)
from app.repositories.exercise_repository import ExerciseRepository

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class MuscleGranularityReenrichmentSummary:
    """What the pass did, for the human who triggered it.

    ``enriched`` counts rows whose union was sharpened this run; the ``skipped_*`` counts
    explain why the rest were left alone — already fine (no coarse region, no AI call),
    carrying no muscles to refine (no AI call), or producing a refinement that was discarded
    because it was empty, would have changed the six-group roll-up, or did not actually
    sharpen every coarse region (an AI call was made, but nothing was written). ``curated``
    rows never enter the pass, so they are not counted here."""

    enriched: int = 0
    skipped_already_fine: int = 0
    skipped_no_muscles: int = 0
    skipped_unrefinable: int = 0


def _is_accepted_refinement(
    original: Sequence[str], refined: Sequence[str]
) -> bool:
    """Whether a model refinement is safe to write over ``original``'s union.

    Honest by construction (issue #545): accept only a non-empty union that (a) rolls up to
    the *exact same* real Muscle Groups as the original — so no group is fabricated or lost
    (``real_groups_of``) — and (b) leaves **no** coarse region term behind, so the write
    genuinely sharpens the blob rather than restating it. A refinement failing either test is
    discarded, leaving the row a coarse Stub for a later retry rather than degrading it."""

    if not refined:
        return False
    if real_groups_of(refined) != real_groups_of(original):
        return False
    return not any(is_coarse_region(muscle) for muscle in refined)


def reenrich_muscle_granularity(
    *,
    exercises: ExerciseRepository,
    generator: MuscleGranularityGenerator,
) -> MuscleGranularityReenrichmentSummary:
    """Sharpen coarse ``targeted_muscles`` unions to individual muscles on ``ai_generated`` rows.

    Refines each eligible row's coarse union through the granularity ``generator`` and writes
    back only the union (``set_targeted_muscles``) when the refinement preserves the six-group
    roll-up and fully sharpens the blob. Returns a ``MuscleGranularityReenrichmentSummary`` of
    what was sharpened and what was skipped.
    """

    enriched = 0
    skipped_already_fine = 0
    skipped_no_muscles = 0
    skipped_unrefinable = 0

    for exercise in exercises.list_by_provenance(Provenance.AI_GENERATED):
        if not exercise.targeted_muscles:
            skipped_no_muscles += 1
            continue
        if not any(is_coarse_region(muscle) for muscle in exercise.targeted_muscles):
            skipped_already_fine += 1
            continue

        refined = generator.generate(
            MuscleGranularityRequest(
                exercise_name=exercise.name,
                description=exercise.description,
                targeted_muscles=tuple(exercise.targeted_muscles),
            )
        )
        if not _is_accepted_refinement(
            exercise.targeted_muscles, refined.targeted_muscles
        ):
            # An empty, fabricating, or half-sharpened refinement: writing it would either
            # change the roll-up or leave the blob in place. Discard rather than degrade the
            # row (issue #545); a re-run retries it.
            skipped_unrefinable += 1
            continue

        exercises.set_targeted_muscles(exercise.id, refined.targeted_muscles)
        enriched += 1

    return MuscleGranularityReenrichmentSummary(
        enriched=enriched,
        skipped_already_fine=skipped_already_fine,
        skipped_no_muscles=skipped_no_muscles,
        skipped_unrefinable=skipped_unrefinable,
    )


def main() -> MuscleGranularityReenrichmentSummary:
    """Human-triggered entrypoint: run the pass against the real catalog.

    This is the deliberate go/no-go the maintainer flagged (ADR-0016 HITL): the pass is wired
    only here behind ``python -m app.generation.muscle_granularity_reenrichment``, never in a
    route or on deploy, so running an AI batch over the shared catalog is always a conscious
    human act.
    """

    # Imported inside ``main`` so importing the pass for tests never constructs a DB engine or
    # an LLM client — the batch's real, cost-bearing dependencies.
    from sqlmodel import Session

    from app.config import get_settings
    from app.db.session import get_engine
    from app.generation.llm import build_llm_client
    from app.generation.muscle_granularity_generator import (
        LlmMuscleGranularityGenerator,
    )
    from app.repositories.exercise_repository import SqlExerciseRepository

    logging.basicConfig(level=logging.INFO)
    # The generator defaults to the EXERCISE_ENRICHMENT monitoring kind, so this batch's spend
    # reads as its own distinct line for the operator.
    generator = LlmMuscleGranularityGenerator(build_llm_client(get_settings()))
    with Session(get_engine()) as session:
        summary = reenrich_muscle_granularity(
            exercises=SqlExerciseRepository(session),
            generator=generator,
        )
    logger.info(
        "muscle-granularity re-enrichment complete: enriched=%d, "
        "skipped_already_fine=%d, skipped_no_muscles=%d, skipped_unrefinable=%d",
        summary.enriched,
        summary.skipped_already_fine,
        summary.skipped_no_muscles,
        summary.skipped_unrefinable,
    )
    return summary


__all__ = [
    "MuscleGranularityReenrichmentSummary",
    "reenrich_muscle_granularity",
    "main",
]


if __name__ == "__main__":  # pragma: no cover — deliberate human invocation
    main()
