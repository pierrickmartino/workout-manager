"""Repository for user-owned WorkoutSessions and their Exercise Prescriptions.

Writes take a ``SessionDraft`` (the training parameters plus an ordered list of
``PrescriptionDraft``, each referencing a catalog Exercise by id). Reads return a
``SessionView`` — the session joined to its ordered prescriptions and each
prescription's catalog Exercise — so consumers never touch the ORM. Reads are
scoped to the owning user: a Session belongs to one user and is never served to
another. SQLModel-backed and in-memory implementations honor the same contract."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from sqlmodel import Session, select

from app.db.models import Exercise, ExercisePrescription, WorkoutSession
from app.repositories.exercise_repository import ExerciseRepository


@dataclass(frozen=True)
class PrescriptionDraft:
    """One Exercise Prescription to persist, referencing a catalog Exercise."""

    exercise_id: int
    sets: int
    reps: str
    rest_seconds: int | None = None
    tempo: str | None = None
    recommended_load: str | None = None


@dataclass(frozen=True)
class SessionDraft:
    """A standalone Session to persist: parameters plus ordered prescriptions."""

    training_type: str
    duration_minutes: int
    prescriptions: list[PrescriptionDraft] = field(default_factory=list)


@dataclass(frozen=True)
class PrescriptionView:
    """A prescription joined to its catalog Exercise, ready to serialize."""

    position: int
    sets: int
    reps: str
    rest_seconds: int | None
    tempo: str | None
    recommended_load: str | None
    exercise_id: int
    exercise_name: str
    exercise_description: str | None
    targeted_muscles: list[str]
    required_equipment: list[str]
    provenance: str


@dataclass(frozen=True)
class SessionView:
    """A standalone Session with its ordered, exercise-joined prescriptions."""

    id: int
    clerk_user_id: str
    training_type: str
    duration_minutes: int
    prescriptions: list[PrescriptionView]


class SessionRepository(Protocol):
    def create(self, clerk_user_id: str, draft: SessionDraft) -> SessionView:
        """Persist ``draft`` as a Session owned by ``clerk_user_id`` and return
        the stored Session joined to its prescriptions and exercises."""
        ...

    def get(self, session_id: int, clerk_user_id: str) -> SessionView | None:
        """Return the owner's Session by id, or ``None`` if it is missing or
        owned by another user."""
        ...


def _prescription_view(
    prescription: ExercisePrescription, exercise: Exercise
) -> PrescriptionView:
    return PrescriptionView(
        position=prescription.position,
        sets=prescription.sets,
        reps=prescription.reps,
        rest_seconds=prescription.rest_seconds,
        tempo=prescription.tempo,
        recommended_load=prescription.recommended_load,
        exercise_id=exercise.id,
        exercise_name=exercise.name,
        exercise_description=exercise.description,
        targeted_muscles=list(exercise.targeted_muscles),
        required_equipment=list(exercise.required_equipment),
        provenance=exercise.provenance,
    )


class SqlSessionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def _view(self, workout: WorkoutSession) -> SessionView:
        prescriptions = self._session.exec(
            select(ExercisePrescription)
            .where(ExercisePrescription.session_id == workout.id)
            .order_by(ExercisePrescription.position)
        ).all()
        views = [
            _prescription_view(p, self._session.get(Exercise, p.exercise_id))
            for p in prescriptions
        ]
        return SessionView(
            id=workout.id,
            clerk_user_id=workout.clerk_user_id,
            training_type=workout.training_type,
            duration_minutes=workout.duration_minutes,
            prescriptions=views,
        )

    def create(self, clerk_user_id: str, draft: SessionDraft) -> SessionView:
        workout = WorkoutSession(
            clerk_user_id=clerk_user_id,
            training_type=draft.training_type,
            duration_minutes=draft.duration_minutes,
        )
        self._session.add(workout)
        self._session.commit()
        self._session.refresh(workout)

        for position, prescription in enumerate(draft.prescriptions):
            self._session.add(
                ExercisePrescription(
                    session_id=workout.id,
                    exercise_id=prescription.exercise_id,
                    position=position,
                    sets=prescription.sets,
                    reps=prescription.reps,
                    rest_seconds=prescription.rest_seconds,
                    tempo=prescription.tempo,
                    recommended_load=prescription.recommended_load,
                )
            )
        self._session.commit()
        return self._view(workout)

    def get(self, session_id: int, clerk_user_id: str) -> SessionView | None:
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None
        return self._view(workout)


class InMemorySessionRepository:
    def __init__(self, exercises: ExerciseRepository) -> None:
        self._exercises = exercises
        self._sessions: dict[int, WorkoutSession] = {}
        self._prescriptions: dict[int, list[ExercisePrescription]] = {}
        self._next_id = 1

    def _view(self, workout: WorkoutSession) -> SessionView:
        prescriptions = self._prescriptions.get(workout.id, [])
        views = [
            _prescription_view(p, self._exercises.get(p.exercise_id))
            for p in sorted(prescriptions, key=lambda p: p.position)
        ]
        return SessionView(
            id=workout.id,
            clerk_user_id=workout.clerk_user_id,
            training_type=workout.training_type,
            duration_minutes=workout.duration_minutes,
            prescriptions=views,
        )

    def create(self, clerk_user_id: str, draft: SessionDraft) -> SessionView:
        workout = WorkoutSession(
            id=self._next_id,
            clerk_user_id=clerk_user_id,
            training_type=draft.training_type,
            duration_minutes=draft.duration_minutes,
        )
        self._next_id += 1
        self._sessions[workout.id] = workout
        self._prescriptions[workout.id] = [
            ExercisePrescription(
                id=position + 1,
                session_id=workout.id,
                exercise_id=prescription.exercise_id,
                position=position,
                sets=prescription.sets,
                reps=prescription.reps,
                rest_seconds=prescription.rest_seconds,
                tempo=prescription.tempo,
                recommended_load=prescription.recommended_load,
            )
            for position, prescription in enumerate(draft.prescriptions)
        ]
        return self._view(workout)

    def get(self, session_id: int, clerk_user_id: str) -> SessionView | None:
        workout = self._sessions.get(session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None
        return self._view(workout)


__all__ = [
    "PrescriptionDraft",
    "SessionDraft",
    "PrescriptionView",
    "SessionView",
    "SessionRepository",
    "SqlSessionRepository",
    "InMemorySessionRepository",
]
