"""Repository for user-owned multi-week Protocols (ADR-0001).

Writes take a ``ProtocolDraft`` (the full generation parameter set plus an ordered
list of ``ProtocolSessionDraft``, each a Week/Day Session carrying its prescriptions
by catalog-Exercise id). Reads return a ``ProtocolView`` — the Protocol joined to its
fully-enumerated Sessions, ordered by ``position``, each Session joined to its
ordered prescriptions and their catalog Exercises — so consumers never touch the
ORM. Reads are owner-scoped: a Protocol belongs to one user and is never served to
another. SQLModel-backed and in-memory implementations honor the same contract."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol as Interface

from sqlmodel import Session, select

# Sentinel distinguishing "leave the Protocol name unchanged" (the default) from an
# explicit ``name=None`` that clears it back to the derived label (F4 Slice 5).
_KEEP_NAME: Any = object()

from app.db.models import Exercise, ExercisePrescription, Protocol, WorkoutSession
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.session_repository import (
    PrescriptionDraft,
    PrescriptionView,
    _prescription_view,
)


@dataclass(frozen=True)
class ProtocolSessionDraft:
    """One Week/Day Session to persist within a Protocol, with its prescriptions."""

    week: int
    day: int
    prescriptions: list[PrescriptionDraft] = field(default_factory=list)
    title: str | None = None


@dataclass(frozen=True)
class DeploySessionSpec:
    """One fully-enumerated Session in the new un-performed tail a ``DEPLOY`` writes
    (Module F, ADR-0020). ``position``/``week``/``day`` come from the re-enumeration
    (Module A) and are persisted verbatim; ``title`` is carried through for an edited
    existing Session and ``None`` for a fresh empty slot."""

    position: int
    week: int
    day: int
    prescriptions: list[PrescriptionDraft] = field(default_factory=list)
    title: str | None = None


@dataclass(frozen=True)
class ProtocolDraft:
    """A multi-week Protocol to persist: the parameter set plus ordered Sessions."""

    training_type: str
    objective: str
    sessions_per_week: int
    weeks: int
    duration_minutes: int
    sessions: list[ProtocolSessionDraft] = field(default_factory=list)
    # The user-editable Protocol name (ADR-0021). ``None`` for a freshly adopted
    # Protocol — read paths fall back to the derived ``objective · training_type``.
    name: str | None = None
    # Operational AI-usage lineage (ADR-0039, #274): the originating Generation Call's
    # trace id, deep-copied from the Generated artifact onto the Protocol and seeded onto
    # each of its Sessions at creation. ``None`` when no monitoring backend was configured.
    trace_id: str | None = None


@dataclass(frozen=True)
class ProtocolSessionView:
    """One Protocol Session: its Week/Day position and joined prescriptions."""

    session_id: int
    position: int
    week: int
    day: int
    title: str | None
    prescriptions: list[PrescriptionView]


@dataclass(frozen=True)
class ProtocolView:
    """A Protocol with its fully-enumerated Sessions in self-paced order."""

    id: int
    clerk_user_id: str
    training_type: str
    objective: str
    sessions_per_week: int
    weeks: int
    duration_minutes: int
    sessions: list[ProtocolSessionView]
    # The user-editable name, or ``None`` when unnamed — resolved to a display label
    # (with the derived fallback) by ``app.domain.protocol.protocol_label``.
    name: str | None = None


class ProtocolRepository(Interface):
    def create(self, clerk_user_id: str, draft: ProtocolDraft) -> ProtocolView:
        """Persist ``draft`` as a Protocol owned by ``clerk_user_id`` and return it
        joined to its ordered Sessions, prescriptions, and catalog Exercises."""
        ...

    def get(self, protocol_id: int, clerk_user_id: str) -> ProtocolView | None:
        """Return the owner's Protocol by id, or ``None`` if it is missing or owned
        by another user."""
        ...

    def trace_id(self, protocol_id: int, clerk_user_id: str) -> str | None:
        """Return the owner's Protocol's AI-usage trace-id lineage (ADR-0039, #274).

        Operator-only, deliberately kept off ``ProtocolView`` so it never reaches the
        PWA; the seam a later Generation-Feedback push reads. ``None`` when the Protocol
        is missing/unowned or carries no trace id."""
        ...

    def list_for_user(self, clerk_user_id: str) -> list[ProtocolView]:
        """Return the user's Protocols ordered by adoption recency (most recent
        first). Owner-scoped: never returns another user's Protocol. Empty when the
        user owns none."""
        ...

    def deploy_tail(
        self,
        protocol_id: int,
        clerk_user_id: str,
        *,
        performed_session_ids: set[int],
        tail: list[DeploySessionSpec],
        weeks: int,
        sessions_per_week: int,
        name: str | None = _KEEP_NAME,
    ) -> ProtocolView | None:
        """Atomically replace the whole un-performed tail of a Protocol (Module F,
        ADR-0020) and reshape it.

        Every Session *not* in ``performed_session_ids`` — the editable tail — and its
        Prescriptions are deleted, and ``tail`` (the re-enumerated desired Sessions,
        each carrying its ``position``/``week``/``day`` from Module A) is inserted in
        its place, so Sessions can be added, removed, and re-enumerated in one write.
        The frozen performed Sessions are left byte-for-byte untouched, keeping their
        ids, so history/PRs/Progression can never be orphaned. ``weeks`` and
        ``sessions_per_week`` (the soft header, ADR-0020) are updated on the Protocol,
        and ``name`` is set when supplied (an explicit ``None`` clears it to the derived
        label; omitted leaves it as-is). The whole rewrite commits in one transaction,
        so a failure persists nothing. Owner-scoped: returns the updated Protocol, or
        ``None`` if it is missing or owned by another user."""
        ...


class SqlProtocolRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def _session_view(self, workout: WorkoutSession) -> ProtocolSessionView:
        prescriptions = self._session.exec(
            select(ExercisePrescription)
            .where(ExercisePrescription.session_id == workout.id)
            .order_by(ExercisePrescription.position)
        ).all()
        views = [
            _prescription_view(p, self._session.get(Exercise, p.exercise_id))
            for p in prescriptions
        ]
        return ProtocolSessionView(
            session_id=workout.id,
            position=workout.position,
            week=workout.week,
            day=workout.day,
            title=workout.title,
            prescriptions=views,
        )

    def _view(self, protocol: Protocol) -> ProtocolView:
        workouts = self._session.exec(
            select(WorkoutSession)
            .where(WorkoutSession.protocol_id == protocol.id)
            .order_by(WorkoutSession.position)
        ).all()
        return ProtocolView(
            id=protocol.id,
            clerk_user_id=protocol.clerk_user_id,
            training_type=protocol.training_type,
            objective=protocol.objective,
            sessions_per_week=protocol.sessions_per_week,
            weeks=protocol.weeks,
            duration_minutes=protocol.duration_minutes,
            name=protocol.name,
            sessions=[self._session_view(w) for w in workouts],
        )

    def create(self, clerk_user_id: str, draft: ProtocolDraft) -> ProtocolView:
        protocol = Protocol(
            clerk_user_id=clerk_user_id,
            training_type=draft.training_type,
            objective=draft.objective,
            sessions_per_week=draft.sessions_per_week,
            weeks=draft.weeks,
            duration_minutes=draft.duration_minutes,
            name=draft.name,
            trace_id=draft.trace_id,
        )
        self._session.add(protocol)
        self._session.commit()
        self._session.refresh(protocol)

        for position, session_draft in enumerate(draft.sessions):
            workout = WorkoutSession(
                clerk_user_id=clerk_user_id,
                training_type=draft.training_type,
                duration_minutes=draft.duration_minutes,
                # Author stamped with the adopting/deploying user (CONTEXT: Author, #395):
                # a Protocol-member Session attributes to whoever created it here.
                author_clerk_user_id=clerk_user_id,
                protocol_id=protocol.id,
                objective=draft.objective,
                week=session_draft.week,
                day=session_draft.day,
                position=position,
                title=session_draft.title,
                # Seed each Session's lineage with the originating Protocol call (#274);
                # Regeneration re-stamps the individual Session later.
                trace_id=draft.trace_id,
            )
            self._session.add(workout)
            self._session.commit()
            self._session.refresh(workout)

            for p_position, prescription in enumerate(session_draft.prescriptions):
                self._session.add(
                    ExercisePrescription(
                        session_id=workout.id,
                        exercise_id=prescription.exercise_id,
                        position=p_position,
                        sets=prescription.sets,
                        reps=prescription.reps,
                        rest_seconds=prescription.rest_seconds,
                        tempo=prescription.tempo,
                        recommended_load=prescription.recommended_load,
                        superset_group=prescription.superset_group,
                        round_rest_seconds=prescription.round_rest_seconds,
                        scheme=prescription.scheme,
                    )
                )
            self._session.commit()
        return self._view(protocol)

    def get(self, protocol_id: int, clerk_user_id: str) -> ProtocolView | None:
        protocol = self._session.get(Protocol, protocol_id)
        if protocol is None or protocol.clerk_user_id != clerk_user_id:
            return None
        return self._view(protocol)

    def trace_id(self, protocol_id: int, clerk_user_id: str) -> str | None:
        protocol = self._session.get(Protocol, protocol_id)
        if protocol is None or protocol.clerk_user_id != clerk_user_id:
            return None
        return protocol.trace_id

    def list_for_user(self, clerk_user_id: str) -> list[ProtocolView]:
        protocols = self._session.exec(
            select(Protocol)
            .where(Protocol.clerk_user_id == clerk_user_id)
            .order_by(Protocol.created_at.desc(), Protocol.id.desc())
        ).all()
        return [self._view(protocol) for protocol in protocols]

    def deploy_tail(
        self,
        protocol_id: int,
        clerk_user_id: str,
        *,
        performed_session_ids: set[int],
        tail: list[DeploySessionSpec],
        weeks: int,
        sessions_per_week: int,
        name: str | None = _KEEP_NAME,
    ) -> ProtocolView | None:
        protocol = self._session.get(Protocol, protocol_id)
        if protocol is None or protocol.clerk_user_id != clerk_user_id:
            return None

        if name is not _KEEP_NAME:
            protocol.name = name
        protocol.weeks = weeks
        protocol.sessions_per_week = sessions_per_week
        self._session.add(protocol)

        # Stage every delete and insert, then commit once — the whole tail replace is a
        # single transaction, so a mid-way failure leaves the Protocol untouched. The
        # performed prefix is skipped entirely: its rows keep their ids and content.
        workouts = self._session.exec(
            select(WorkoutSession).where(WorkoutSession.protocol_id == protocol_id)
        ).all()
        for workout in workouts:
            if workout.id in performed_session_ids:
                continue
            current = self._session.exec(
                select(ExercisePrescription).where(
                    ExercisePrescription.session_id == workout.id
                )
            ).all()
            for prescription in current:
                self._session.delete(prescription)
            self._session.delete(workout)
        # Free the deleted rows' positions before the inserts reuse them.
        self._session.flush()

        for spec in tail:
            workout = WorkoutSession(
                clerk_user_id=clerk_user_id,
                training_type=protocol.training_type,
                duration_minutes=protocol.duration_minutes,
                # Author stamped with the adopting/deploying user (CONTEXT: Author, #395):
                # a Protocol-member Session attributes to whoever created it here.
                author_clerk_user_id=clerk_user_id,
                protocol_id=protocol.id,
                objective=protocol.objective,
                week=spec.week,
                day=spec.day,
                position=spec.position,
                title=spec.title,
            )
            self._session.add(workout)
            self._session.flush()  # assign the new Session id without committing
            for position, draft in enumerate(spec.prescriptions):
                self._session.add(
                    ExercisePrescription(
                        session_id=workout.id,
                        exercise_id=draft.exercise_id,
                        position=position,
                        sets=draft.sets,
                        reps=draft.reps,
                        rest_seconds=draft.rest_seconds,
                        tempo=draft.tempo,
                        recommended_load=draft.recommended_load,
                        superset_group=draft.superset_group,
                        round_rest_seconds=draft.round_rest_seconds,
                        scheme=draft.scheme,
                    )
                )
        self._session.commit()
        return self._view(protocol)


class InMemoryProtocolRepository:
    def __init__(self, exercises: ExerciseRepository) -> None:
        self._exercises = exercises
        self._protocols: dict[int, Protocol] = {}
        self._sessions: dict[int, list[WorkoutSession]] = {}
        self._prescriptions: dict[int, list[ExercisePrescription]] = {}
        self._next_protocol_id = 1
        self._next_session_id = 1

    def _session_view(self, workout: WorkoutSession) -> ProtocolSessionView:
        prescriptions = sorted(
            self._prescriptions.get(workout.id, []), key=lambda p: p.position
        )
        views = [
            _prescription_view(p, self._exercises.get(p.exercise_id))
            for p in prescriptions
        ]
        return ProtocolSessionView(
            session_id=workout.id,
            position=workout.position,
            week=workout.week,
            day=workout.day,
            title=workout.title,
            prescriptions=views,
        )

    def _view(self, protocol: Protocol) -> ProtocolView:
        workouts = sorted(
            self._sessions.get(protocol.id, []), key=lambda w: w.position
        )
        return ProtocolView(
            id=protocol.id,
            clerk_user_id=protocol.clerk_user_id,
            training_type=protocol.training_type,
            objective=protocol.objective,
            sessions_per_week=protocol.sessions_per_week,
            weeks=protocol.weeks,
            duration_minutes=protocol.duration_minutes,
            name=protocol.name,
            sessions=[self._session_view(w) for w in workouts],
        )

    def create(self, clerk_user_id: str, draft: ProtocolDraft) -> ProtocolView:
        protocol = Protocol(
            id=self._next_protocol_id,
            clerk_user_id=clerk_user_id,
            training_type=draft.training_type,
            objective=draft.objective,
            sessions_per_week=draft.sessions_per_week,
            weeks=draft.weeks,
            duration_minutes=draft.duration_minutes,
            name=draft.name,
            trace_id=draft.trace_id,
        )
        self._next_protocol_id += 1
        self._protocols[protocol.id] = protocol
        self._sessions[protocol.id] = []

        for position, session_draft in enumerate(draft.sessions):
            workout = WorkoutSession(
                id=self._next_session_id,
                clerk_user_id=clerk_user_id,
                training_type=draft.training_type,
                duration_minutes=draft.duration_minutes,
                # Author stamped with the adopting/deploying user (CONTEXT: Author, #395):
                # a Protocol-member Session attributes to whoever created it here.
                author_clerk_user_id=clerk_user_id,
                protocol_id=protocol.id,
                objective=draft.objective,
                week=session_draft.week,
                day=session_draft.day,
                position=position,
                title=session_draft.title,
                # Seed each Session's lineage with the originating Protocol call (#274);
                # Regeneration re-stamps the individual Session later.
                trace_id=draft.trace_id,
            )
            self._next_session_id += 1
            self._sessions[protocol.id].append(workout)
            self._prescriptions[workout.id] = [
                ExercisePrescription(
                    id=p_position + 1,
                    session_id=workout.id,
                    exercise_id=prescription.exercise_id,
                    position=p_position,
                    sets=prescription.sets,
                    reps=prescription.reps,
                    rest_seconds=prescription.rest_seconds,
                    tempo=prescription.tempo,
                    recommended_load=prescription.recommended_load,
                    superset_group=prescription.superset_group,
                    round_rest_seconds=prescription.round_rest_seconds,
                    scheme=prescription.scheme,
                )
                for p_position, prescription in enumerate(session_draft.prescriptions)
            ]
        return self._view(protocol)

    def get(self, protocol_id: int, clerk_user_id: str) -> ProtocolView | None:
        protocol = self._protocols.get(protocol_id)
        if protocol is None or protocol.clerk_user_id != clerk_user_id:
            return None
        return self._view(protocol)

    def trace_id(self, protocol_id: int, clerk_user_id: str) -> str | None:
        protocol = self._protocols.get(protocol_id)
        if protocol is None or protocol.clerk_user_id != clerk_user_id:
            return None
        return protocol.trace_id

    def list_for_user(self, clerk_user_id: str) -> list[ProtocolView]:
        owned = [
            protocol
            for protocol in self._protocols.values()
            if protocol.clerk_user_id == clerk_user_id
        ]
        owned.sort(key=lambda p: (p.created_at, p.id), reverse=True)
        return [self._view(protocol) for protocol in owned]

    def deploy_tail(
        self,
        protocol_id: int,
        clerk_user_id: str,
        *,
        performed_session_ids: set[int],
        tail: list[DeploySessionSpec],
        weeks: int,
        sessions_per_week: int,
        name: str | None = _KEEP_NAME,
    ) -> ProtocolView | None:
        protocol = self._protocols.get(protocol_id)
        if protocol is None or protocol.clerk_user_id != clerk_user_id:
            return None

        if name is not _KEEP_NAME:
            protocol.name = name
        protocol.weeks = weeks
        protocol.sessions_per_week = sessions_per_week

        # Drop every un-performed Session (and its Prescriptions); the frozen performed
        # prefix is kept exactly as it was.
        kept: list[WorkoutSession] = []
        for workout in self._sessions.get(protocol_id, []):
            if workout.id in performed_session_ids:
                kept.append(workout)
            else:
                self._prescriptions.pop(workout.id, None)

        for spec in tail:
            workout = WorkoutSession(
                id=self._next_session_id,
                clerk_user_id=clerk_user_id,
                training_type=protocol.training_type,
                duration_minutes=protocol.duration_minutes,
                # Author stamped with the adopting/deploying user (CONTEXT: Author, #395):
                # a Protocol-member Session attributes to whoever created it here.
                author_clerk_user_id=clerk_user_id,
                protocol_id=protocol.id,
                objective=protocol.objective,
                week=spec.week,
                day=spec.day,
                position=spec.position,
                title=spec.title,
            )
            self._next_session_id += 1
            kept.append(workout)
            self._prescriptions[workout.id] = [
                ExercisePrescription(
                    id=position + 1,
                    session_id=workout.id,
                    exercise_id=draft.exercise_id,
                    position=position,
                    sets=draft.sets,
                    reps=draft.reps,
                    rest_seconds=draft.rest_seconds,
                    tempo=draft.tempo,
                    recommended_load=draft.recommended_load,
                    superset_group=draft.superset_group,
                    round_rest_seconds=draft.round_rest_seconds,
                    scheme=draft.scheme,
                )
                for position, draft in enumerate(spec.prescriptions)
            ]

        self._sessions[protocol_id] = kept
        return self._view(protocol)


__all__ = [
    "ProtocolSessionDraft",
    "DeploySessionSpec",
    "ProtocolDraft",
    "ProtocolSessionView",
    "ProtocolView",
    "ProtocolRepository",
    "SqlProtocolRepository",
    "InMemoryProtocolRepository",
]
