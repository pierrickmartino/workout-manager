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
from sqlalchemy import event
from sqlmodel import Session, SQLModel

from app.db.models import LoggedSet
from app.domain.exercise import Provenance
from app.domain.muscle_groups import MuscleEmphasis, emphasis_of
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


def test_repeating_a_key_returns_the_same_record_without_a_second_row(repos):
    # Arrange — a finish carrying a client-minted idempotency key (ADR-0060)
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)
    draft = LoggedSessionDraft(
        session_id=session_view.id,
        training_type="strength",
        performed_on=date(2026, 6, 20),
        idempotency_key="finish-key-1",
        logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5))],
    )

    # Act — the same finish is delivered twice (a retry resends the same key)
    first = logged.create("user_owner", draft)
    second = logged.create("user_owner", draft)

    # Assert — the repeat upsert-returns the first record; no second row is created
    assert second.id == first.id
    assert [repetitions_of(item.quantity) for item in second.logged_sets] == [5]
    assert len(logged.list_for_user("user_owner")) == 1


def test_failed_set_insert_rolls_back_the_logged_session(tmp_path):
    # Arrange — inject a failure in the transaction gap after the session row has an id
    engine = make_fk_engine(f"sqlite:///{tmp_path / 'atomic-finish.db'}")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        logged = SqlLoggedSessionRepository(session)
        sessions = SqlSessionRepository(session)
        exercises = SqlExerciseRepository(session)
        session_view, squat, press = _session_with_two_exercises(sessions, exercises)
        draft = _log_draft(session_view.id, squat, press)

        @event.listens_for(session, "before_attach")
        def fail_when_a_logged_set_is_added(_session, instance):
            if isinstance(instance, LoggedSet):
                raise RuntimeError("injected set persistence failure")

        # Act
        with pytest.raises(RuntimeError, match="injected set persistence failure"):
            logged.create("user_owner", draft)
        event.remove(session, "before_attach", fail_when_a_logged_set_is_added)

        # Assert — no partial record survives, and the repository remains usable
        assert logged.list_for_user("user_owner") == []


def test_concurrent_same_key_retry_returns_the_complete_winning_record(tmp_path):
    # Arrange — two SQL sessions race after both have observed the key as absent
    engine = make_fk_engine(f"sqlite:///{tmp_path / 'concurrent-finish.db'}")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as setup_session:
        sessions = SqlSessionRepository(setup_session)
        exercises = SqlExerciseRepository(setup_session)
        session_view, squat, press = _session_with_two_exercises(sessions, exercises)

    draft = LoggedSessionDraft(
        session_id=session_view.id,
        training_type="strength",
        performed_on=date(2026, 6, 20),
        idempotency_key="concurrent-finish-key",
        logged_sets=[
            LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5)),
            LoggedSetDraft(exercise_id=press.id, quantity=reps_quantity(10)),
        ],
    )
    with Session(engine) as losing_session, Session(engine) as winning_session:
        losing_repo = SqlLoggedSessionRepository(losing_session)
        winning_repo = SqlLoggedSessionRepository(winning_session)
        winning_views = []

        @event.listens_for(losing_session, "before_flush", once=True)
        def commit_the_competing_request(_session, _flush_context, _instances):
            winning_views.append(winning_repo.create("user_owner", draft))

        # Act — the losing request must resolve the uniqueness race as a retry
        resolved = losing_repo.create("user_owner", draft)

        # Assert — both requests resolve to one complete, owner-scoped record
        assert resolved.id == winning_views[0].id
        assert resolved.clerk_user_id == "user_owner"
        assert [repetitions_of(item.quantity) for item in resolved.logged_sets] == [5, 10]
        history = losing_repo.list_for_user("user_owner")
        assert [item.id for item in history] == [resolved.id]
        assert len(history[0].logged_sets) == 2


def test_distinct_keys_create_distinct_records(repos):
    # Arrange — two genuinely different finishes, each with its own key
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)

    def _draft(key: str) -> LoggedSessionDraft:
        return LoggedSessionDraft(
            session_id=session_view.id,
            training_type="strength",
            performed_on=date(2026, 6, 20),
            idempotency_key=key,
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5))],
        )

    # Act
    first = logged.create("user_owner", _draft("finish-key-a"))
    second = logged.create("user_owner", _draft("finish-key-b"))

    # Assert — distinct keys are distinct performances, both recorded
    assert first.id != second.id
    assert len(logged.list_for_user("user_owner")) == 2


def test_a_keyless_finish_still_inserts_and_never_dedupes(repos):
    # Arrange — a request that mints no key (the static form path) may repeat freely
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)
    draft = _log_draft(session_view.id, squat, press)  # idempotency_key defaults to None

    # Act — two keyless finishes
    first = logged.create("user_owner", draft)
    second = logged.create("user_owner", draft)

    # Assert — multiple NULL keys never collapse into one record
    assert first.id != second.id
    assert len(logged.list_for_user("user_owner")) == 2


def test_a_repeated_key_is_scoped_to_its_owner(repos):
    # Arrange — one user's keyed finish
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)
    owner_draft = LoggedSessionDraft(
        session_id=session_view.id,
        training_type="strength",
        performed_on=date(2026, 6, 20),
        idempotency_key="owner-key",
        logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5))],
    )
    first = logged.create("user_owner", owner_draft)

    # Act — the same owner retries the same finish
    repeat = logged.create("user_owner", owner_draft)

    # Assert — the owner's retry returns their own record, not a new one
    assert repeat.id == first.id
    assert logged.get(first.id, "user_owner") is not None


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


def test_logged_set_view_carries_the_exercises_primary_secondary_split(repos):
    # Arrange — an Exercise with an asserted Primary/Secondary emphasis split (ADR-0016),
    # threaded through so the coverage read layer can reach each set's emphasis (issue #539)
    logged, sessions, exercises = repos
    bench = exercises.find_or_create(
        "Bench Press",
        provenance=Provenance.CURATED,
        targeted_muscles=["chest", "triceps", "front delts"],
        primary_muscles=["chest"],
        secondary_muscles=["triceps", "front delts"],
    )
    session_view = sessions.create(
        "user_owner",
        SessionDraft(
            training_type="strength",
            duration_minutes=30,
            prescriptions=[PrescriptionDraft(exercise_id=bench.id, sets=3, reps="8")],
        ),
    )

    # Act — record a performance and read it back through the repository
    view = logged.create(
        "user_owner",
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=date(2026, 6, 20),
            logged_sets=[LoggedSetDraft(exercise_id=bench.id, quantity=reps_quantity(8))],
        ),
    )

    # Assert — the split rides on the read view alongside the flat union
    logged_set = view.logged_sets[0]
    assert logged_set.targeted_muscles == ["chest", "triceps", "front delts"]
    assert logged_set.primary_muscles == ["chest"]
    assert logged_set.secondary_muscles == ["triceps", "front delts"]
    # ...and the coverage layer's emphasis accessor reads that split off the view verbatim
    assert emphasis_of(logged_set) == MuscleEmphasis(
        primary=("chest",), secondary=("triceps", "front delts")
    )


def test_logged_set_view_emphasis_falls_back_to_all_primary_without_a_split(repos):
    # Arrange — an Exercise with only the flat targeted-muscle union, no asserted split
    logged, sessions, exercises = repos
    squat = exercises.find_or_create(
        "Back Squat",
        provenance=Provenance.CURATED,
        targeted_muscles=["quadriceps", "glutes"],
    )
    session_view = sessions.create(
        "user_owner",
        SessionDraft(
            training_type="strength",
            duration_minutes=30,
            prescriptions=[PrescriptionDraft(exercise_id=squat.id, sets=5, reps="5")],
        ),
    )

    # Act
    view = logged.create(
        "user_owner",
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=date(2026, 6, 20),
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5))],
        ),
    )

    # Assert — no split stored, so the emphasis accessor falls back to the whole union as
    # all-primary (the "no split → all primary" rule), never a fabricated primacy
    logged_set = view.logged_sets[0]
    assert logged_set.primary_muscles == []
    assert logged_set.secondary_muscles == []
    assert emphasis_of(logged_set) == MuscleEmphasis(
        primary=("quadriceps", "glutes"), secondary=()
    )
