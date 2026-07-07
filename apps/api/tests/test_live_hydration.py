"""Behavior of the Live Session hydration read model (issue #90 — F2·S5).

``hydrate_session`` is the pure read-side join that the live screen loads from: a
user-owned Session whose recommended loads carry the ADR-0004 Progression
adjustment, *plus* each Exercise's previous performance — the Logged Sets from its
most recent performance across the user's whole history (Incomplete performances
included), aligned to the current sets by ordinal. Exercised with in-memory
repositories; no AI, no HTTP."""

from __future__ import annotations

from datetime import date

from app.domain.exercise import Provenance
from app.domain.load import parse_load
from app.live.hydration import hydrate_session
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft,
    SessionDraft,
)


def _build():
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    return exercises, sessions, logged


def _squat(exercises):
    return exercises.find_or_create(
        "Back Squat", provenance=Provenance.CURATED, targeted_muscles=["quads"]
    )


def _squat_session(sessions, exercise_id, *, owner="user_owner", load="60 kg"):
    """A standalone Session prescribing one Exercise, 3 sets of 5 at ``load``."""

    return sessions.create(
        owner,
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            prescriptions=[
                PrescriptionDraft(
                    exercise_id=exercise_id,
                    sets=3,
                    reps="5",
                    recommended_load=parse_load(load).to_dict(),
                )
            ],
        ),
    )


def _log(logged, owner, session_id, exercise_id, *, reps, effort,
         load="60 kg", performed_on=date(2026, 1, 1), completion_outcome=None):
    """Record a 3-set performance of ``exercise_id`` under ``session_id``."""

    logged.create(
        owner,
        LoggedSessionDraft(
            session_id=session_id,
            performed_on=performed_on,
            completion_outcome=completion_outcome,
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=exercise_id,
                    reps=reps,
                    load=parse_load(load).to_dict(),
                    perceived_difficulty=effort,
                )
                for _ in range(3)
            ],
        ),
    )


def test_recommended_loads_carry_the_progression_adjustment():
    # Arrange — a strong prior performance (all reps at low effort) should raise
    # the recommended load on the upcoming live Session.
    exercises, sessions, logged = _build()
    squat = _squat(exercises)
    session = _squat_session(sessions, squat.id)
    _log(logged, "user_owner", session.id, squat.id, reps=5, effort=6)

    # Act
    hydrated = hydrate_session(
        "user_owner", session.id, sessions=sessions, logged=logged
    )

    # Assert — 60 kg stepped up to 62.5 kg (ADR-0004)
    assert hydrated is not None
    load = hydrated.session.prescriptions[0].recommended_load
    assert load == parse_load("62.5 kg").to_dict()


def test_previous_performance_is_the_most_recent_sets_newest_wins():
    # Arrange — two prior performances of the same Exercise; the later one is what
    # the user must beat.
    exercises, sessions, logged = _build()
    squat = _squat(exercises)
    session = _squat_session(sessions, squat.id)
    _log(logged, "user_owner", session.id, squat.id, reps=5, effort=8,
         load="55 kg", performed_on=date(2026, 1, 1))
    _log(logged, "user_owner", session.id, squat.id, reps=6, effort=8,
         load="60 kg", performed_on=date(2026, 2, 1))

    # Act
    hydrated = hydrate_session(
        "user_owner", session.id, sessions=sessions, logged=logged
    )

    # Assert — the Feb performance wins, one previous set per current set (ordinal)
    previous = hydrated.previous_performance[squat.id]
    assert [s.reps for s in previous] == [6, 6, 6]
    assert [s.load for s in previous] == [parse_load("60 kg").to_dict()] * 3


def test_previous_performance_includes_sets_from_incomplete_sessions():
    # Arrange — the only performance was declared Incomplete (a set was left
    # un-attempted), but the sets that *were* done are real work to beat.
    exercises, sessions, logged = _build()
    squat = _squat(exercises)
    session = _squat_session(sessions, squat.id)
    _log(logged, "user_owner", session.id, squat.id, reps=5, effort=8,
         load="50 kg", completion_outcome="incomplete")

    # Act
    hydrated = hydrate_session(
        "user_owner", session.id, sessions=sessions, logged=logged
    )

    # Assert — the Incomplete performance's sets are the previous performance
    previous = hydrated.previous_performance[squat.id]
    assert [s.reps for s in previous] == [5, 5, 5]


def test_never_logged_exercise_has_no_previous_performance():
    # Arrange — a fresh Session, nothing ever performed
    exercises, sessions, logged = _build()
    squat = _squat(exercises)
    session = _squat_session(sessions, squat.id)

    # Act
    hydrated = hydrate_session(
        "user_owner", session.id, sessions=sessions, logged=logged
    )

    # Assert — no reference, and the recommended load is left untouched
    assert hydrated.previous_performance == {}
    assert hydrated.session.prescriptions[0].recommended_load == parse_load(
        "60 kg"
    ).to_dict()


def test_hydration_is_none_for_a_session_not_owned_by_the_user():
    # Arrange
    exercises, sessions, logged = _build()
    squat = _squat(exercises)
    session = _squat_session(sessions, squat.id, owner="user_owner")

    # Act / Assert — an intruder gets nothing (the route answers 404)
    assert hydrate_session(
        "user_intruder", session.id, sessions=sessions, logged=logged
    ) is None


def test_overlay_does_not_mutate_the_stored_session():
    # Arrange — a strong performance would raise the recommendation
    exercises, sessions, logged = _build()
    squat = _squat(exercises)
    session = _squat_session(sessions, squat.id)
    _log(logged, "user_owner", session.id, squat.id, reps=5, effort=6)

    # Act — read it through the overlay
    hydrate_session("user_owner", session.id, sessions=sessions, logged=logged)

    # Assert — the stored Session is unchanged; hydration is a read-time view
    stored = sessions.get(session.id, "user_owner")
    assert stored.prescriptions[0].recommended_load == parse_load("60 kg").to_dict()
