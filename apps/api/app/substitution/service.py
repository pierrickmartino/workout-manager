"""The Substitution flow: swap a prescribed Exercise the user cannot perform.

``substitute_exercise`` orchestrates Slice 11's swap. It is **lookup-first**: it
builds the candidate set from the prescribed Exercise's typed catalog
relationships (Variations and Alternatives), filters them by the user's equipment
and constraints through ``resolve_substitute``, and swaps in the resolved catalog
Exercise instantly. Only when no catalog link fits does it fall back to AI
generation — the invented movement enters the shared catalog once, as
``ai_generated``, and is linked as an Alternative of the original. The swap mutates
only the user's own Session copy, preserves the prescription's sets/reps, is
unlimited, and never touches the once-per-Session regeneration guard."""

from __future__ import annotations

from app.db.models import Profile
from app.domain.exercise import Provenance
from app.domain.substitution import (
    RelationKind,
    SubstituteCandidate,
    SubstitutionContext,
    resolve_substitute,
)
from app.generation.substitute_generator import (
    SubstituteGenerator,
    SubstituteRequest,
)
from app.repositories.exercise_relationship_repository import (
    ExerciseRelationshipRepository,
    RelatedExercise,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.profile_repository import ProfileRepository
from app.repositories.session_repository import (
    PrescriptionView,
    SessionRepository,
    SessionView,
)


class SessionNotFound(Exception):
    """The Session does not exist or is owned by another user."""


class PrescriptionNotFound(Exception):
    """The Session has no Exercise Prescription at the requested position."""


def _candidate(related: RelatedExercise) -> SubstituteCandidate:
    """A catalog relationship, expressed as a candidate the rule can filter.

    The target Exercise's ``precautions`` become the candidate's
    ``contraindications`` so the user's constraints can rule it out."""

    return SubstituteCandidate(
        exercise_id=related.exercise.id,
        name=related.exercise.name,
        kind=related.kind,
        required_equipment=tuple(related.exercise.required_equipment),
        contraindications=tuple(related.exercise.precautions),
    )


def _context(profile: Profile, goal: str | None) -> SubstitutionContext:
    return SubstitutionContext(
        available_equipment=frozenset(profile.default_equipment),
        constraints=frozenset(
            list(profile.preferences) + list(profile.sensitive_constraints)
        ),
        goal=goal,
    )


def _find_prescription(view: SessionView, position: int) -> PrescriptionView | None:
    for prescription in view.prescriptions:
        if prescription.position == position:
            return prescription
    return None


def substitute_exercise(
    session_id: int,
    clerk_user_id: str,
    position: int,
    *,
    relationships: ExerciseRelationshipRepository,
    exercises: ExerciseRepository,
    sessions: SessionRepository,
    profiles: ProfileRepository,
    generator: SubstituteGenerator,
) -> SessionView:
    """Substitute the Exercise at ``position`` in the owner's Session.

    Raises ``SessionNotFound`` if the user does not own the Session,
    ``PrescriptionNotFound`` if it has no prescription at ``position``, and
    ``GenerationError`` (from the generator) if the AI fallback output is
    malformed — in every failure case nothing is persisted.
    """

    view = sessions.get(session_id, clerk_user_id)
    if view is None:
        raise SessionNotFound(session_id)

    prescription = _find_prescription(view, position)
    if prescription is None:
        raise PrescriptionNotFound(position)

    profile = profiles.get_or_create(clerk_user_id)
    context = _context(profile, view.training_type)
    candidates = [
        _candidate(related)
        for related in relationships.substitutes_for(prescription.exercise_id)
    ]

    resolution = resolve_substitute(candidates, context)
    if resolution.needs_ai_fallback:
        new_exercise_id = _generate_substitute(
            prescription,
            context,
            view.training_type,
            relationships=relationships,
            exercises=exercises,
            generator=generator,
        )
    else:
        new_exercise_id = resolution.candidate.exercise_id

    result = sessions.substitute_prescription(
        session_id, clerk_user_id, position, new_exercise_id
    )
    if result is None:  # ownership/position checked above; defensive only
        raise SessionNotFound(session_id)
    return result


def _generate_substitute(
    prescription: PrescriptionView,
    context: SubstitutionContext,
    goal: str | None,
    *,
    relationships: ExerciseRelationshipRepository,
    exercises: ExerciseRepository,
    generator: SubstituteGenerator,
) -> int:
    """Invent a substitute, store it once as ``ai_generated``, and link it as an
    Alternative of the original so future lookups can resolve it."""

    generated = generator.generate(
        SubstituteRequest(
            original_name=prescription.exercise_name,
            training_type=goal,
            available_equipment=tuple(sorted(context.available_equipment)),
            constraints=tuple(sorted(context.constraints)),
        )
    )
    exercise = exercises.find_or_create(
        generated.exercise_name,
        provenance=Provenance.AI_GENERATED,
        description=generated.exercise_description,
        targeted_muscles=generated.targeted_muscles,
        required_equipment=generated.required_equipment,
        instructions=generated.instructions,
        difficulty=generated.difficulty,
        precautions=generated.precautions,
    )
    relationships.add(prescription.exercise_id, exercise.id, RelationKind.ALTERNATIVE)
    return exercise.id


__all__ = [
    "SessionNotFound",
    "PrescriptionNotFound",
    "substitute_exercise",
]
