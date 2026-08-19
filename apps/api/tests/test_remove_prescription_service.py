"""Behavior of ``remove_prescription`` — the Remove author-service seam (ADR-0052).

Remove withdraws one Exercise Prescription from the user's own **standalone** Session,
in place, with **no AI call** — Insert's symmetric partner. It is plan-only (records
frozen), provenance-immutable, standalone-only, and rejected whole on any guard. The
seam under test is the service: given a Session and a position, assert the resulting
plan and the invariants it preserves — observed through the return value and a re-read,
not through ORM state.

Two behaviors live in the repository the service drives and are asserted here through
the returned view: surviving prescriptions are **re-numbered contiguous**, and a Superset
left with a single survivor is **dissolved to a solo** prescription (Q5).

Prior art: the Insert author-service tests around ``app/authoring``."""

from __future__ import annotations

from datetime import date

import pytest

from app.authoring.service import (
    AuthoredSessionInvalid,
    RemoveTargetNotFound,
    remove_prescription,
)
from app.db.models import WorkoutSession
from app.domain.exercise import Provenance
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.profile_repository import InMemoryProfileRepository
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft,
    SessionDraft,
)
from tests.quantities import reps_quantity


def _repos():
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    profiles = InMemoryProfileRepository()
    return exercises, sessions, logged, profiles


def _exercise(exercises, name):
    return exercises.find_or_create(name, provenance=Provenance.AI_GENERATED)


def _draft(exercise_id, **overrides):
    base = dict(exercise_id=exercise_id, sets=3, reps="8-10", rest_seconds=90)
    base.update(overrides)
    return PrescriptionDraft(**base)


def _session_with(sessions, exercises, drafts, owner="owner", provenance="ai_generated"):
    return sessions.create(
        owner,
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            prescriptions=drafts,
            provenance=provenance,
        ),
    )


def test_remove_drops_the_targeted_prescription_and_renumbers():
    # Arrange — three solo prescriptions
    exercises, sessions, logged, profiles = _repos()
    squat = _exercise(exercises, "Back Squat")
    press = _exercise(exercises, "Overhead Press")
    row = _exercise(exercises, "Barbell Row")
    session = _session_with(
        sessions, exercises, [_draft(squat.id), _draft(press.id), _draft(row.id)]
    )

    # Act — remove the middle prescription
    view = remove_prescription(session.id, "owner", 1, sessions=sessions)

    # Assert — the survivors are re-numbered contiguous 0..n-1, in order
    assert [p.exercise_id for p in view.prescriptions] == [squat.id, row.id]
    assert [p.position for p in view.prescriptions] == [0, 1]


def test_remove_dissolves_a_superset_left_with_one_survivor():
    # Arrange — a two-member Superset "A" plus a solo movement
    exercises, sessions, logged, profiles = _repos()
    squat = _exercise(exercises, "Back Squat")
    press = _exercise(exercises, "Overhead Press")
    row = _exercise(exercises, "Barbell Row")
    session = _session_with(
        sessions,
        exercises,
        [
            _draft(squat.id, sets=3, superset_group="A", round_rest_seconds=120),
            _draft(press.id, sets=3, superset_group="A", round_rest_seconds=120),
            _draft(row.id),
        ],
    )

    # Act — remove one member of the Superset
    view = remove_prescription(session.id, "owner", 0, sessions=sessions)

    # Assert — the lone survivor of group "A" is dissolved to a valid solo prescription
    assert [p.exercise_id for p in view.prescriptions] == [press.id, row.id]
    dissolved = view.prescriptions[0]
    assert dissolved.superset_group is None
    assert dissolved.round_rest_seconds is None


def test_remove_keeps_a_superset_that_still_has_two_members():
    # Arrange — a three-member Superset "A"
    exercises, sessions, logged, profiles = _repos()
    a = _exercise(exercises, "Back Squat")
    b = _exercise(exercises, "Overhead Press")
    c = _exercise(exercises, "Barbell Row")
    session = _session_with(
        sessions,
        exercises,
        [
            _draft(a.id, sets=3, superset_group="A", round_rest_seconds=120),
            _draft(b.id, sets=3, superset_group="A", round_rest_seconds=120),
            _draft(c.id, sets=3, superset_group="A", round_rest_seconds=120),
        ],
    )

    # Act — remove one member; two remain, so the group survives
    view = remove_prescription(session.id, "owner", 2, sessions=sessions)

    # Assert — both survivors keep the group tag and round-rest
    assert all(p.superset_group == "A" for p in view.prescriptions)
    assert all(p.round_rest_seconds == 120 for p in view.prescriptions)


def test_remove_leaves_ai_generated_provenance_unchanged():
    # Arrange — removing from an AI plan must keep it AI-originated (ADR-0041/0052)
    exercises, sessions, logged, profiles = _repos()
    squat = _exercise(exercises, "Back Squat")
    press = _exercise(exercises, "Overhead Press")
    session = _session_with(
        sessions, exercises, [_draft(squat.id), _draft(press.id)], provenance="ai_generated"
    )

    # Act
    view = remove_prescription(session.id, "owner", 0, sessions=sessions)

    # Assert
    assert view.provenance == "ai_generated"
    assert sessions.get(session.id, "owner").provenance == "ai_generated"


def test_remove_leaves_existing_logged_sessions_frozen():
    # Arrange — a standalone Session with two prescriptions and one performed record
    exercises, sessions, logged, profiles = _repos()
    squat = _exercise(exercises, "Back Squat")
    press = _exercise(exercises, "Overhead Press")
    session = _session_with(sessions, exercises, [_draft(squat.id), _draft(press.id)])
    logged.create(
        "owner",
        LoggedSessionDraft(
            session_id=session.id,
            performed_on=date(2026, 6, 20),
            training_type="strength",
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5))],
        ),
    )
    before = logged.list_for_user("owner")

    # Act — Remove edits only the plan
    remove_prescription(session.id, "owner", 1, sessions=sessions)

    # Assert — the record is untouched: a re-read shows it byte-for-byte the same
    assert logged.list_for_user("owner") == before


def test_remove_last_remaining_prescription_is_rejected_whole():
    # Arrange — a single-prescription Session (Q4: a Session must keep one movement)
    exercises, sessions, logged, profiles = _repos()
    squat = _exercise(exercises, "Back Squat")
    session = _session_with(sessions, exercises, [_draft(squat.id)])

    # Act / Assert — rejected whole, naming the empty-guard; nothing removed
    with pytest.raises(AuthoredSessionInvalid) as exc:
        remove_prescription(session.id, "owner", 0, sessions=sessions)
    assert any(error.code == "would_empty_session" for error in exc.value.errors)
    assert len(sessions.get(session.id, "owner").prescriptions) == 1


def test_remove_from_protocol_member_is_rejected_and_persists_nothing():
    # Arrange — a Protocol-member Session, seeded directly because ``create`` only builds
    # standalone Sessions. Removing inside a Protocol stays Deploy's job (ADR-0020/0021).
    exercises, sessions, logged, profiles = _repos()
    squat = _exercise(exercises, "Back Squat")
    press = _exercise(exercises, "Overhead Press")
    member = WorkoutSession(
        id=1,
        clerk_user_id="owner",
        training_type="strength",
        duration_minutes=60,
        provenance="ai_generated",
        protocol_id=7,
        week=1,
        day=1,
        position=0,
    )
    sessions._sessions[member.id] = member
    sessions._prescriptions[member.id] = sessions._materialize(
        member.id, [_draft(squat.id), _draft(press.id)]
    )
    sessions._next_id = 2

    # Act / Assert — rejected whole, naming the scope guard; nothing removed
    with pytest.raises(AuthoredSessionInvalid) as exc:
        remove_prescription(member.id, "owner", 0, sessions=sessions)
    assert any(error.code == "protocol_member" for error in exc.value.errors)
    assert len(sessions.get(member.id, "owner").prescriptions) == 2


def test_remove_missing_position_raises_not_found():
    # Arrange — a two-prescription Session
    exercises, sessions, logged, profiles = _repos()
    squat = _exercise(exercises, "Back Squat")
    press = _exercise(exercises, "Overhead Press")
    session = _session_with(sessions, exercises, [_draft(squat.id), _draft(press.id)])

    # Act / Assert — a position with no prescription is a not-found; nothing removed
    with pytest.raises(RemoveTargetNotFound):
        remove_prescription(session.id, "owner", 9, sessions=sessions)
    assert len(sessions.get(session.id, "owner").prescriptions) == 2


def test_remove_from_missing_session_raises_not_found():
    # Arrange
    exercises, sessions, logged, profiles = _repos()

    # Act / Assert
    with pytest.raises(RemoveTargetNotFound):
        remove_prescription(999, "owner", 0, sessions=sessions)


def test_remove_from_another_users_session_raises_not_found():
    # Arrange — Remove only ever edits the owner's own plan
    exercises, sessions, logged, profiles = _repos()
    squat = _exercise(exercises, "Back Squat")
    press = _exercise(exercises, "Overhead Press")
    session = _session_with(
        sessions, exercises, [_draft(squat.id), _draft(press.id)], owner="owner"
    )

    # Act / Assert — a non-owner sees the Session as if it does not exist
    with pytest.raises(RemoveTargetNotFound):
        remove_prescription(session.id, "intruder", 0, sessions=sessions)
    assert len(sessions.get(session.id, "owner").prescriptions) == 2
