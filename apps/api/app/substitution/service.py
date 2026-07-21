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

from dataclasses import dataclass

from app.db.models import Profile
from app.domain.exercise import Provenance
from app.domain.progression import next_prescription
from app.domain.substitution import (
    RelationKind,
    SubstituteCandidate,
    SubstitutionContext,
    compatible_candidates,
    next_harder_variation,
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
from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    LoggedSetView,
)
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


class SubstituteNotAvailable(Exception):
    """An explicit substitute target is not a compatible catalog link for the
    prescription — so the safety posture cannot be bypassed by naming any Exercise."""


@dataclass(frozen=True)
class HarderVariationSuggestion:
    """The next harder Variation offered when a pure-bodyweight Prescription has hit
    its rep ceiling (#202). An *offer* only — never an applied swap."""

    exercise_id: int
    name: str


@dataclass(frozen=True)
class _RepLoad:
    """The minimal shape ``next_prescription`` reads: rep target and free-text load."""

    reps: str
    recommended_load: str | None


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
        difficulty=related.exercise.difficulty,
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
    target_exercise_id: int | None = None,
    relationships: ExerciseRelationshipRepository,
    exercises: ExerciseRepository,
    sessions: SessionRepository,
    profiles: ProfileRepository,
    generator: SubstituteGenerator,
) -> SessionView:
    """Substitute the Exercise at ``position`` in the owner's Session.

    With ``target_exercise_id`` the caller accepts a specific swap — e.g. the
    harder-Variation offer at the rep ceiling (#202): the target must be a
    *compatible* catalog link of the prescribed Exercise, or ``SubstituteNotAvailable``
    is raised so the safety posture (ADR-0003) cannot be bypassed by naming any
    Exercise. Without it, resolution is automatic: a compatible catalog link is
    swapped in lookup-first, falling back to AI generation only when none fits.

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

    if target_exercise_id is not None:
        new_exercise_id = _accept_target(target_exercise_id, candidates, context)
    else:
        new_exercise_id = _auto_resolve(
            prescription,
            context,
            view.training_type,
            candidates,
            relationships=relationships,
            exercises=exercises,
            generator=generator,
        )

    result = sessions.substitute_prescription(
        session_id, clerk_user_id, position, new_exercise_id
    )
    if result is None:  # ownership/position checked above; defensive only
        raise SessionNotFound(session_id)
    return result


def _accept_target(
    target_exercise_id: int,
    candidates: list[SubstituteCandidate],
    context: SubstitutionContext,
) -> int:
    """Validate an explicitly-accepted swap target: it must be a compatible catalog
    link of the prescribed Exercise. Anything else is ``SubstituteNotAvailable`` — a
    swap is only ever to a movement the catalog vouches for and the user can take."""

    allowed = {
        candidate.exercise_id
        for candidate in compatible_candidates(candidates, context)
    }
    if target_exercise_id not in allowed:
        raise SubstituteNotAvailable(target_exercise_id)
    return target_exercise_id


def _auto_resolve(
    prescription: PrescriptionView,
    context: SubstitutionContext,
    training_type: str | None,
    candidates: list[SubstituteCandidate],
    *,
    relationships: ExerciseRelationshipRepository,
    exercises: ExerciseRepository,
    generator: SubstituteGenerator,
) -> int:
    """Resolve a swap lookup-first, inventing an AI substitute only when none fits."""

    resolution = resolve_substitute(candidates, context)
    if resolution.needs_ai_fallback:
        return _generate_substitute(
            prescription,
            context,
            training_type,
            relationships=relationships,
            exercises=exercises,
            generator=generator,
        )
    return resolution.candidate.exercise_id


def _latest_sets_for(
    logged: LoggedSessionRepository, clerk_user_id: str, exercise_id: int
) -> list[LoggedSetView]:
    """The user's Logged Sets for ``exercise_id`` from its most recent performance.

    ``list_for_user`` arrives newest-first, so the first Logged Session that touched
    the Exercise carries the sets that drive its next Progression step."""

    for session in logged.list_for_user(clerk_user_id):
        sets = [s for s in session.logged_sets if s.exercise_id == exercise_id]
        if sets:
            return sets
    return []


def harder_variation_suggestion(
    session_id: int,
    clerk_user_id: str,
    position: int,
    *,
    relationships: ExerciseRelationshipRepository,
    exercises: ExerciseRepository,
    sessions: SessionRepository,
    logged: LoggedSessionRepository,
    profiles: ProfileRepository,
) -> HarderVariationSuggestion | None:
    """The harder-Variation offer for a Prescription at its rep ceiling, or ``None``.

    Read-only: it computes the deterministic Progression step from the user's latest
    Logged Sets and, only when that raises ``suggest_harder_variation`` (a pure
    bodyweight movement out of rep headroom, ADR-0026), resolves the next harder
    Variation from the catalog — filtered to what the user can safely take (ADR-0003).
    Returns ``None`` before the ceiling, or when nothing harder is compatible: the
    prescription simply holds. Never mutates the Session — the swap stays a separate,
    user-initiated Substitution.

    Raises ``SessionNotFound`` / ``PrescriptionNotFound`` like ``substitute_exercise``.
    """

    view = sessions.get(session_id, clerk_user_id)
    if view is None:
        raise SessionNotFound(session_id)

    prescription = _find_prescription(view, position)
    if prescription is None:
        raise PrescriptionNotFound(position)

    load = prescription.recommended_load
    step = next_prescription(
        _RepLoad(
            reps=prescription.reps,
            recommended_load=load["text"] if load else None,
        ),
        _latest_sets_for(logged, clerk_user_id, prescription.exercise_id),
    )
    if not step.suggest_harder_variation:
        return None

    current = exercises.get(prescription.exercise_id)
    candidates = [
        _candidate(related)
        for related in relationships.substitutes_for(prescription.exercise_id)
    ]
    profile = profiles.get_or_create(clerk_user_id)
    context = _context(profile, view.training_type)
    harder = next_harder_variation(
        current.difficulty if current is not None else None,
        compatible_candidates(candidates, context),
    )
    if harder is None:
        return None
    return HarderVariationSuggestion(exercise_id=harder.exercise_id, name=harder.name)


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
        primary_muscles=generated.primary_muscles,
        secondary_muscles=generated.secondary_muscles,
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
    "SubstituteNotAvailable",
    "HarderVariationSuggestion",
    "substitute_exercise",
    "harder_variation_suggestion",
]
