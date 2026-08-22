"""Behavior of the Pin repository methods through the public interface, over both the
in-memory fake and the real SQLModel implementation (#369, ADR-0053).

``pin_prescription`` writes a user-set rep target onto one owned prescription (its presence is
the marker that suspends read-time Progression), and ``clear_pin`` removes it. Both are
owner-scoped and touch only the targeted prescription — every other field is preserved. The
plan/record performed-Session guard and the range validation live in the pinning *service*
(tested through the endpoint); here we pin the persistence contract itself across both backends."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel
from tests.conftest import make_fk_engine

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


def _session_with_bodyweight_prescription(sessions, exercises, user="user_1"):
    pull_up = exercises.find_or_create("Pull-Up", provenance=Provenance.CURATED)
    dip = exercises.find_or_create("Dip", provenance=Provenance.CURATED)
    view = sessions.create(
        user,
        SessionDraft(
            training_type="strength",
            duration_minutes=30,
            prescriptions=[
                PrescriptionDraft(exercise_id=pull_up.id, sets=3, reps="8-12"),
                PrescriptionDraft(exercise_id=dip.id, sets=3, reps="6-10"),
            ],
        ),
    )
    return view


def test_pin_writes_the_target_onto_the_prescription(repos):
    # Arrange
    sessions, exercises = repos
    view = _session_with_bodyweight_prescription(sessions, exercises)

    # Act — pin the first prescription's rep target
    updated = sessions.pin_prescription(view.id, "user_1", 0, "10-14")

    # Assert — the marker is stored on the targeted prescription only
    assert updated is not None
    assert updated.prescriptions[0].pinned_reps == "10-14"
    assert updated.prescriptions[1].pinned_reps is None
    # Everything else on the prescription is untouched — a Pin is not an edit of the plan.
    assert updated.prescriptions[0].reps == "8-12"
    assert updated.prescriptions[0].sets == 3


def test_pin_survives_a_read_back(repos):
    sessions, exercises = repos
    view = _session_with_bodyweight_prescription(sessions, exercises)

    sessions.pin_prescription(view.id, "user_1", 0, "10-14")
    reread = sessions.get(view.id, "user_1")

    assert reread.prescriptions[0].pinned_reps == "10-14"


def test_clear_pin_removes_the_target(repos):
    # Arrange — a pinned prescription
    sessions, exercises = repos
    view = _session_with_bodyweight_prescription(sessions, exercises)
    sessions.pin_prescription(view.id, "user_1", 0, "10-14")

    # Act
    updated = sessions.clear_pin(view.id, "user_1", 0)

    # Assert — automatic Progression resumes: the marker is gone
    assert updated is not None
    assert updated.prescriptions[0].pinned_reps is None


def test_clear_pin_is_idempotent_on_an_unpinned_prescription(repos):
    sessions, exercises = repos
    view = _session_with_bodyweight_prescription(sessions, exercises)

    updated = sessions.clear_pin(view.id, "user_1", 0)

    assert updated is not None
    assert updated.prescriptions[0].pinned_reps is None


def test_pin_on_an_unowned_session_returns_none(repos):
    sessions, exercises = repos
    view = _session_with_bodyweight_prescription(sessions, exercises, user="owner")

    assert sessions.pin_prescription(view.id, "intruder", 0, "10-14") is None
    assert sessions.clear_pin(view.id, "intruder", 0) is None


def test_pin_at_an_absent_position_returns_none(repos):
    sessions, exercises = repos
    view = _session_with_bodyweight_prescription(sessions, exercises)

    assert sessions.pin_prescription(view.id, "user_1", 99, "10-14") is None
    assert sessions.clear_pin(view.id, "user_1", 99) is None
