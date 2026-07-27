"""Behavior of the Log Correction service (ADR-0034): edit a Logged Session's
contents after the fact.

``correct_session`` is the record-side sibling of ``log_session``. It resolves
ownership (``LogNotFoundError`` when the log is not the caller's), reads the
plan-backed / plan-less boundary rule *off the existing record* (not a URL, so no
route split), guards catalog validity (``UnknownExerciseError``), carries the
Performed Body Weight forward from the record onto every replacement set, and
preserves the Completion Outcome and the immutable ``session_id``. Tested through
its public function over in-memory repositories; no AI and no database."""

from __future__ import annotations

from datetime import date

import pytest

from tests.quantities import reps_quantity
from app.domain.exercise import Provenance
from app.domain.quantity import repetitions_of
from app.logbook.correction import (
    CorrectSessionRequest,
    LogNotFoundError,
    correct_session,
)
from app.logbook.service import (
    LogKindError,
    LogSessionRequest,
    UnknownExerciseError,
    log_session,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSetDraft,
)
from app.repositories.profile_repository import (
    InMemoryProfileRepository,
    ProfileUpdate,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft,
    SessionDraft,
)


def _wire():
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    profiles = InMemoryProfileRepository()
    return sessions, exercises, logged, profiles


def _owned_session(sessions, exercises, owner="user_owner"):
    squat = exercises.find_or_create("Back Squat", provenance=Provenance.AI_GENERATED)
    session_view = sessions.create(
        owner,
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            prescriptions=[PrescriptionDraft(exercise_id=squat.id, sets=5, reps="5")],
        ),
    )
    return session_view, squat


def _log_plan_backed(sessions, exercises, logged, profiles, owner="user_owner"):
    """Record a plan-backed performance and return (logged_view, session, squat)."""
    session_view, squat = _owned_session(sessions, exercises, owner)
    view = log_session(
        LogSessionRequest(
            session_id=session_view.id,
            performed_on=date(2026, 6, 20),
            completion_outcome="completed",
            duration_seconds=1200,
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=squat.id, quantity=reps_quantity(5), load="60kg"
                )
            ],
        ),
        owner,
        sessions=sessions,
        exercises=exercises,
        logged=logged,
        profiles=profiles,
    )
    return view, session_view, squat


def test_correction_edits_contents_and_preserves_outcome_and_session_id():
    # Arrange — a plan-backed record to correct: "I entered 60 kg, meant 70 kg"
    sessions, exercises, logged, profiles = _wire()
    view, session_view, squat = _log_plan_backed(sessions, exercises, logged, profiles)

    # Act — correct the load, reps, date, and duration
    updated = correct_session(
        CorrectSessionRequest(
            log_id=view.id,
            performed_on=date(2026, 7, 1),
            duration_seconds=1500,
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=squat.id, quantity=reps_quantity(6), load="70kg"
                )
            ],
        ),
        "user_owner",
        exercises=exercises,
        logged=logged,
    )

    # Assert — contents change; identity, parent Session, and outcome are preserved
    assert updated.id == view.id
    assert updated.session_id == session_view.id
    assert updated.completion_outcome == "completed"
    assert updated.performed_on == date(2026, 7, 1)
    assert updated.duration_seconds == 1500
    assert [repetitions_of(s.quantity) for s in updated.logged_sets] == [6]
    assert [s.load for s in updated.logged_sets] == ["70kg"]


def test_correction_of_another_users_log_raises_not_found():
    # Arrange — a record owned by user_owner
    sessions, exercises, logged, profiles = _wire()
    view, _, squat = _log_plan_backed(sessions, exercises, logged, profiles)

    # Act / Assert — a stranger cannot correct it (surfaces as 404 at the route)
    with pytest.raises(LogNotFoundError):
        correct_session(
            CorrectSessionRequest(
                log_id=view.id,
                performed_on=date(2026, 7, 1),
                logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(6))],
            ),
            "user_stranger",
            exercises=exercises,
            logged=logged,
        )


def test_correction_referencing_an_unknown_exercise_is_rejected():
    # Arrange
    sessions, exercises, logged, profiles = _wire()
    view, _, _ = _log_plan_backed(sessions, exercises, logged, profiles)

    # Act / Assert — a set naming an Exercise not in the catalog is refused (422)
    with pytest.raises(UnknownExerciseError):
        correct_session(
            CorrectSessionRequest(
                log_id=view.id,
                performed_on=date(2026, 7, 1),
                logged_sets=[LoggedSetDraft(exercise_id=9999, quantity=reps_quantity(6))],
            ),
            "user_owner",
            exercises=exercises,
            logged=logged,
        )


def test_plan_backed_correction_ignores_a_request_training_type():
    # Arrange — a strength record whose training type is derived from its Session
    sessions, exercises, logged, profiles = _wire()
    view, _, squat = _log_plan_backed(sessions, exercises, logged, profiles)

    # Act — the request tries to change the training type; it must be ignored
    updated = correct_session(
        CorrectSessionRequest(
            log_id=view.id,
            performed_on=date(2026, 7, 1),
            training_type="cardio",
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(6))],
        ),
        "user_owner",
        exercises=exercises,
        logged=logged,
    )

    # Assert — the Session's training type still wins
    assert updated.training_type == "strength"


def _log_plan_less(exercises, logged, profiles, owner="user_owner"):
    """Record a plan-less performance and return (logged_view, running_exercise)."""
    running = exercises.find_or_create("Running", provenance=Provenance.CURATED)
    view = log_session(
        LogSessionRequest(
            session_id=None,
            training_type="cardio",
            performed_on=date(2026, 6, 20),
            logged_sets=[LoggedSetDraft(exercise_id=running.id, quantity=reps_quantity(30))],
        ),
        owner,
        sessions=InMemorySessionRepository(exercises),
        exercises=exercises,
        logged=logged,
        profiles=profiles,
    )
    return view, running


def test_plan_less_correction_can_change_the_training_type():
    # Arrange — an ad-hoc, standalone record (ADR-0031)
    sessions, exercises, logged, profiles = _wire()
    view, running = _log_plan_less(exercises, logged, profiles)

    # Act — a plan-less correction takes the training type from the request
    updated = correct_session(
        CorrectSessionRequest(
            log_id=view.id,
            performed_on=date(2026, 7, 1),
            training_type="mobility",
            logged_sets=[LoggedSetDraft(exercise_id=running.id, quantity=reps_quantity(20))],
        ),
        "user_owner",
        exercises=exercises,
        logged=logged,
    )

    # Assert
    assert updated.session_id is None
    assert updated.training_type == "mobility"


def test_plan_less_correction_without_a_training_type_is_rejected():
    # Arrange
    sessions, exercises, logged, profiles = _wire()
    view, running = _log_plan_less(exercises, logged, profiles)

    # Act / Assert — a plan-less record must carry a training type (boundary rule, 422)
    with pytest.raises(LogKindError):
        correct_session(
            CorrectSessionRequest(
                log_id=view.id,
                performed_on=date(2026, 7, 1),
                training_type="   ",
                logged_sets=[LoggedSetDraft(exercise_id=running.id, quantity=reps_quantity(20))],
            ),
            "user_owner",
            exercises=exercises,
            logged=logged,
        )


def test_correction_carries_the_recorded_body_weight_onto_every_set():
    # Arrange — a record logged while 80 kg was on file, so its set snapshots 80 kg
    sessions, exercises, logged, profiles = _wire()
    profiles.update("user_owner", ProfileUpdate(weight_kg=80.0))
    session_view, squat = _owned_session(sessions, exercises)
    press = exercises.find_or_create("Overhead Press", provenance=Provenance.AI_GENERATED)
    view = log_session(
        LogSessionRequest(
            session_id=session_view.id,
            performed_on=date(2026, 6, 20),
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5))],
        ),
        "user_owner",
        sessions=sessions,
        exercises=exercises,
        logged=logged,
        profiles=profiles,
    )
    assert view.logged_sets[0].body_weight_kg == 80.0

    # The performer weighs 90 kg today, but a three-month-old correction must not drift.
    profiles.update("user_owner", ProfileUpdate(weight_kg=90.0))

    # Act — replace with two sets, including a brand-new one; ignore any client mass
    updated = correct_session(
        CorrectSessionRequest(
            log_id=view.id,
            performed_on=date(2026, 7, 1),
            logged_sets=[
                LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(6)),
                LoggedSetDraft(
                    exercise_id=press.id, quantity=reps_quantity(8), body_weight_kg=999.0
                ),
            ],
        ),
        "user_owner",
        exercises=exercises,
        logged=logged,
    )

    # Assert — the recorded 80 kg is carried forward onto both sets, not today's 90 kg
    assert [s.body_weight_kg for s in updated.logged_sets] == [80.0, 80.0]


def test_correction_of_a_massless_record_stays_massless():
    # Arrange — logged with no weight on file, so its set carries no mass
    sessions, exercises, logged, profiles = _wire()
    session_view, squat = _owned_session(sessions, exercises)
    view = log_session(
        LogSessionRequest(
            session_id=session_view.id,
            performed_on=date(2026, 6, 20),
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5))],
        ),
        "user_owner",
        sessions=sessions,
        exercises=exercises,
        logged=logged,
        profiles=profiles,
    )
    assert view.logged_sets[0].body_weight_kg is None

    # Act — even if a mass is later on file and the client sends one, it stays None
    profiles.update("user_owner", ProfileUpdate(weight_kg=85.0))
    updated = correct_session(
        CorrectSessionRequest(
            log_id=view.id,
            performed_on=date(2026, 7, 1),
            logged_sets=[
                LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(6), body_weight_kg=85.0)
            ],
        ),
        "user_owner",
        exercises=exercises,
        logged=logged,
    )

    # Assert — record-ineligible stays record-ineligible (ADR-0026 honest silence)
    assert updated.logged_sets[0].body_weight_kg is None
