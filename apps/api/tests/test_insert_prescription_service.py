"""Behavior of ``insert_prescription`` — the Insert author-service seam (ADR-0051).

Insert hand-authors one new Exercise Prescription into the user's own **standalone**
Session, in place, with **no AI call**: appended at the end, solo (non-Superset) in v1,
validated through the Builder's ``validate_deploy`` — the same gate Hand-Authored
authoring and Capture reuse. The seam under test is the service: given a Session and a
prescription draft, assert the resulting plan and the invariants it preserves —
observed through the return value and a re-read, not through ORM state.

Prior art: the Hand-Authored / Capture author-service tests around ``app/authoring``."""

from __future__ import annotations

from datetime import date

import pytest

from app.authoring.service import (
    AuthoredSessionInvalid,
    InsertTargetNotFound,
    insert_prescription,
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


def _standalone(sessions, exercises, owner="owner", provenance="ai_generated"):
    """A standalone Session owned by ``owner`` with a single Back Squat prescription."""
    squat = _exercise(exercises, "Back Squat")
    session = sessions.create(
        owner,
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            prescriptions=[_draft(squat.id, sets=5, reps="5")],
            provenance=provenance,
        ),
    )
    return session, squat


def test_insert_appends_the_prescription_last():
    # Arrange
    exercises, sessions, logged, profiles = _repos()
    session, squat = _standalone(sessions, exercises)
    press = _exercise(exercises, "Overhead Press")

    # Act
    view = insert_prescription(
        session.id,
        "owner",
        _draft(press.id, sets=4, reps="6-8"),
        sessions=sessions,
        exercises=exercises,
        profiles=profiles,
    )

    # Assert — the new prescription is last, fully specified, at the next position
    assert [p.exercise_id for p in view.prescriptions] == [squat.id, press.id]
    last = view.prescriptions[-1]
    assert last.position == 1
    assert last.sets == 4
    assert last.reps == "6-8"


def test_insert_leaves_ai_generated_provenance_unchanged():
    # Arrange — inserting into an AI plan must keep it AI-originated (ADR-0041/0051),
    # so Generation Feedback and Regeneration stay available.
    exercises, sessions, logged, profiles = _repos()
    session, _ = _standalone(sessions, exercises, provenance="ai_generated")
    press = _exercise(exercises, "Overhead Press")

    # Act
    view = insert_prescription(
        session.id,
        "owner",
        _draft(press.id),
        sessions=sessions,
        exercises=exercises,
        profiles=profiles,
    )

    # Assert
    assert view.provenance == "ai_generated"
    assert sessions.get(session.id, "owner").provenance == "ai_generated"


def test_insert_leaves_existing_logged_sessions_frozen():
    # Arrange — a standalone Session with one performed Logged Session (settled record)
    exercises, sessions, logged, profiles = _repos()
    session, squat = _standalone(sessions, exercises)
    press = _exercise(exercises, "Overhead Press")
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

    # Act — Insert edits only the plan
    insert_prescription(
        session.id,
        "owner",
        _draft(press.id),
        sessions=sessions,
        exercises=exercises,
        profiles=profiles,
    )

    # Assert — the record is untouched: a re-read shows it byte-for-byte the same
    assert logged.list_for_user("owner") == before


def test_insert_into_protocol_member_is_rejected_and_persists_nothing():
    # Arrange — a Protocol-member Session, seeded directly because ``create`` only builds
    # standalone Sessions. Adding inside a Protocol stays Deploy's job (ADR-0020/0021).
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
        member.id, [_draft(squat.id)]
    )
    sessions._next_id = 2

    # Act / Assert — rejected whole, naming the scope guard
    with pytest.raises(AuthoredSessionInvalid) as exc:
        insert_prescription(
            member.id,
            "owner",
            _draft(press.id),
            sessions=sessions,
            exercises=exercises,
            profiles=profiles,
        )
    assert any(error.code == "protocol_member" for error in exc.value.errors)
    # Nothing persisted — the plan still holds only its original prescription
    assert len(sessions.get(member.id, "owner").prescriptions) == 1


def test_insert_unknown_exercise_is_rejected_whole():
    # Arrange
    exercises, sessions, logged, profiles = _repos()
    session, _ = _standalone(sessions, exercises)

    # Act / Assert — the offending item is named; nothing is appended
    with pytest.raises(AuthoredSessionInvalid) as exc:
        insert_prescription(
            session.id,
            "owner",
            _draft(999999),
            sessions=sessions,
            exercises=exercises,
            profiles=profiles,
        )
    assert any(error.code == "unknown_exercise" for error in exc.value.errors)
    assert len(sessions.get(session.id, "owner").prescriptions) == 1


def test_insert_invalid_sets_is_rejected_whole():
    # Arrange — a validate_deploy failure (sets below the floor) rejects the whole add
    exercises, sessions, logged, profiles = _repos()
    session, _ = _standalone(sessions, exercises)
    press = _exercise(exercises, "Overhead Press")

    # Act / Assert
    with pytest.raises(AuthoredSessionInvalid):
        insert_prescription(
            session.id,
            "owner",
            _draft(press.id, sets=0),
            sessions=sessions,
            exercises=exercises,
            profiles=profiles,
        )
    assert len(sessions.get(session.id, "owner").prescriptions) == 1


def test_insert_into_missing_session_raises_not_found():
    # Arrange
    exercises, sessions, logged, profiles = _repos()
    squat = _exercise(exercises, "Back Squat")

    # Act / Assert
    with pytest.raises(InsertTargetNotFound):
        insert_prescription(
            999,
            "owner",
            _draft(squat.id),
            sessions=sessions,
            exercises=exercises,
            profiles=profiles,
        )


def test_insert_into_another_users_session_raises_not_found():
    # Arrange — Insert only ever edits the owner's own plan
    exercises, sessions, logged, profiles = _repos()
    session, _ = _standalone(sessions, exercises, owner="owner")
    press = _exercise(exercises, "Overhead Press")

    # Act / Assert — a non-owner sees the Session as if it does not exist
    with pytest.raises(InsertTargetNotFound):
        insert_prescription(
            session.id,
            "intruder",
            _draft(press.id),
            sessions=sessions,
            exercises=exercises,
            profiles=profiles,
        )
