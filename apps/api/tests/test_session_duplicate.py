"""Duplicate: deep-copying a user-owned Session into a new standalone Session
(ADR-0043). The copy keeps the source's prescriptions, Supersets, Session
Provenance, trace_id lineage, and name verbatim, but carries no records and no
Protocol position, so it stands alone with a fresh regeneration budget. The
source is read, never mutated; a non-owner can never copy another user's plan.

Exercised through the repository's public interface over both the in-memory fake
and the real SQLModel implementation, plus one SQL-backed case for a
Protocol-member source (which ``create`` cannot build, as it only makes
standalone Sessions)."""

from __future__ import annotations

from dataclasses import replace
from datetime import date

import pytest
from sqlmodel import Session, SQLModel
from tests.conftest import make_fk_engine

from app.db.models import ExercisePrescription, Protocol, WorkoutSession
from app.domain.exercise import Provenance
from app.repositories.exercise_repository import (
    InMemoryExerciseRepository,
    SqlExerciseRepository,
)
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
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


def _draft_with_two_prescriptions(exercises) -> SessionDraft:
    squat = exercises.find_or_create(
        "Back Squat", provenance=Provenance.AI_GENERATED, targeted_muscles=["quads"]
    )
    press = exercises.find_or_create(
        "Overhead Press", provenance=Provenance.AI_GENERATED
    )
    return SessionDraft(
        training_type="strength",
        duration_minutes=45,
        prescriptions=[
            PrescriptionDraft(
                exercise_id=squat.id,
                sets=5,
                reps="5",
                rest_seconds=120,
                tempo="3-1-1",
                recommended_load="70% 1RM",
            ),
            PrescriptionDraft(exercise_id=press.id, sets=3, reps="8-12"),
        ],
    )


def _superset_draft(exercises) -> SessionDraft:
    a = exercises.find_or_create("Push-Up", provenance=Provenance.AI_GENERATED)
    b = exercises.find_or_create("Inverted Row", provenance=Provenance.AI_GENERATED)
    return SessionDraft(
        training_type="strength",
        duration_minutes=30,
        prescriptions=[
            PrescriptionDraft(
                exercise_id=a.id,
                sets=3,
                reps="10",
                superset_group="A",
                round_rest_seconds=90,
            ),
            PrescriptionDraft(
                exercise_id=b.id,
                sets=3,
                reps="10",
                superset_group="A",
                round_rest_seconds=90,
            ),
        ],
    )


def _replacement(exercises) -> PrescriptionDraft:
    goblet = exercises.find_or_create(
        "Goblet Squat", provenance=Provenance.AI_GENERATED, targeted_muscles=["quads"]
    )
    return PrescriptionDraft(exercise_id=goblet.id, sets=3, reps="10")


def test_duplicate_copies_the_prescriptions_in_order(repos):
    # Arrange
    session_repo, exercises = repos
    source = session_repo.create("user_dup", _draft_with_two_prescriptions(exercises))

    # Act
    copy = session_repo.duplicate(source.id, "user_dup")

    # Assert — every prescription field is carried faithfully, in order
    assert copy is not None
    assert [p.exercise_name for p in copy.prescriptions] == [
        "Back Squat",
        "Overhead Press",
    ]
    first = copy.prescriptions[0]
    assert first.sets == 5
    assert first.reps == "5"
    assert first.rest_seconds == 120
    assert first.tempo == "3-1-1"
    assert first.recommended_load == "70% 1RM"
    assert [p.position for p in copy.prescriptions] == [0, 1]


def test_duplicate_is_a_distinct_standalone_session(repos):
    # Arrange
    session_repo, exercises = repos
    source = session_repo.create("user_two", _draft_with_two_prescriptions(exercises))

    # Act
    copy = session_repo.duplicate(source.id, "user_two")

    # Assert — a new id, both readable by the owner
    assert copy.id != source.id
    assert session_repo.get(copy.id, "user_two") is not None
    assert session_repo.get(source.id, "user_two") is not None


def test_duplicate_leaves_the_source_untouched(repos):
    # Arrange
    session_repo, exercises = repos
    source = session_repo.create("user_src", _draft_with_two_prescriptions(exercises))

    # Act
    session_repo.duplicate(source.id, "user_src")

    # Assert — the original still reads back exactly as before
    refetched = session_repo.get(source.id, "user_src")
    assert [p.exercise_name for p in refetched.prescriptions] == [
        "Back Squat",
        "Overhead Press",
    ]
    assert refetched.has_been_regenerated is False


def test_duplicate_inherits_ai_generated_provenance(repos):
    # Arrange — the default (generation-path) provenance
    session_repo, exercises = repos
    source = session_repo.create("user_ai", _draft_with_two_prescriptions(exercises))

    # Act / Assert — provenance tracks content authorship, not the copy act (ADR-0043)
    copy = session_repo.duplicate(source.id, "user_ai")
    assert copy.provenance == "ai_generated"


def test_duplicate_inherits_user_authored_provenance(repos):
    # Arrange — a Hand-Authored source
    session_repo, exercises = repos
    authored = replace(
        _draft_with_two_prescriptions(exercises), provenance="user_authored"
    )
    source = session_repo.create("user_hand", authored)

    # Act / Assert — a duplicate of a hand-written plan stays user_authored
    copy = session_repo.duplicate(source.id, "user_hand")
    assert copy.provenance == "user_authored"


def test_duplicate_carries_the_trace_id_lineage_forward(repos):
    # Arrange — an ai_generated source with its originating call's lineage
    session_repo, exercises = repos
    source = session_repo.create(
        "user_trace",
        replace(_draft_with_two_prescriptions(exercises), trace_id="trace-orig"),
    )

    # Act
    copy = session_repo.duplicate(source.id, "user_trace")

    # Assert — the copy traces to the same call (operator-only accessor, ADR-0043/#274)
    assert session_repo.trace_id(copy.id, "user_trace") == "trace-orig"


def test_duplicate_preserves_superset_grouping(repos):
    # Arrange — a two-member Superset (ADR-0023)
    session_repo, exercises = repos
    source = session_repo.create("user_ss", _superset_draft(exercises))

    # Act
    copy = session_repo.duplicate(source.id, "user_ss")

    # Assert — full-fidelity: the grouping and group-owned round-rest survive intact
    assert [p.superset_group for p in copy.prescriptions] == ["A", "A"]
    assert [p.round_rest_seconds for p in copy.prescriptions] == [90, 90]


def test_duplicate_starts_with_a_fresh_regeneration_guard(repos):
    # Arrange — a source that has already spent its one regeneration
    session_repo, exercises = repos
    source = session_repo.create("user_regen", _draft_with_two_prescriptions(exercises))
    session_repo.regenerate(
        source.id, "user_regen", keep_positions=[0], replacements=[_replacement(exercises)]
    )

    # Act
    copy = session_repo.duplicate(source.id, "user_regen")

    # Assert — the copy is a new plan with its own regeneration budget
    assert copy.has_been_regenerated is False


def test_duplicate_does_not_serve_another_users_session(repos):
    # Arrange — Duplicate only ever copies the owner's own plan
    session_repo, exercises = repos
    source = session_repo.create("user_owner", _draft_with_two_prescriptions(exercises))

    # Act
    result = session_repo.duplicate(source.id, "user_intruder")

    # Assert — refused, and the owner's Session is untouched
    assert result is None
    assert session_repo.get(source.id, "user_owner") is not None


def test_duplicate_returns_none_for_an_unknown_session(repos):
    # Arrange
    session_repo, _ = repos

    # Assert
    assert session_repo.duplicate(987654, "user_any") is None


def test_duplicate_is_unlimited(repos):
    # Arrange — Duplicate is unlimited (ADR-0043), unlike Regeneration
    session_repo, exercises = repos
    source = session_repo.create("user_many", _draft_with_two_prescriptions(exercises))

    # Act — copy the source twice, and copy one of the copies
    first = session_repo.duplicate(source.id, "user_many")
    second = session_repo.duplicate(source.id, "user_many")
    third = session_repo.duplicate(first.id, "user_many")

    # Assert — none refused; every copy is a distinct, readable Session
    ids = {source.id, first.id, second.id, third.id}
    assert len(ids) == 4
    assert all(session_repo.get(i, "user_many") is not None for i in ids)


def test_duplicate_copies_no_logged_sessions(repos):
    # Arrange — a source Session with a performance logged against it. Duplicate copies
    # the plan, never the record: the copy is born with an empty logbook (ADR-0043).
    session_repo, exercises = repos
    source = session_repo.create("user_logs", _draft_with_two_prescriptions(exercises))
    logs = InMemoryLoggedSessionRepository(session_repo, exercises)
    squat_id = source.prescriptions[0].exercise_id
    logs.create(
        "user_logs",
        LoggedSessionDraft(
            session_id=source.id,
            performed_on=date(2026, 8, 1),
            training_type="strength",
            logged_sets=[LoggedSetDraft(exercise_id=squat_id)],
        ),
    )

    # Act
    copy = session_repo.duplicate(source.id, "user_logs")

    # Assert — no Logged Session points at the copy; the source keeps its own
    session_ids = [view.session_id for view in logs.list_for_user("user_logs")]
    assert copy.id not in session_ids
    assert source.id in session_ids


def test_duplicate_keeps_the_title_on_the_in_memory_path():
    # The in-memory fake is the test seam; seed a titled, Protocol-member source
    # directly because ``create`` only builds untitled standalone Sessions. This locks
    # the in-memory branch's verbatim ``title`` copy (the SQL branch is covered above).
    exercises = InMemoryExerciseRepository()
    repo = InMemorySessionRepository(exercises)
    squat = exercises.find_or_create("Back Squat", provenance=Provenance.AI_GENERATED)
    source = WorkoutSession(
        id=1,
        clerk_user_id="user_proto",
        training_type="strength",
        duration_minutes=60,
        provenance="ai_generated",
        protocol_id=7,
        objective="hypertrophy",
        week=2,
        day=1,
        position=3,
        title="Push Day",
    )
    repo._sessions[source.id] = source
    repo._prescriptions[source.id] = [
        ExercisePrescription(
            id=1, session_id=source.id, exercise_id=squat.id, position=0, sets=5, reps="5"
        )
    ]
    repo._next_id = 2

    # Act
    view = repo.duplicate(source.id, "user_proto")

    # Assert — standalone (Protocol position dropped), name carried verbatim
    assert view is not None
    copy = repo._sessions[view.id]
    assert copy.id != source.id
    assert copy.protocol_id is None
    assert copy.week is None and copy.day is None and copy.position is None
    assert copy.objective is None
    assert copy.title == "Push Day"


def test_duplicate_lifts_a_protocol_member_out_as_a_named_standalone():
    # Arrange — a Protocol-member, titled Session, seeded directly because ``create``
    # only builds standalone Sessions. SQL-backed so we can read the copy's raw row.
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as sql:
        exercises = SqlExerciseRepository(sql)
        repo = SqlSessionRepository(sql)
        squat = exercises.find_or_create(
            "Back Squat", provenance=Provenance.AI_GENERATED
        )
        # The Protocol the member Session belongs to must exist for the FK to hold.
        protocol = Protocol(
            clerk_user_id="user_proto",
            training_type="strength",
            objective="hypertrophy",
            sessions_per_week=3,
            weeks=4,
            duration_minutes=60,
        )
        sql.add(protocol)
        sql.commit()
        sql.refresh(protocol)
        source = WorkoutSession(
            clerk_user_id="user_proto",
            training_type="strength",
            duration_minutes=60,
            provenance="ai_generated",
            protocol_id=protocol.id,
            objective="hypertrophy",
            week=2,
            day=1,
            position=3,
            title="Push Day",
        )
        sql.add(source)
        sql.commit()
        sql.refresh(source)
        sql.add(
            ExercisePrescription(
                session_id=source.id, exercise_id=squat.id, position=0, sets=5, reps="5"
            )
        )
        sql.commit()

        # Act
        view = repo.duplicate(source.id, "user_proto")

        # Assert — a standalone copy: no Protocol linkage, name carried verbatim (Q9)
        assert view is not None
        copy = sql.get(WorkoutSession, view.id)
        assert copy.id != source.id
        assert copy.protocol_id is None
        assert copy.week is None and copy.day is None and copy.position is None
        assert copy.objective is None
        assert copy.title == "Push Day"
        assert [p.exercise_name for p in view.prescriptions] == ["Back Squat"]
