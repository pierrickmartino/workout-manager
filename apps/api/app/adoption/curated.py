"""Adoption's second source: turn a Curated Protocol into a user-owned copy (ADR-0130).

The twin of ``adoption/service.adopt`` for a Generated Protocol, with the same copy semantics:
only scalar values are copied, and the user's Protocol shares no mutable state with the source.
Two things differ on purpose:

- Exercises are **resolved only** (``find_by_name``), never created. Every name a Curated
  Protocol uses is a seeded ``curated`` Catalog entry, which the content-integrity test
  guarantees; a missing one raises rather than minting an ``ai_generated`` Stub.
- Every Session is stamped ``curated`` Session Provenance, so the AI-only affordances
  (Generation Feedback, Regeneration) are never offered on it.
- The Protocol and every Session record the **curated lineage**: which Curated Protocol and
  version they came from (issue #688). Written here once and never re-synced, so a later
  version of the Curated Protocol never alters this copy.

No LLM is involved, and nothing here touches the generation cache."""

from __future__ import annotations

from app.curated.model import CuratedProtocol
from app.curated.plan import AdoptionChoices, enumerate_plan
from app.domain.curated_lineage import CuratedLineage
from app.domain.session_provenance import SessionProvenance
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.protocol_repository import (
    ProtocolDraft,
    ProtocolRepository,
    ProtocolSessionDraft,
    ProtocolView,
)


class CuratedExerciseMissing(Exception):
    """A Curated Protocol names an Exercise the Catalog doesn't hold — a seeding fault."""

    def __init__(self, name: str) -> None:
        super().__init__(f"Curated Exercise '{name}' is not in the catalog.")
        self.name = name


def _resolve_ids(
    curated: CuratedProtocol, exercises: ExerciseRepository
) -> dict[str, int]:
    names = {
        prescription.exercise
        for session in curated.weekly_pattern
        for prescription in session.prescriptions
    }
    ids: dict[str, int] = {}
    for name in sorted(names):
        exercise = exercises.find_by_name(name)
        if exercise is None:
            raise CuratedExerciseMissing(name)
        ids[name] = exercise.id
    return ids


def adopt_curated(
    curated: CuratedProtocol,
    choices: AdoptionChoices,
    clerk_user_id: str,
    *,
    set_aside: bool,
    exercises: ExerciseRepository,
    protocols: ProtocolRepository,
) -> ProtocolView:
    """Persist ``curated`` enumerated to ``choices`` as a Protocol owned by
    ``clerk_user_id``. Callers validate ``choices`` first (``plan.validate_choices``).

    Adopting makes the new Protocol Current, setting the previous one aside, exactly as
    adopting a Generated Protocol does (ADR-0125) — unless ``set_aside``: the caller sets it
    for a user with a Sensitive Constraint, whose copy of this untailored plan arrives set
    aside and the previous Current Protocol stays Current until they Switch (ADR-0130,
    ADR-0058)."""

    ids = _resolve_ids(curated, exercises)
    sessions = [
        ProtocolSessionDraft(
            week=planned.week,
            day=planned.day,
            title=planned.title,
            training_type=planned.training_type,
            duration_minutes=planned.duration_minutes,
            prescriptions=[
                p.to_draft(ids[p.exercise]) for p in planned.prescriptions
            ],
        )
        for planned in enumerate_plan(curated, choices)
    ]
    draft = ProtocolDraft(
        training_type=curated.training_type,
        objective=curated.objective,
        sessions_per_week=curated.sessions_per_week,
        weeks=choices.weeks,
        duration_minutes=curated.duration_minutes,
        sessions=sessions,
        name=curated.name,
        provenance=SessionProvenance.CURATED.value,
        curated_lineage=CuratedLineage(
            identifier=curated.identifier, version=curated.version, name=curated.name
        ),
        set_aside=set_aside,
    )
    return protocols.create(clerk_user_id, draft)


__all__ = ["CuratedExerciseMissing", "adopt_curated"]
