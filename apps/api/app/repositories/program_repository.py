"""Repository for user-owned multi-week Programs (ADR-0001).

Writes take a ``ProgramDraft`` (the full generation parameter set plus an ordered
list of ``ProgramSessionDraft``, each a Week/Day Session carrying its prescriptions
by catalog-Exercise id). Reads return a ``ProgramView`` — the Program joined to its
fully-enumerated Sessions, ordered by ``position``, each Session joined to its
ordered prescriptions and their catalog Exercises — so consumers never touch the
ORM. Reads are owner-scoped: a Program belongs to one user and is never served to
another. SQLModel-backed and in-memory implementations honor the same contract."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from sqlmodel import Session, select

from app.db.models import Exercise, ExercisePrescription, Program, WorkoutSession
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.session_repository import (
    PrescriptionDraft,
    PrescriptionView,
    _prescription_view,
)


@dataclass(frozen=True)
class ProgramSessionDraft:
    """One Week/Day Session to persist within a Program, with its prescriptions."""

    week: int
    day: int
    prescriptions: list[PrescriptionDraft] = field(default_factory=list)
    title: str | None = None


@dataclass(frozen=True)
class ProgramDraft:
    """A multi-week Program to persist: the parameter set plus ordered Sessions."""

    training_type: str
    objective: str
    sessions_per_week: int
    weeks: int
    duration_minutes: int
    sessions: list[ProgramSessionDraft] = field(default_factory=list)


@dataclass(frozen=True)
class ProgramSessionView:
    """One Program Session: its Week/Day position and joined prescriptions."""

    session_id: int
    position: int
    week: int
    day: int
    title: str | None
    prescriptions: list[PrescriptionView]


@dataclass(frozen=True)
class ProgramView:
    """A Program with its fully-enumerated Sessions in self-paced order."""

    id: int
    clerk_user_id: str
    training_type: str
    objective: str
    sessions_per_week: int
    weeks: int
    duration_minutes: int
    sessions: list[ProgramSessionView]


class ProgramRepository(Protocol):
    def create(self, clerk_user_id: str, draft: ProgramDraft) -> ProgramView:
        """Persist ``draft`` as a Program owned by ``clerk_user_id`` and return it
        joined to its ordered Sessions, prescriptions, and catalog Exercises."""
        ...

    def get(self, program_id: int, clerk_user_id: str) -> ProgramView | None:
        """Return the owner's Program by id, or ``None`` if it is missing or owned
        by another user."""
        ...


class SqlProgramRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def _session_view(self, workout: WorkoutSession) -> ProgramSessionView:
        prescriptions = self._session.exec(
            select(ExercisePrescription)
            .where(ExercisePrescription.session_id == workout.id)
            .order_by(ExercisePrescription.position)
        ).all()
        views = [
            _prescription_view(p, self._session.get(Exercise, p.exercise_id))
            for p in prescriptions
        ]
        return ProgramSessionView(
            session_id=workout.id,
            position=workout.position,
            week=workout.week,
            day=workout.day,
            title=workout.title,
            prescriptions=views,
        )

    def _view(self, program: Program) -> ProgramView:
        workouts = self._session.exec(
            select(WorkoutSession)
            .where(WorkoutSession.program_id == program.id)
            .order_by(WorkoutSession.position)
        ).all()
        return ProgramView(
            id=program.id,
            clerk_user_id=program.clerk_user_id,
            training_type=program.training_type,
            objective=program.objective,
            sessions_per_week=program.sessions_per_week,
            weeks=program.weeks,
            duration_minutes=program.duration_minutes,
            sessions=[self._session_view(w) for w in workouts],
        )

    def create(self, clerk_user_id: str, draft: ProgramDraft) -> ProgramView:
        program = Program(
            clerk_user_id=clerk_user_id,
            training_type=draft.training_type,
            objective=draft.objective,
            sessions_per_week=draft.sessions_per_week,
            weeks=draft.weeks,
            duration_minutes=draft.duration_minutes,
        )
        self._session.add(program)
        self._session.commit()
        self._session.refresh(program)

        for position, session_draft in enumerate(draft.sessions):
            workout = WorkoutSession(
                clerk_user_id=clerk_user_id,
                training_type=draft.training_type,
                duration_minutes=draft.duration_minutes,
                program_id=program.id,
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
        return self._view(program)

    def get(self, program_id: int, clerk_user_id: str) -> ProgramView | None:
        program = self._session.get(Program, program_id)
        if program is None or program.clerk_user_id != clerk_user_id:
            return None
        return self._view(program)


class InMemoryProgramRepository:
    def __init__(self, exercises: ExerciseRepository) -> None:
        self._exercises = exercises
        self._programs: dict[int, Program] = {}
        self._sessions: dict[int, list[WorkoutSession]] = {}
        self._prescriptions: dict[int, list[ExercisePrescription]] = {}
        self._next_program_id = 1
        self._next_session_id = 1

    def _session_view(self, workout: WorkoutSession) -> ProgramSessionView:
        prescriptions = sorted(
            self._prescriptions.get(workout.id, []), key=lambda p: p.position
        )
        views = [
            _prescription_view(p, self._exercises.get(p.exercise_id))
            for p in prescriptions
        ]
        return ProgramSessionView(
            session_id=workout.id,
            position=workout.position,
            week=workout.week,
            day=workout.day,
            title=workout.title,
            prescriptions=views,
        )

    def _view(self, program: Program) -> ProgramView:
        workouts = sorted(
            self._sessions.get(program.id, []), key=lambda w: w.position
        )
        return ProgramView(
            id=program.id,
            clerk_user_id=program.clerk_user_id,
            training_type=program.training_type,
            objective=program.objective,
            sessions_per_week=program.sessions_per_week,
            weeks=program.weeks,
            duration_minutes=program.duration_minutes,
            sessions=[self._session_view(w) for w in workouts],
        )

    def create(self, clerk_user_id: str, draft: ProgramDraft) -> ProgramView:
        program = Program(
            id=self._next_program_id,
            clerk_user_id=clerk_user_id,
            training_type=draft.training_type,
            objective=draft.objective,
            sessions_per_week=draft.sessions_per_week,
            weeks=draft.weeks,
            duration_minutes=draft.duration_minutes,
        )
        self._next_program_id += 1
        self._programs[program.id] = program
        self._sessions[program.id] = []

        for position, session_draft in enumerate(draft.sessions):
            workout = WorkoutSession(
                id=self._next_session_id,
                clerk_user_id=clerk_user_id,
                training_type=draft.training_type,
                duration_minutes=draft.duration_minutes,
                program_id=program.id,
                objective=draft.objective,
                week=session_draft.week,
                day=session_draft.day,
                position=position,
                title=session_draft.title,
            )
            self._next_session_id += 1
            self._sessions[program.id].append(workout)
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
        return self._view(program)

    def get(self, program_id: int, clerk_user_id: str) -> ProgramView | None:
        program = self._programs.get(program_id)
        if program is None or program.clerk_user_id != clerk_user_id:
            return None
        return self._view(program)


__all__ = [
    "ProgramSessionDraft",
    "ProgramDraft",
    "ProgramSessionView",
    "ProgramView",
    "ProgramRepository",
    "SqlProgramRepository",
    "InMemoryProgramRepository",
]
