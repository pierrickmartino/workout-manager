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
from typing import Protocol as Interface

from sqlmodel import Session, select

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
class ProtocolDraft:
    """A multi-week Protocol to persist: the parameter set plus ordered Sessions."""

    training_type: str
    objective: str
    sessions_per_week: int
    weeks: int
    duration_minutes: int
    sessions: list[ProtocolSessionDraft] = field(default_factory=list)


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


class ProtocolRepository(Interface):
    def create(self, clerk_user_id: str, draft: ProtocolDraft) -> ProtocolView:
        """Persist ``draft`` as a Protocol owned by ``clerk_user_id`` and return it
        joined to its ordered Sessions, prescriptions, and catalog Exercises."""
        ...

    def get(self, protocol_id: int, clerk_user_id: str) -> ProtocolView | None:
        """Return the owner's Protocol by id, or ``None`` if it is missing or owned
        by another user."""
        ...

    def list_for_user(self, clerk_user_id: str) -> list[ProtocolView]:
        """Return the user's Protocols ordered by adoption recency (most recent
        first). Owner-scoped: never returns another user's Protocol. Empty when the
        user owns none."""
        ...

    def replace_tail(
        self,
        protocol_id: int,
        clerk_user_id: str,
        *,
        session_prescriptions: dict[int, list[PrescriptionDraft]],
    ) -> ProtocolView | None:
        """Atomically replace the Prescriptions of the named un-performed Sessions
        (Module F, ADR-0020).

        ``session_prescriptions`` maps a Session id to its new ordered
        Prescriptions; each named Session's Prescriptions are deleted and re-inserted
        in place, with contiguous positions, while the Session row itself (its id,
        Week/Day, position) and every Session *not* named — the frozen performed
        prefix among them — is left untouched. The whole rewrite commits in one
        transaction, so a failure persists nothing. Owner-scoped: returns the updated
        Protocol, or ``None`` if it is missing or owned by another user. A named id
        that is not one of this Protocol's Sessions is ignored."""
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
        )
        self._session.add(protocol)
        self._session.commit()
        self._session.refresh(protocol)

        for position, session_draft in enumerate(draft.sessions):
            workout = WorkoutSession(
                clerk_user_id=clerk_user_id,
                training_type=draft.training_type,
                duration_minutes=draft.duration_minutes,
                protocol_id=protocol.id,
                objective=draft.objective,
                week=session_draft.week,
                day=session_draft.day,
                position=position,
                title=session_draft.title,
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
                    )
                )
            self._session.commit()
        return self._view(protocol)

    def get(self, protocol_id: int, clerk_user_id: str) -> ProtocolView | None:
        protocol = self._session.get(Protocol, protocol_id)
        if protocol is None or protocol.clerk_user_id != clerk_user_id:
            return None
        return self._view(protocol)

    def list_for_user(self, clerk_user_id: str) -> list[ProtocolView]:
        protocols = self._session.exec(
            select(Protocol)
            .where(Protocol.clerk_user_id == clerk_user_id)
            .order_by(Protocol.created_at.desc(), Protocol.id.desc())
        ).all()
        return [self._view(protocol) for protocol in protocols]

    def replace_tail(
        self,
        protocol_id: int,
        clerk_user_id: str,
        *,
        session_prescriptions: dict[int, list[PrescriptionDraft]],
    ) -> ProtocolView | None:
        protocol = self._session.get(Protocol, protocol_id)
        if protocol is None or protocol.clerk_user_id != clerk_user_id:
            return None

        workouts = self._session.exec(
            select(WorkoutSession).where(WorkoutSession.protocol_id == protocol_id)
        ).all()
        by_id = {workout.id: workout for workout in workouts}

        # Stage every delete and insert, then commit once — the whole tail replace is
        # a single transaction, so a mid-way failure leaves the Protocol untouched.
        for session_id, prescriptions in session_prescriptions.items():
            if session_id not in by_id:
                continue
            current = self._session.exec(
                select(ExercisePrescription).where(
                    ExercisePrescription.session_id == session_id
                )
            ).all()
            for prescription in current:
                self._session.delete(prescription)
            for position, draft in enumerate(prescriptions):
                self._session.add(
                    ExercisePrescription(
                        session_id=session_id,
                        exercise_id=draft.exercise_id,
                        position=position,
                        sets=draft.sets,
                        reps=draft.reps,
                        rest_seconds=draft.rest_seconds,
                        tempo=draft.tempo,
                        recommended_load=draft.recommended_load,
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
                protocol_id=protocol.id,
                objective=draft.objective,
                week=session_draft.week,
                day=session_draft.day,
                position=position,
                title=session_draft.title,
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
                )
                for p_position, prescription in enumerate(session_draft.prescriptions)
            ]
        return self._view(protocol)

    def get(self, protocol_id: int, clerk_user_id: str) -> ProtocolView | None:
        protocol = self._protocols.get(protocol_id)
        if protocol is None or protocol.clerk_user_id != clerk_user_id:
            return None
        return self._view(protocol)

    def list_for_user(self, clerk_user_id: str) -> list[ProtocolView]:
        owned = [
            protocol
            for protocol in self._protocols.values()
            if protocol.clerk_user_id == clerk_user_id
        ]
        owned.sort(key=lambda p: (p.created_at, p.id), reverse=True)
        return [self._view(protocol) for protocol in owned]

    def replace_tail(
        self,
        protocol_id: int,
        clerk_user_id: str,
        *,
        session_prescriptions: dict[int, list[PrescriptionDraft]],
    ) -> ProtocolView | None:
        protocol = self._protocols.get(protocol_id)
        if protocol is None or protocol.clerk_user_id != clerk_user_id:
            return None

        session_ids = {w.id for w in self._sessions.get(protocol_id, [])}
        for session_id, prescriptions in session_prescriptions.items():
            if session_id not in session_ids:
                continue
            self._prescriptions[session_id] = [
                ExercisePrescription(
                    id=position + 1,
                    session_id=session_id,
                    exercise_id=draft.exercise_id,
                    position=position,
                    sets=draft.sets,
                    reps=draft.reps,
                    rest_seconds=draft.rest_seconds,
                    tempo=draft.tempo,
                    recommended_load=draft.recommended_load,
                )
                for position, draft in enumerate(prescriptions)
            ]
        return self._view(protocol)


__all__ = [
    "ProtocolSessionDraft",
    "ProtocolDraft",
    "ProtocolSessionView",
    "ProtocolView",
    "ProtocolRepository",
    "SqlProtocolRepository",
    "InMemoryProtocolRepository",
]
