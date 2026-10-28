"""Equipment Substitution: substitute every Exercise the stated equipment blocks (ADR-0143).

``preview_equipment_substitution`` lists the Session's blocked Exercise Prescriptions with
the catalog substitute each would resolve to, or a marker that it needs generation. It makes
no AI call and writes nothing. ``apply_equipment_substitution`` runs the existing
Substitution once per selected position, each independently: one row's failure keeps that
row's original and is reported, while the others still land. Both touch only this Session,
never the Fitness Profile, and both are refused on a performed Protocol Session."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from enum import Enum

from app.domain.equipment_substitution import is_blocked
from app.domain.substitution import SubstitutionContext, resolve_substitute
from app.generation.llm.port import GenerationError
from app.generation.substitute_generator import SubstituteGenerator
from app.repositories.exercise_relationship_repository import (
    ExerciseRelationshipRepository,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.profile_repository import ProfileRepository
from app.repositories.session_repository import (
    PrescriptionView,
    SessionRepository,
    SessionView,
)
from app.substitution.service import (
    SessionNotFound,
    SubstituteMuscleMismatch,
    SubstitutionSource,
    ensure_editable,
    substitute_candidate,
    substitute_with_source,
    substitution_context,
)

# The user-facing reason a row is flagged when no substitute could be found for it.
NO_ALTERNATIVE_REASON = "No alternative found for this equipment."


class PositionsNotBlocked(Exception):
    """Apply named a position that is out of range or not blocked by the Available
    Equipment; rejected before any Substitution runs."""

    def __init__(self, positions: Sequence[int]) -> None:
        super().__init__(positions)
        self.positions = tuple(positions)


@dataclass(frozen=True)
class CatalogSubstitute:
    exercise_id: int
    name: str


@dataclass(frozen=True)
class BlockedPrescription:
    """One preview row: a blocked prescription and what would replace it. ``substitute``
    is ``None`` when no compatible catalog link exists, so the AI would invent one."""

    position: int
    exercise_id: int
    exercise_name: str
    substitute: CatalogSubstitute | None

    @property
    def needs_generation(self) -> bool:
        return self.substitute is None


class OutcomeStatus(str, Enum):
    SUBSTITUTED = "substituted"
    FAILED = "failed"


@dataclass(frozen=True)
class PositionOutcome:
    """What happened to one selected position: substituted (from the catalog or
    generated), or failed with a user-facing reason and its original kept."""

    position: int
    status: OutcomeStatus
    source: SubstitutionSource | None = None
    reason: str | None = None


@dataclass(frozen=True)
class EquipmentSubstitutionResult:
    session: SessionView
    outcomes: tuple[PositionOutcome, ...]


def _editable_view(
    session_id: int,
    clerk_user_id: str,
    sessions: SessionRepository,
    logged: LoggedSessionRepository,
) -> SessionView:
    view = sessions.get(session_id, clerk_user_id)
    if view is None:
        raise SessionNotFound(session_id)
    ensure_editable(view, clerk_user_id, logged)
    return view


def _blocked(
    view: SessionView, context: SubstitutionContext
) -> tuple[PrescriptionView, ...]:
    return tuple(
        prescription
        for prescription in view.prescriptions
        if is_blocked(prescription.required_equipment, context.available_equipment)
    )


def _preview_row(
    prescription: PrescriptionView,
    context: SubstitutionContext,
    relationships: ExerciseRelationshipRepository,
) -> BlockedPrescription:
    candidates = [
        substitute_candidate(related)
        for related in relationships.substitutes_for(prescription.exercise_id)
    ]
    resolution = resolve_substitute(candidates, context)
    substitute = (
        None
        if resolution.candidate is None
        else CatalogSubstitute(
            exercise_id=resolution.candidate.exercise_id,
            name=resolution.candidate.name,
        )
    )
    return BlockedPrescription(
        position=prescription.position,
        exercise_id=prescription.exercise_id,
        exercise_name=prescription.exercise_name,
        substitute=substitute,
    )


def preview_equipment_substitution(
    session_id: int,
    clerk_user_id: str,
    *,
    available_equipment: Sequence[str] | None = None,
    relationships: ExerciseRelationshipRepository,
    sessions: SessionRepository,
    profiles: ProfileRepository,
    logged: LoggedSessionRepository,
) -> tuple[BlockedPrescription, ...]:
    """Every prescription the Available Equipment blocks, in Session order, with its
    catalog substitute or a needs-generation marker. Read-only and AI-free.

    ``available_equipment`` omitted inherits the Default Equipment; an empty list is
    bodyweight only (ADR-0038). Raises ``SessionNotFound`` / ``SessionPerformed``."""

    view = _editable_view(session_id, clerk_user_id, sessions, logged)
    # A read-only lookup: the preview writes nothing, not even a first Profile row.
    context = substitution_context(
        profiles.find(clerk_user_id), view.training_type, available_equipment
    )
    return tuple(
        _preview_row(prescription, context, relationships)
        for prescription in _blocked(view, context)
    )


def _substitute_one(
    position: int, substitute_position: Callable[[int], SubstitutionSource]
) -> PositionOutcome:
    try:
        source = substitute_position(position)
    except (GenerationError, SubstituteMuscleMismatch):
        return PositionOutcome(
            position=position,
            status=OutcomeStatus.FAILED,
            reason=NO_ALTERNATIVE_REASON,
        )
    return PositionOutcome(
        position=position, status=OutcomeStatus.SUBSTITUTED, source=source
    )


def apply_equipment_substitution(
    session_id: int,
    clerk_user_id: str,
    positions: Sequence[int],
    *,
    available_equipment: Sequence[str] | None = None,
    relationships: ExerciseRelationshipRepository,
    exercises: ExerciseRepository,
    sessions: SessionRepository,
    profiles: ProfileRepository,
    generator: SubstituteGenerator,
    logged: LoggedSessionRepository,
) -> EquipmentSubstitutionResult:
    """Substitute each selected blocked position independently and report per position.

    Every position must be blocked by the Available Equipment, else
    ``PositionsNotBlocked`` is raised before anything runs. Each Substitution is the
    single-exercise one (Load re-expressed, Prescribed Original kept, Superset grouping
    and constraints honoured); an AI failure on one row keeps that row's original and
    flags it while the other rows are persisted. Raises ``SessionNotFound`` /
    ``SessionPerformed`` with nothing persisted."""

    view = _editable_view(session_id, clerk_user_id, sessions, logged)
    context = substitution_context(
        profiles.get_or_create(clerk_user_id), view.training_type, available_equipment
    )
    blocked = {prescription.position for prescription in _blocked(view, context)}
    rejected = [position for position in positions if position not in blocked]
    if rejected:
        raise PositionsNotBlocked(rejected)

    def substitute_position(position: int) -> SubstitutionSource:
        return substitute_with_source(
            session_id,
            clerk_user_id,
            position,
            available_equipment=available_equipment,
            relationships=relationships,
            exercises=exercises,
            sessions=sessions,
            profiles=profiles,
            generator=generator,
            logged=logged,
        ).source

    outcomes = tuple(_substitute_one(position, substitute_position) for position in positions)
    updated = sessions.get(session_id, clerk_user_id)
    if updated is None:  # ownership checked above; defensive only
        raise SessionNotFound(session_id)
    return EquipmentSubstitutionResult(session=updated, outcomes=outcomes)


__all__ = [
    "NO_ALTERNATIVE_REASON",
    "PositionsNotBlocked",
    "CatalogSubstitute",
    "BlockedPrescription",
    "OutcomeStatus",
    "PositionOutcome",
    "EquipmentSubstitutionResult",
    "preview_equipment_substitution",
    "apply_equipment_substitution",
]
