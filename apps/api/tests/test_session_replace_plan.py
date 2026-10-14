"""Edit at the repository seam (ADR-0133): ``replace_plan`` rewrites a standalone
Session's ordered prescriptions, Training Type and duration in place, leaving the rest of
the Session (name, Provenance) alone. Exercised over both the in-memory fake and the real
SQLModel implementation so the two honor the same contract."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel

from app.domain.exercise import Provenance
from app.repositories.exercise_repository import (
    InMemoryExerciseRepository,
    SqlExerciseRepository,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft,
    SessionDraft,
    SqlSessionRepository,
)
from tests.conftest import make_fk_engine


@pytest.fixture(params=["in_memory", "sql"])
def repos(request):
    if request.param == "in_memory":
        exercises = InMemoryExerciseRepository()
        yield InMemorySessionRepository(exercises), exercises
        return
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlSessionRepository(session), SqlExerciseRepository(session)


def _exercise(exercises, name: str) -> int:
    return exercises.find_or_create(
        name, provenance=Provenance.AI_GENERATED, targeted_muscles=["quads"]
    ).id


def _two_movement_session(session_repo, exercises):
    squat = _exercise(exercises, "Back Squat")
    press = _exercise(exercises, "Overhead Press")
    view = session_repo.create(
        "user_a",
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            prescriptions=[
                PrescriptionDraft(exercise_id=squat, sets=5, reps="5", scheme="static"),
                PrescriptionDraft(exercise_id=press, sets=3, reps="8"),
            ],
        ),
    )
    return view, squat, press


def test_replace_plan_rewrites_order_doses_and_type(repos):
    # Arrange — a named two-movement Session
    session_repo, exercises = repos
    source, squat, press = _two_movement_session(session_repo, exercises)
    session_repo.set_name(source.id, "user_a", "Leg Day A")

    # Act — swap the order, re-dose, retype
    edited = session_repo.replace_plan(
        source.id,
        "user_a",
        training_type="hiit",
        duration_minutes=30,
        prescriptions=[
            PrescriptionDraft(exercise_id=press, sets=4, reps="6", rest_seconds=60),
            PrescriptionDraft(exercise_id=squat, sets=2, reps="10", scheme="static"),
        ],
    )

    # Assert — the new plan, numbered contiguously; everything else kept
    assert edited is not None
    reread = session_repo.get(source.id, "user_a")
    for view in (edited, reread):
        assert [p.exercise_id for p in view.prescriptions] == [press, squat]
        assert [p.position for p in view.prescriptions] == [0, 1]
        assert [(p.sets, p.reps) for p in view.prescriptions] == [(4, "6"), (2, "10")]
        assert view.prescriptions[0].rest_seconds == 60
        assert view.prescriptions[1].scheme == "static"
        assert view.training_type == "hiit"
        assert view.duration_minutes == 30
        assert view.name == "Leg Day A"
        assert view.provenance == source.provenance


def test_replace_plan_on_another_users_session_returns_none(repos):
    # Arrange
    session_repo, exercises = repos
    source, squat, _ = _two_movement_session(session_repo, exercises)

    # Act
    result = session_repo.replace_plan(
        source.id,
        "intruder",
        training_type="strength",
        duration_minutes=45,
        prescriptions=[PrescriptionDraft(exercise_id=squat, sets=1, reps="1")],
    )

    # Assert — nothing changed for the owner
    assert result is None
    assert len(session_repo.get(source.id, "user_a").prescriptions) == 2
