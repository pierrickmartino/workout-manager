"""The Session card's two read-time facts on the My Sessions list (GLOSSARY: My Sessions, Recent Sessions).

The one Session card Train and My Sessions share shows when a plan was last trained and a
preview of its first movements. Both ride on ``GET /api/sessions`` so the list never fans out
into a History read plus one detail read per row:

- ``last_performed_by_session`` — the newest ``performed_on`` per Session, read off the record
  in one query (a projection, never a stored column — ADR-0018).
- ``preview_exercise_names`` on each list summary — the plan's first Exercise Prescriptions'
  names in prescription order, drawn from the *plan*, never the last record.

Exercised over both the in-memory fakes and the real SQL repositories.
"""

from __future__ import annotations

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
from tests.conftest import make_fk_engine


@pytest.fixture(params=["in_memory", "sql"])
def repos(request):
    if request.param == "in_memory":
        exercises = InMemoryExerciseRepository()
        sessions = InMemorySessionRepository(exercises)
        yield sessions, exercises, InMemoryLoggedSessionRepository(sessions, exercises)
        return
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as sql:
        yield (
            SqlSessionRepository(sql),
            SqlExerciseRepository(sql),
            SqlLoggedSessionRepository(sql),
        )


def _create(sessions, exercises, user, names: list[str]) -> int:
    ids = [
        exercises.find_or_create(name, provenance=Provenance.AI_GENERATED).id
        for name in names
    ]
    return sessions.create(
        user,
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            prescriptions=[
                PrescriptionDraft(exercise_id=exercise_id, sets=3, reps="8")
                for exercise_id in ids
            ],
        ),
    ).id


def _log(logged, user, session_id, performed_on: date, exercise_id: int) -> None:
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_id,
            performed_on=performed_on,
            training_type="strength",
            completion_outcome="completed",
            logged_sets=[LoggedSetDraft(exercise_id=exercise_id)],
        ),
    )


def test_last_performed_is_the_newest_performance_per_session(repos):
    # Arrange — one plan performed twice (out of date order), one never performed
    sessions, exercises, logged = repos
    performed = _create(sessions, exercises, "user_a", ["Back Squat"])
    never = _create(sessions, exercises, "user_a", ["Back Squat"])
    squat = exercises.find_or_create("Back Squat", provenance=Provenance.AI_GENERATED)
    _log(logged, "user_a", performed, date(2026, 10, 12), squat.id)
    _log(logged, "user_a", performed, date(2026, 9, 1), squat.id)

    # Act
    last = logged.last_performed_by_session("user_a")

    # Assert — the newest date wins; a never-performed plan is absent
    assert last == {performed: date(2026, 10, 12)}
    assert never not in last


def test_last_performed_is_owner_scoped_and_skips_plan_less_records(repos):
    sessions, exercises, logged = repos
    plan = _create(sessions, exercises, "user_a", ["Back Squat"])
    squat = exercises.find_or_create("Back Squat", provenance=Provenance.AI_GENERATED)
    _log(logged, "user_a", None, date(2026, 10, 1), squat.id)  # plan-less
    _log(logged, "user_a", plan, date(2026, 8, 1), squat.id)

    assert logged.last_performed_by_session("user_a") == {plan: date(2026, 8, 1)}
    assert logged.last_performed_by_session("user_b") == {}


def test_list_summary_previews_the_first_three_exercises_in_plan_order(repos):
    # Arrange — four prescriptions; the preview keeps the authored order and stops at three
    sessions, exercises, _ = repos
    plan = _create(
        sessions,
        exercises,
        "user_a",
        ["Back Squat", "Romanian Deadlift", "Leg Press", "Calf Raise"],
    )
    empty = sessions.create(
        "user_a",
        SessionDraft(training_type="yoga", duration_minutes=30, prescriptions=[]),
    ).id

    # Act
    page = sessions.list_standalone("user_a", limit=50, offset=0)
    summaries = {summary.id: summary for summary in page.items}

    # Assert
    assert summaries[plan].preview_exercise_names == (
        "Back Squat",
        "Romanian Deadlift",
        "Leg Press",
    )
    assert summaries[empty].preview_exercise_names == ()
