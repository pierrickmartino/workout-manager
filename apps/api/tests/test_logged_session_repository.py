"""Behavior of the LoggedSession repository through its public interface, over
both the in-memory fake and the real SQLModel implementation.

A Logged Session is the *record* of performing a user-owned Session on a date:
it carries ordered Logged Sets (real reps, load, perceived difficulty) and never
mutates the prescribing Session. Reads are scoped to the owning user and return
plain views joined to each set's catalog Exercise and the parent Session's
training type — consumers never touch the ORM."""

from __future__ import annotations

from tests.conftest import make_fk_engine
from tests.quantities import reps_quantity
from app.domain.quantity import repetitions_of

from datetime import date

import pytest
from sqlmodel import Session, SQLModel

from app.domain.exercise import Provenance
from app.repositories.exercise_repository import (
    InMemoryExerciseRepository,
    SqlExerciseRepository,
)
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
    SqlLoggedSessionRepository,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft,
    SessionDraft,
    SqlSessionRepository,
)


@pytest.fixture(params=["in_memory", "sql"])
def repos(request):
    """Yield (logged_repo, session_repo, exercise_repo) sharing one backing store."""
    if request.param == "in_memory":
        exercises = InMemoryExerciseRepository()
        sessions = InMemorySessionRepository(exercises)
        yield InMemoryLoggedSessionRepository(sessions, exercises), sessions, exercises
        return
    # Enforce foreign keys (SQLite ignores them by default) so a cascade-order bug in
    # delete surfaces here the way it does on Postgres, instead of hiding until production.
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield (
            SqlLoggedSessionRepository(session),
            SqlSessionRepository(session),
            SqlExerciseRepository(session),
        )


def _session_with_two_exercises(sessions, exercises):
    """Persist a user-owned Session and return (session_view, squat, press)."""
    squat = exercises.find_or_create(
        "Back Squat", provenance=Provenance.AI_GENERATED, targeted_muscles=["quads"]
    )
    press = exercises.find_or_create(
        "Overhead Press", provenance=Provenance.AI_GENERATED
    )
    session_view = sessions.create(
        "user_owner",
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            prescriptions=[
                PrescriptionDraft(exercise_id=squat.id, sets=5, reps="5"),
                PrescriptionDraft(exercise_id=press.id, sets=3, reps="8-12"),
            ],
        ),
    )
    return session_view, squat, press


def _log_draft(session_id, squat, press) -> LoggedSessionDraft:
    return LoggedSessionDraft(
        session_id=session_id,
        training_type="strength",
        performed_on=date(2026, 6, 20),
        logged_sets=[
            LoggedSetDraft(
                exercise_id=squat.id, quantity=reps_quantity(5), load="70kg", perceived_difficulty=8
            ),
            LoggedSetDraft(
                exercise_id=press.id, quantity=reps_quantity(10), load="30kg", perceived_difficulty=6
            ),
        ],
    )


def test_logged_session_round_trips_with_its_sets(repos):
    # Arrange
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)

    # Act
    view = logged.create("user_owner", _log_draft(session_view.id, squat, press))

    # Assert
    assert view.id is not None
    assert view.clerk_user_id == "user_owner"
    assert view.session_id == session_view.id
    assert view.performed_on == date(2026, 6, 20)
    assert [repetitions_of(s.quantity) for s in view.logged_sets] == [5, 10]
    assert [s.load for s in view.logged_sets] == ["70kg", "30kg"]
    assert [s.perceived_difficulty for s in view.logged_sets] == [8, 6]
    assert [s.exercise_name for s in view.logged_sets] == [
        "Back Squat",
        "Overhead Press",
    ]
    assert view.training_type == "strength"


def test_plan_less_record_round_trips_with_no_session_and_its_own_training_type(repos):
    # Arrange — a record of an ad-hoc movement, prescribed by no Session (ADR-0031)
    logged, sessions, exercises = repos
    running = exercises.find_or_create("Running", provenance=Provenance.CURATED)

    # Act
    view = logged.create(
        "user_owner",
        LoggedSessionDraft(
            session_id=None,
            training_type="cardio",
            performed_on=date(2026, 6, 20),
            logged_sets=[LoggedSetDraft(exercise_id=running.id, quantity=reps_quantity(30))],
        ),
    )

    # Assert — it stands alone: no Session behind it, training type read off the record
    assert view.session_id is None
    assert view.training_type == "cardio"
    assert logged.get(view.id, "user_owner").session_id is None
    assert repetitions_of(view.logged_sets[0].quantity) == 30


def test_same_session_can_be_logged_multiple_times_separately(repos):
    # Arrange — one Session, performed on two different dates
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)

    # Act
    first = logged.create(
        "user_owner",
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=date(2026, 6, 20),
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5), load="70kg")],
        ),
    )
    second = logged.create(
        "user_owner",
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=date(2026, 6, 27),
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(6), load="72kg")],
        ),
    )

    # Assert — each performance is its own record, both tied to the same Session
    assert first.id != second.id
    assert first.session_id == second.session_id == session_view.id
    assert repetitions_of(logged.get(first.id, "user_owner").logged_sets[0].quantity) == 5
    assert repetitions_of(logged.get(second.id, "user_owner").logged_sets[0].quantity) == 6


def test_completion_outcome_round_trips_on_the_record(repos):
    # Arrange — a performance the client declared Incomplete (ADR-0013)
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)

    # Act
    view = logged.create(
        "user_owner",
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=date(2026, 6, 20),
            completion_outcome="incomplete",
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5))],
        ),
    )

    # Assert — the declared outcome persists and reads back on the view
    assert view.completion_outcome == "incomplete"
    assert logged.get(view.id, "user_owner").completion_outcome == "incomplete"


def test_completion_outcome_defaults_to_none_when_undeclared(repos):
    # Arrange — a draft that never declares an outcome (e.g. legacy log-after-fact)
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)

    # Act
    view = logged.create("user_owner", _log_draft(session_view.id, squat, press))

    # Assert — the column is nullable; an undeclared outcome stays null
    assert view.completion_outcome is None


def test_duration_seconds_round_trips_on_the_record(repos):
    # Arrange — a live-tracked performance recording its Session Duration (ADR-0014)
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)

    # Act
    view = logged.create(
        "user_owner",
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=date(2026, 6, 20),
            duration_seconds=1830,
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5))],
        ),
    )

    # Assert — the recorded duration persists and reads back on the view
    assert view.duration_seconds == 1830
    assert logged.get(view.id, "user_owner").duration_seconds == 1830


def test_duration_seconds_defaults_to_none_when_unrecorded(repos):
    # Arrange — a log-after-the-fact performance never measures a duration (ADR-0014)
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)

    # Act
    view = logged.create("user_owner", _log_draft(session_view.id, squat, press))

    # Assert — the column is nullable; an unrecorded duration stays null
    assert view.duration_seconds is None


def test_get_does_not_leak_another_users_log(repos):
    # Arrange — a Logged Session is user-owned; another user must not read it
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)
    created = logged.create("user_owner", _log_draft(session_view.id, squat, press))

    # Act
    fetched = logged.get(created.id, "user_intruder")

    # Assert
    assert fetched is None


def test_get_returns_none_for_an_unknown_log(repos):
    # Arrange
    logged, _, _ = repos

    # Assert
    assert logged.get(987654, "user_any") is None


def test_history_lists_users_logs_newest_first(repos):
    # Arrange — three performances on ascending dates
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)
    for performed_on in (date(2026, 6, 1), date(2026, 6, 15), date(2026, 6, 10)):
        logged.create(
            "user_owner",
            LoggedSessionDraft(
                session_id=session_view.id,
                performed_on=performed_on,
                logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5))],
            ),
        )

    # Act
    history = logged.list_for_user("user_owner")

    # Assert — most recent performance first
    assert [entry.performed_on for entry in history] == [
        date(2026, 6, 15),
        date(2026, 6, 10),
        date(2026, 6, 1),
    ]


def test_history_is_scoped_to_the_user(repos):
    # Arrange — two users each log against their own session
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)
    logged.create("user_owner", _log_draft(session_view.id, squat, press))

    # Act / Assert — a different user sees an empty history
    assert logged.list_for_user("user_other") == []


def test_update_replaces_the_editable_fields_and_the_whole_set_list(repos):
    # Arrange — a plan-backed record to correct after the fact (ADR-0034)
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)
    view = logged.create("user_owner", _log_draft(session_view.id, squat, press))

    # Act — full-replace: a single corrected set, a new date and duration
    updated = logged.update(
        view.id,
        "user_owner",
        LoggedSessionDraft(
            session_id=session_view.id,
            training_type="strength",
            performed_on=date(2026, 7, 1),
            duration_seconds=1800,
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=squat.id, quantity=reps_quantity(6), load="72kg"
                )
            ],
        ),
    )

    # Assert — the record is updated in place, same id, sets replaced wholesale
    assert updated.id == view.id
    assert updated.performed_on == date(2026, 7, 1)
    assert updated.duration_seconds == 1800
    assert [repetitions_of(s.quantity) for s in updated.logged_sets] == [6]
    assert [s.load for s in updated.logged_sets] == ["72kg"]
    # And a fresh read reflects the correction, not the original two sets
    reread = logged.get(view.id, "user_owner")
    assert [repetitions_of(s.quantity) for s in reread.logged_sets] == [6]


def test_update_is_owner_scoped_and_returns_none_for_another_user(repos):
    # Arrange — one user's record
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)
    view = logged.create("user_owner", _log_draft(session_view.id, squat, press))

    # Act — a different user attempts the update
    result = logged.update(
        view.id,
        "user_other",
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=date(2026, 7, 1),
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(6))],
        ),
    )

    # Assert — the update is refused and the record is untouched
    assert result is None
    assert [repetitions_of(s.quantity) for s in logged.get(view.id, "user_owner").logged_sets] == [5, 10]


def test_delete_removes_an_owned_record_and_its_sets(repos):
    # Arrange — a plan-backed record with two sets (ADR-0034)
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)
    view = logged.create("user_owner", _log_draft(session_view.id, squat, press))

    # Act — delete it
    deleted = logged.delete(view.id, "user_owner")

    # Assert — the record is gone from get and from history; its sets cascade away
    assert deleted is True
    assert logged.get(view.id, "user_owner") is None
    assert logged.list_for_user("user_owner") == []


def test_delete_is_owner_scoped_and_leaves_another_users_record(repos):
    # Arrange — one user's record
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)
    view = logged.create("user_owner", _log_draft(session_view.id, squat, press))

    # Act — a different user attempts the delete
    deleted = logged.delete(view.id, "user_other")

    # Assert — refused, and the owner's record is untouched
    assert deleted is False
    assert logged.get(view.id, "user_owner") is not None


def test_delete_returns_false_for_an_unknown_log(repos):
    # Arrange
    logged, _, _ = repos

    # Act / Assert — nothing to delete
    assert logged.delete(987654, "user_any") is False
