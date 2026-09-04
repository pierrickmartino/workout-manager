"""The Deploy pipeline (CONTEXT §Deploy, ADR-0020/0021).

Deploy is the atomic commit of a Builder edit — the whole staged reshaping of a
Protocol's **un-performed tail** validated and written in one call, or rejected
whole with nothing persisted. This module is the orchestrator that sequences the
three pure pieces the edit needs — validation (Module B, ``deploy_validation``),
re-enumeration (Module A, ``reenumeration``), and persistence (Module F, the
``ProtocolRepository``) — behind one seam, so the workflow the endpoint used to
inline has a home and a test surface.

It is layered like ``protocols/progress.py``: a **pure** planning tier
(``plan_deploy``) validates the desired tail and folds it over an already-loaded
``ProtocolProgressView``, doing no I/O and importing only the two pure Modules A/B;
and a thin **service** tier (``deploy_protocol_tail``) resolves ownership, reads the
history once, plans, maps the plan to the repository's persist shape at the boundary,
and writes. The pure tier reads the performed prefix, the known-Session set, and each
edited Session's title straight off the ``ProtocolProgressView`` — never re-deriving
what the progress projection already computed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from app.domain.fitness_profile import is_sensitive
from app.protocols.deploy_validation import (
    DeployDraft,
    DeployError,
    DraftPrescription,
    validate_deploy,
)
from app.protocols.progress import (
    ProtocolProgressView,
    progressed_protocol,
    protocol_progress,
)
from app.protocols.reenumeration import (
    EnumeratedSession,
    TailSession,
    reenumerate_tail,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.profile_repository import ProfileRepository
from app.repositories.protocol_repository import (
    DeploySessionSpec,
    ProtocolRepository,
)
from app.repositories.session_repository import PrescriptionDraft


@dataclass(frozen=True)
class _DeployPayload:
    """The per-Session content carried through the re-enumeration fold as its opaque
    ``payload`` (Module A stays payload-generic): the Session's title — sourced from
    the progress view for an edited existing Session, ``None`` for a fresh slot — and
    the validated draft Prescriptions. A typed carrier so the service reads
    ``payload.title`` / ``payload.prescriptions`` rather than a positional tuple."""

    title: str | None
    prescriptions: list[DraftPrescription]


@dataclass(frozen=True)
class DeployPlan:
    """A validated, fully-enumerated tail ready to persist. ``tail`` is the desired
    Sessions re-enumerated after the frozen performed prefix (each an
    ``EnumeratedSession`` carrying a ``_DeployPayload``); ``performed_session_ids`` is
    the prefix the write must leave untouched. ``weeks`` / ``sessions_per_week`` are
    the plan's soft header (ADR-0020). Pure output — no repository types."""

    performed_session_ids: frozenset[int]
    tail: list[EnumeratedSession]
    weeks: int
    sessions_per_week: int


def plan_deploy(
    draft: DeployDraft,
    progress: ProtocolProgressView,
    *,
    exercise_exists,
    has_sensitive: bool,
) -> DeployPlan | list[DeployError]:
    """Validate the desired tail and fold it into an enumerated ``DeployPlan``.

    Reads the performed prefix, known-Session set, and per-Session titles off
    ``progress`` — the projection already computed them, so nothing is re-derived.
    Returns the typed ``DeployError`` list when the draft is invalid (persist nothing),
    or a ``DeployPlan`` whose tail is re-enumerated after the frozen prefix. Pure: no
    I/O; ``exercise_exists`` is injected so the shared catalog is never imported here.
    """

    performed = set(progress.performed_session_ids)
    known = {session.session_id for session in progress.protocol.sessions}

    errors = validate_deploy(
        draft,
        performed_session_ids=performed,
        known_session_ids=known,
        exercise_exists=exercise_exists,
        has_sensitive_constraint=has_sensitive,
    )
    if errors:
        return errors

    titles = {
        session.session_id: session.title for session in progress.protocol.sessions
    }
    prefix = [
        EnumeratedSession(
            session_id=session.session_id,
            position=session.position,
            week=session.week,
            day=session.day,
        )
        for session in progress.protocol.sessions
        if session.session_id in performed
    ]
    tail_input = [
        TailSession(
            session_id=session.session_id,
            week=session.week,
            day=session.day,
            payload=_DeployPayload(
                title=titles.get(session.session_id),
                prescriptions=list(session.prescriptions),
            ),
        )
        for session in draft.sessions
    ]

    enumerated = reenumerate_tail(prefix, tail_input)
    return DeployPlan(
        performed_session_ids=frozenset(performed),
        tail=enumerated[len(prefix) :],
        weeks=draft.weeks,
        sessions_per_week=draft.sessions_per_week,
    )


class DeployStatus(Enum):
    """The three outcomes of a deploy, discriminating the ``DeployResult``."""

    NOT_FOUND = "not_found"
    REJECTED = "rejected"
    DEPLOYED = "deployed"


@dataclass(frozen=True)
class DeployResult:
    """The outcome of ``deploy_protocol_tail``, so the route maps one value to
    ``404`` / ``422`` / ``200`` without pattern-matching on a bare list. Exactly the
    field for the ``status`` is populated: ``errors`` on ``REJECTED``, ``view`` on
    ``DEPLOYED``, neither on ``NOT_FOUND``."""

    status: DeployStatus
    errors: list[DeployError] = field(default_factory=list)
    view: ProtocolProgressView | None = None

    @classmethod
    def not_found(cls) -> DeployResult:
        return cls(status=DeployStatus.NOT_FOUND)

    @classmethod
    def rejected(cls, errors: list[DeployError]) -> DeployResult:
        return cls(status=DeployStatus.REJECTED, errors=errors)

    @classmethod
    def deployed(cls, view: ProtocolProgressView) -> DeployResult:
        return cls(status=DeployStatus.DEPLOYED, view=view)


def _persist_spec(session: EnumeratedSession) -> DeploySessionSpec:
    """Map one enumerated Session to the repository's persist shape — the single
    place the pure plan crosses into repository types, at the write boundary."""

    payload: _DeployPayload = session.payload
    return DeploySessionSpec(
        position=session.position,
        week=session.week,
        day=session.day,
        title=payload.title,
        prescriptions=[
            PrescriptionDraft(
                exercise_id=prescription.exercise_id,
                sets=prescription.sets,
                reps=prescription.reps,
                rest_seconds=prescription.rest_seconds,
                tempo=prescription.tempo,
                recommended_load=prescription.recommended_load,
                superset_group=prescription.superset_group,
                round_rest_seconds=prescription.round_rest_seconds,
                scheme=prescription.scheme,
                set_type=prescription.set_type,
                target_effort=prescription.target_effort,
                note=prescription.note,
            )
            for prescription in payload.prescriptions
        ],
    )


def deploy_protocol_tail(
    clerk_user_id: str,
    protocol_id: int,
    draft: DeployDraft,
    name: str | None,
    *,
    protocols: ProtocolRepository,
    logged: LoggedSessionRepository,
    exercises: ExerciseRepository,
    profiles: ProfileRepository,
) -> DeployResult:
    """Validate the desired tail and, on success, replace it in place (the service
    tier). Resolves ownership and reads the history once via ``protocol_progress``;
    a missing or non-owned Protocol yields ``not_found``. Delegates the whole fold to
    the pure ``plan_deploy`` (errors → ``rejected``, nothing persisted), then maps the
    plan to the repository's persist shape and writes it, returning the re-read
    progressed view (``deployed``). ``name`` follows the Builder's config panel
    (ADR-0021): an explicit ``None`` clears it to the derived label.

    A user with any Sensitive Constraint is never handed a Superset at deploy
    (ADR-0023); the flag is derived from the stored profile, never trusted from the
    client, and threaded into the pure validator.
    """

    progress = protocol_progress(
        clerk_user_id, protocol_id, protocols=protocols, logged=logged
    )
    if progress is None:
        return DeployResult.not_found()

    profile = profiles.get_or_create(clerk_user_id)
    plan = plan_deploy(
        draft,
        progress,
        exercise_exists=lambda exercise_id: exercises.get(exercise_id) is not None,
        has_sensitive=is_sensitive(profile),
    )
    if isinstance(plan, list):
        return DeployResult.rejected(plan)

    protocols.deploy_tail(
        protocol_id,
        clerk_user_id,
        performed_session_ids=set(plan.performed_session_ids),
        tail=[_persist_spec(session) for session in plan.tail],
        weeks=plan.weeks,
        sessions_per_week=plan.sessions_per_week,
        name=name,
    )

    updated = progressed_protocol(
        clerk_user_id, protocol_id, protocols=protocols, logged=logged
    )
    return DeployResult.deployed(updated)


__all__ = [
    "DeployPlan",
    "DeployResult",
    "DeployStatus",
    "deploy_protocol_tail",
    "plan_deploy",
]
