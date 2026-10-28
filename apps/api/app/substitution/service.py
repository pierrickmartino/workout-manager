"""The Substitution flow: swap a prescribed Exercise the user cannot perform.

``substitute_exercise`` orchestrates Slice 11's swap. It is **lookup-first**: it
builds the candidate set from the prescribed Exercise's typed catalog
relationships (Variations and Alternatives), filters them by the user's equipment
and constraints through ``resolve_substitute``, and swaps in the resolved catalog
Exercise instantly. Only when no catalog link fits does it fall back to AI
generation — the invented movement enters the shared catalog once, as
``ai_generated``, and is linked as an Alternative of the original. The swap mutates
only the user's own Session copy, preserves the prescription's sets/reps, is
unlimited, and never touches the once-per-Session regeneration guard.

A swap onto different equipment re-expresses the Load, and the first swap keeps the
Prescribed Original so ``restore_original`` can put it back (ADR-0143,
``app.domain.prescribed_original``)."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from enum import Enum
from functools import cache

from app.db.models import Profile
from app.domain.exercise import Provenance
from app.domain.fitness_profile import resolve_equipment
from app.domain.prescribed_original import (
    PrescriptionState,
    restore_changes,
    substitution_changes,
)
from app.domain.substitute_muscle_coverage import covers_original_muscle_groups
from app.domain.substitution import (
    RelationKind,
    SubstituteCandidate,
    SubstitutionContext,
    compatible_candidates,
    next_harder_variation,
    resolve_substitute,
)
from app.generation.schema import GeneratedSubstitute
from app.generation.substitute_generator import (
    SubstituteGenerator,
    SubstituteRequest,
)
from app.progression.overlay import ProgressionOverlay
from app.repositories.exercise_relationship_repository import (
    ExerciseRelationshipRepository,
    RelatedExercise,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import LoggedSessionRepository
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


class NoPrescribedOriginal(Exception):
    """Restore was asked of a prescription that holds no Prescribed Original: it was
    never substituted, or has already been restored (ADR-0143)."""


class SessionPerformed(Exception):
    """The Session is a Protocol member with a Logged Session behind it: settled
    history, never rewritten. Only the un-performed tail of a Protocol is edited
    (ADR-0020); a standalone Session is never refused, since a plan edit there only
    reaches future performances."""


class SubstituteMuscleMismatch(Exception):
    """The AI fallback twice invented a substitute that does not train the original's
    Muscle Groups (ADR-0143), so the Substitution fails and nothing is written."""


# One try plus one retry for an AI substitute that misses the original's Muscle Groups.
MUSCLE_CHECK_ATTEMPTS = 2


class SubstitutionSource(str, Enum):
    """Where a Substitution's new Exercise came from: a catalog Variation/Alternative, or
    invented by the AI fallback."""

    CATALOG = "catalog"
    GENERATED = "generated"


@dataclass(frozen=True)
class SubstitutionOutcome:
    """A persisted Substitution: the updated Session and where its new Exercise came from."""

    session: SessionView
    source: SubstitutionSource


@dataclass(frozen=True)
class HarderVariationSuggestion:
    """The next harder Variation offered when a pure-bodyweight Prescription has hit
    its rep ceiling (#202). An *offer* only — never an applied swap."""

    exercise_id: int
    name: str


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


def _context(
    profile: Profile | None,
    goal: str | None,
    available_equipment: Sequence[str] | None = None,
) -> SubstitutionContext:
    """The user-side choices for one Substitution. ``available_equipment`` is the equipment
    stated for this action; ``None`` inherits the Default Equipment and an empty list is
    bodyweight only (ADR-0038, ADR-0143). Constraints always come from the Profile; a user
    with no stored Profile has no Default Equipment and no constraints."""

    equipment = resolve_equipment(
        None if available_equipment is None else list(available_equipment),
        profile.default_equipment if profile is not None else [],
    )
    constraints = (
        list(profile.preferences) + list(profile.sensitive_constraints)
        if profile is not None
        else []
    )
    return SubstitutionContext(
        available_equipment=frozenset(equipment),
        constraints=frozenset(constraints),
        goal=goal,
    )


def ensure_editable(
    view: SessionView, clerk_user_id: str, logged: LoggedSessionRepository
) -> None:
    """Raise ``SessionPerformed`` when ``view`` is a performed Protocol Session.

    "Performed" means *any* Logged Session references it, whatever its Completion
    Outcome — an Incomplete log is still a record of that plan — matching the
    read-time Logged Count the Session page reads and the Warm-up guard. Shared by
    every Substitution write (single swap, Restore, Equipment Substitution)."""

    if not view.is_protocol_member:
        return
    if logged.count_for_session(clerk_user_id, view.id) > 0:
        raise SessionPerformed(view.id)


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
    available_equipment: Sequence[str] | None = None,
    relationships: ExerciseRelationshipRepository,
    exercises: ExerciseRepository,
    sessions: SessionRepository,
    profiles: ProfileRepository,
    generator: SubstituteGenerator,
    logged: LoggedSessionRepository,
) -> SessionView:
    """Substitute the Exercise at ``position`` in the owner's Session.

    With ``target_exercise_id`` the caller accepts a specific swap — e.g. the
    harder-Variation offer at the rep ceiling (#202): the target must be a
    *compatible* catalog link of the prescribed Exercise, or ``SubstituteNotAvailable``
    is raised so the safety posture (ADR-0003) cannot be bypassed by naming any
    Exercise. Without it, resolution is automatic: a compatible catalog link is
    swapped in lookup-first, falling back to AI generation only when none fits.

    ``available_equipment`` is the equipment the user has for this one action (ADR-0143):
    omitted, the Default Equipment applies; an empty list means bodyweight only. It
    filters catalog candidates and reaches the AI fallback; the Profile is never written.

    Raises ``SessionNotFound`` if the user does not own the Session,
    ``SessionPerformed`` if it is a performed Protocol Session (always checked:
    ``logged`` is required, ADR-0020),
    ``PrescriptionNotFound`` if it has no prescription at ``position``, and
    ``GenerationError`` (from the generator) if the AI fallback output is
    malformed, or ``SubstituteMuscleMismatch`` if it twice misses the original's
    Muscle Groups (ADR-0143) — in every failure case nothing is persisted.
    """

    return substitute_with_source(
        session_id,
        clerk_user_id,
        position,
        target_exercise_id=target_exercise_id,
        available_equipment=available_equipment,
        relationships=relationships,
        exercises=exercises,
        sessions=sessions,
        profiles=profiles,
        generator=generator,
        logged=logged,
    ).session


def substitute_with_source(
    session_id: int,
    clerk_user_id: str,
    position: int,
    *,
    target_exercise_id: int | None = None,
    available_equipment: Sequence[str] | None = None,
    relationships: ExerciseRelationshipRepository,
    exercises: ExerciseRepository,
    sessions: SessionRepository,
    profiles: ProfileRepository,
    generator: SubstituteGenerator,
    logged: LoggedSessionRepository,
) -> SubstitutionOutcome:
    """``substitute_exercise``, also reporting whether the new Exercise came from the
    catalog or the AI fallback — what Equipment Substitution reports per row."""

    view = sessions.get(session_id, clerk_user_id)
    if view is None:
        raise SessionNotFound(session_id)
    ensure_editable(view, clerk_user_id, logged)

    prescription = _find_prescription(view, position)
    if prescription is None:
        raise PrescriptionNotFound(position)

    profile = profiles.get_or_create(clerk_user_id)
    context = _context(profile, view.training_type, available_equipment)
    candidates = [
        _candidate(related)
        for related in relationships.substitutes_for(prescription.exercise_id)
    ]

    if target_exercise_id is not None:
        new_exercise_id = _accept_target(target_exercise_id, candidates, context)
        source = SubstitutionSource.CATALOG
    else:
        new_exercise_id, source = _auto_resolve(
            prescription,
            context,
            view.training_type,
            candidates,
            relationships=relationships,
            exercises=exercises,
            generator=generator,
        )

    target = exercises.get(new_exercise_id)
    changes = substitution_changes(
        _state(prescription),
        target_exercise_id=new_exercise_id,
        target_equipment=list(target.required_equipment) if target is not None else [],
    )
    result = sessions.revise_prescription(
        session_id, clerk_user_id, position, changes
    )
    if result is None:  # ownership/position checked above; defensive only
        raise SessionNotFound(session_id)
    return SubstitutionOutcome(session=result, source=source)


def _state(prescription: PrescriptionView) -> PrescriptionState:
    return PrescriptionState(
        exercise_id=prescription.exercise_id,
        exercise_name=prescription.exercise_name,
        required_equipment=tuple(prescription.required_equipment),
        recommended_load=prescription.recommended_load,
        scheme=prescription.scheme,
        prescribed_original=prescription.prescribed_original,
    )


def restore_original(
    session_id: int,
    clerk_user_id: str,
    position: int,
    *,
    sessions: SessionRepository,
    logged: LoggedSessionRepository,
) -> SessionView:
    """Restore the prescription at ``position`` to its Prescribed Original (ADR-0143).

    Puts the snapshotted Exercise, Load and Progression Scheme back exactly and clears
    the snapshot. No AI call and no catalog write.

    Raises ``SessionNotFound`` if the user does not own the Session,
    ``SessionPerformed`` if it is a performed Protocol Session (Restore is offered only
    where Substitution is), ``PrescriptionNotFound`` if it has no prescription at
    ``position``, and ``NoPrescribedOriginal`` if that prescription holds no snapshot.
    Nothing is persisted on any failure."""

    view = sessions.get(session_id, clerk_user_id)
    if view is None:
        raise SessionNotFound(session_id)
    ensure_editable(view, clerk_user_id, logged)

    prescription = _find_prescription(view, position)
    if prescription is None:
        raise PrescriptionNotFound(position)
    if prescription.prescribed_original is None:
        raise NoPrescribedOriginal(position)

    result = sessions.revise_prescription(
        session_id,
        clerk_user_id,
        position,
        restore_changes(prescription.prescribed_original),
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
) -> tuple[int, SubstitutionSource]:
    """Resolve a swap lookup-first, inventing an AI substitute only when none fits."""

    resolution = resolve_substitute(candidates, context)
    if resolution.needs_ai_fallback:
        generated_id = _generate_substitute(
            prescription,
            context,
            training_type,
            relationships=relationships,
            exercises=exercises,
            generator=generator,
        )
        return generated_id, SubstitutionSource.GENERATED
    return resolution.candidate.exercise_id, SubstitutionSource.CATALOG


def _suggestion_for(
    prescription: PrescriptionView,
    overlay: ProgressionOverlay,
    context: Callable[[], SubstitutionContext],
    *,
    relationships: ExerciseRelationshipRepository,
    exercises: ExerciseRepository,
) -> HarderVariationSuggestion | None:
    """The harder-Variation offer for one Prescription, as its Progression Scheme decides.

    ``context`` is called only when the Progression step raises the offer, so a
    Session with no offer never reads the Profile."""

    if not overlay.progress(prescription).suggests_harder_variation:
        return None

    current = exercises.get(prescription.exercise_id)
    candidates = [
        _candidate(related)
        for related in relationships.substitutes_for(prescription.exercise_id)
    ]
    harder = next_harder_variation(
        current.difficulty if current is not None else None,
        compatible_candidates(candidates, context()),
    )
    if harder is None:
        return None
    return HarderVariationSuggestion(exercise_id=harder.exercise_id, name=harder.name)


def _lazy_context(
    profiles: ProfileRepository, clerk_user_id: str, goal: str | None
) -> Callable[[], SubstitutionContext]:
    """The user's SubstitutionContext, read from the Profile at most once."""

    return cache(lambda: _context(profiles.get_or_create(clerk_user_id), goal))


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

    Read-only: it computes the Prescription's Progression step through its stored
    scheme (ADR-0064) and, only when that raises the offer (a pure bodyweight
    movement out of rep headroom, ADR-0026; never a Static one), resolves the next harder
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

    return _suggestion_for(
        prescription,
        ProgressionOverlay.from_history(logged.list_for_user(clerk_user_id)),
        _lazy_context(profiles, clerk_user_id, view.training_type),
        relationships=relationships,
        exercises=exercises,
    )


@dataclass(frozen=True)
class PositionedSuggestion:
    """One Prescription's harder-Variation offer, keyed by its position."""

    position: int
    suggestion: HarderVariationSuggestion | None


def harder_variation_suggestions(
    session_id: int,
    clerk_user_id: str,
    *,
    relationships: ExerciseRelationshipRepository,
    exercises: ExerciseRepository,
    sessions: SessionRepository,
    logged: LoggedSessionRepository,
    profiles: ProfileRepository,
) -> tuple[PositionedSuggestion, ...]:
    """Every Prescription's harder-Variation offer, in Session order (audit V-5).

    The batch form of ``harder_variation_suggestion``, with the same rule per
    Prescription: the Session, the user's Logged Sessions and the Profile are each
    read once for the whole Session instead of once per Prescription.

    Raises ``SessionNotFound`` if the user does not own the Session.
    """

    view = sessions.get(session_id, clerk_user_id)
    if view is None:
        raise SessionNotFound(session_id)

    overlay = ProgressionOverlay.from_history(logged.list_for_user(clerk_user_id))
    context = _lazy_context(profiles, clerk_user_id, view.training_type)
    return tuple(
        PositionedSuggestion(
            position=prescription.position,
            suggestion=_suggestion_for(
                prescription,
                overlay,
                context,
                relationships=relationships,
                exercises=exercises,
            ),
        )
        for prescription in view.prescriptions
    )


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
    Alternative of the original so future lookups can resolve it.

    The output must cover the original's Muscle Groups (ADR-0143): a mismatch is
    retried once, and a second mismatch raises ``SubstituteMuscleMismatch`` before
    anything reaches the shared catalog."""

    original = exercises.get(prescription.exercise_id)
    original_primary = tuple(original.primary_muscles) if original else ()
    original_targeted = (
        tuple(original.targeted_muscles)
        if original
        else tuple(prescription.targeted_muscles)
    )
    request = SubstituteRequest(
        original_name=prescription.exercise_name,
        training_type=goal,
        available_equipment=tuple(sorted(context.available_equipment)),
        constraints=tuple(sorted(context.constraints)),
        original_primary_muscles=original_primary,
        original_secondary_muscles=(
            tuple(original.secondary_muscles) if original else ()
        ),
    )
    generated = _generate_covering(
        request, original_targeted=original_targeted, generator=generator
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


def _generate_covering(
    request: SubstituteRequest,
    *,
    original_targeted: tuple[str, ...],
    generator: SubstituteGenerator,
) -> GeneratedSubstitute:
    """Ask the AI for a substitute until one covers the original's Muscle Groups, at
    most ``MUSCLE_CHECK_ATTEMPTS`` times; nothing is written while trying."""

    for _ in range(MUSCLE_CHECK_ATTEMPTS):
        generated = generator.generate(request)
        if covers_original_muscle_groups(
            original_primary=request.original_primary_muscles,
            original_targeted=original_targeted,
            substitute_primary=generated.primary_muscles,
        ):
            return generated
    raise SubstituteMuscleMismatch(request.original_name)


__all__ = [
    "SessionNotFound",
    "PrescriptionNotFound",
    "SubstituteNotAvailable",
    "SubstituteMuscleMismatch",
    "NoPrescribedOriginal",
    "SessionPerformed",
    "SubstitutionSource",
    "SubstitutionOutcome",
    "HarderVariationSuggestion",
    "PositionedSuggestion",
    "substitute_exercise",
    "substitute_with_source",
    "restore_original",
    "ensure_editable",
    "harder_variation_suggestion",
    "harder_variation_suggestions",
]
