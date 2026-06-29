"""Repository for Logged Sessions and their Logged Sets — the *record* side.

Writes take a ``LoggedSessionDraft`` (the performed Session id and date plus an
ordered list of ``LoggedSetDraft``, each referencing a catalog Exercise by id).
Reads return a ``LoggedSessionView`` — the logged session joined to its ordered
sets (each with its Exercise's name) and the prescribing Session's training type
— so consumers never touch the ORM. Reads are scoped to the owning user, and
``list_for_user`` returns the user's history newest-first. SQLModel-backed and
in-memory implementations honor the same contract."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Protocol

from sqlmodel import Session, select

from app.db.models import Exercise, LoggedSession, LoggedSet, WorkoutSession
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.session_repository import SessionRepository


@dataclass(frozen=True)
class LoggedSetDraft:
    """One actual set to record, referencing the catalog Exercise performed."""

    exercise_id: int
    reps: int
    load: str | None = None
    perceived_difficulty: int | None = None


@dataclass(frozen=True)
class LoggedSessionDraft:
    """A performance to record: which Session, on what date, and the sets done."""

    session_id: int
    performed_on: date
    logged_sets: list[LoggedSetDraft] = field(default_factory=list)


@dataclass(frozen=True)
class LoggedSetView:
    """A logged set joined to its catalog Exercise, ready to serialize."""

    position: int
    reps: int
    load: str | None
    perceived_difficulty: int | None
    exercise_id: int
    exercise_name: str


@dataclass(frozen=True)
class LoggedSessionView:
    """A Logged Session with its ordered sets and the parent's training type."""

    id: int
    clerk_user_id: str
    session_id: int
    training_type: str
    performed_on: date
    logged_sets: list[LoggedSetView]


class LoggedSessionRepository(Protocol):
    def create(
        self, clerk_user_id: str, draft: LoggedSessionDraft
    ) -> LoggedSessionView:
        """Persist ``draft`` as a Logged Session owned by ``clerk_user_id`` and
        return it joined to its sets and the prescribing Session's training type."""
        ...

    def get(
        self, logged_session_id: int, clerk_user_id: str
    ) -> LoggedSessionView | None:
        """Return the owner's Logged Session by id, or ``None`` if it is missing or
        owned by another user."""
        ...

    def list_for_user(self, clerk_user_id: str) -> list[LoggedSessionView]:
        """Return the user's Logged Sessions, most recently performed first."""
        ...


def _set_view(logged_set: LoggedSet, exercise: Exercise) -> LoggedSetView:
    return LoggedSetView(
        position=logged_set.position,
        reps=logged_set.reps,
        load=logged_set.load,
        perceived_difficulty=logged_set.perceived_difficulty,
        exercise_id=exercise.id,
        exercise_name=exercise.name,
    )


class SqlLoggedSessionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def _training_type(self, session_id: int) -> str:
        workout = self._session.get(WorkoutSession, session_id)
        return workout.training_type if workout is not None else ""

    def _view(self, logged: LoggedSession) -> LoggedSessionView:
        sets = self._session.exec(
            select(LoggedSet)
            .where(LoggedSet.logged_session_id == logged.id)
            .order_by(LoggedSet.position)
        ).all()
        views = [_set_view(s, self._session.get(Exercise, s.exercise_id)) for s in sets]
        return LoggedSessionView(
            id=logged.id,
            clerk_user_id=logged.clerk_user_id,
            session_id=logged.session_id,
            training_type=self._training_type(logged.session_id),
            performed_on=logged.performed_on,
            logged_sets=views,
        )

    def create(
        self, clerk_user_id: str, draft: LoggedSessionDraft
    ) -> LoggedSessionView:
        logged = LoggedSession(
            clerk_user_id=clerk_user_id,
            session_id=draft.session_id,
            performed_on=draft.performed_on,
        )
        self._session.add(logged)
        self._session.commit()
        self._session.refresh(logged)

        for position, logged_set in enumerate(draft.logged_sets):
            self._session.add(
                LoggedSet(
                    logged_session_id=logged.id,
                    exercise_id=logged_set.exercise_id,
                    position=position,
                    reps=logged_set.reps,
                    load=logged_set.load,
                    perceived_difficulty=logged_set.perceived_difficulty,
                )
            )
        self._session.commit()
        return self._view(logged)

    def get(
        self, logged_session_id: int, clerk_user_id: str
    ) -> LoggedSessionView | None:
        logged = self._session.get(LoggedSession, logged_session_id)
        if logged is None or logged.clerk_user_id != clerk_user_id:
            return None
        return self._view(logged)

    def list_for_user(self, clerk_user_id: str) -> list[LoggedSessionView]:
        rows = self._session.exec(
            select(LoggedSession)
            .where(LoggedSession.clerk_user_id == clerk_user_id)
            .order_by(LoggedSession.performed_on.desc(), LoggedSession.id.desc())
        ).all()
        return [self._view(logged) for logged in rows]


class InMemoryLoggedSessionRepository:
    def __init__(
        self, sessions: SessionRepository, exercises: ExerciseRepository
    ) -> None:
        self._sessions = sessions
        self._exercises = exercises
        self._logged: dict[int, LoggedSession] = {}
        self._sets: dict[int, list[LoggedSet]] = {}
        self._next_id = 1

    def _training_type(self, session_id: int, clerk_user_id: str) -> str:
        session_view = self._sessions.get(session_id, clerk_user_id)
        return session_view.training_type if session_view is not None else ""

    def _view(self, logged: LoggedSession) -> LoggedSessionView:
        sets = self._sets.get(logged.id, [])
        views = [
            _set_view(s, self._exercises.get(s.exercise_id))
            for s in sorted(sets, key=lambda s: s.position)
        ]
        return LoggedSessionView(
            id=logged.id,
            clerk_user_id=logged.clerk_user_id,
            session_id=logged.session_id,
            training_type=self._training_type(logged.session_id, logged.clerk_user_id),
            performed_on=logged.performed_on,
            logged_sets=views,
        )

    def create(
        self, clerk_user_id: str, draft: LoggedSessionDraft
    ) -> LoggedSessionView:
        logged = LoggedSession(
            id=self._next_id,
            clerk_user_id=clerk_user_id,
            session_id=draft.session_id,
            performed_on=draft.performed_on,
        )
        self._next_id += 1
        self._logged[logged.id] = logged
        self._sets[logged.id] = [
            LoggedSet(
                id=position + 1,
                logged_session_id=logged.id,
                exercise_id=logged_set.exercise_id,
                position=position,
                reps=logged_set.reps,
                load=logged_set.load,
                perceived_difficulty=logged_set.perceived_difficulty,
            )
            for position, logged_set in enumerate(draft.logged_sets)
        ]
        return self._view(logged)

    def get(
        self, logged_session_id: int, clerk_user_id: str
    ) -> LoggedSessionView | None:
        logged = self._logged.get(logged_session_id)
        if logged is None or logged.clerk_user_id != clerk_user_id:
            return None
        return self._view(logged)

    def list_for_user(self, clerk_user_id: str) -> list[LoggedSessionView]:
        owned = [
            logged
            for logged in self._logged.values()
            if logged.clerk_user_id == clerk_user_id
        ]
        owned.sort(key=lambda logged: (logged.performed_on, logged.id), reverse=True)
        return [self._view(logged) for logged in owned]


__all__ = [
    "LoggedSetDraft",
    "LoggedSessionDraft",
    "LoggedSetView",
    "LoggedSessionView",
    "LoggedSessionRepository",
    "SqlLoggedSessionRepository",
    "InMemoryLoggedSessionRepository",
]
