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
    ContiguityError,
    CorrectSessionRequest,
    LogNotFoundError,
    correct_session,
    delete_session,
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
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.protocol_repository import (
    InMemoryProtocolRepository,
    ProtocolDraft,
    ProtocolSessionDraft,
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


# --- Delete (ADR-0034, contiguity gate) ---------------------------------------------


def _protocol_with_three_sessions(protocols, exercises, owner="user_owner"):
    """Adopt a three-Session Protocol and return (protocol_view, squat)."""
    squat = exercises.find_or_create("Back Squat", provenance=Provenance.AI_GENERATED)
    protocol = protocols.create(
        owner,
        ProtocolDraft(
            training_type="strength",
            objective="build",
            sessions_per_week=3,
            weeks=1,
            duration_minutes=45,
            sessions=[
                ProtocolSessionDraft(
                    week=1,
                    day=day,
                    prescriptions=[
                        PrescriptionDraft(exercise_id=squat.id, sets=5, reps="5")
                    ],
                )
                for day in (1, 2, 3)
            ],
        ),
    )
    return protocol, squat


def _perform(logged, protocol, index, squat, owner="user_owner", outcome="completed"):
    """Record a performance of the Protocol's Session at ``index`` and return its view."""
    return logged.create(
        owner,
        LoggedSessionDraft(
            session_id=protocol.sessions[index].session_id,
            training_type="strength",
            performed_on=date(2026, 6, 20 + index),
            completion_outcome=outcome,
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5))],
        ),
    )


def _wire_with_protocols():
    exercises = InMemoryExerciseRepository()
    protocols = InMemoryProtocolRepository(exercises)
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    return protocols, exercises, sessions, logged


def test_delete_of_the_last_performed_session_succeeds():
    # Arrange — a Protocol whose first two Sessions are performed (contiguous prefix)
    protocols, exercises, _, logged = _wire_with_protocols()
    protocol, squat = _protocol_with_three_sessions(protocols, exercises)
    _perform(logged, protocol, 0, squat)
    last = _perform(logged, protocol, 1, squat)

    # Act — delete the most recent performance (redo the Session you just botched)
    delete_session(last.id, "user_owner", protocols=protocols, logged=logged)

    # Assert — the record is gone; the prefix stays contiguous
    assert logged.get(last.id, "user_owner") is None
    assert len(logged.list_for_user("user_owner")) == 1


def test_delete_of_a_mid_protocol_session_with_a_later_performed_one_is_refused():
    # Arrange — Sessions 1 and 2 performed; the target is the mid-Protocol Session 1
    protocols, exercises, _, logged = _wire_with_protocols()
    protocol, squat = _protocol_with_three_sessions(protocols, exercises)
    first = _perform(logged, protocol, 0, squat)
    _perform(logged, protocol, 1, squat)

    # Act / Assert — refused: a later Session is performed, so deleting opens a hole
    with pytest.raises(ContiguityError):
        delete_session(first.id, "user_owner", protocols=protocols, logged=logged)

    # And nothing was removed
    assert logged.get(first.id, "user_owner") is not None


def test_delete_of_a_mid_protocol_session_with_no_later_performed_one_succeeds():
    # Arrange — only the first Session is performed
    protocols, exercises, _, logged = _wire_with_protocols()
    protocol, squat = _protocol_with_three_sessions(protocols, exercises)
    first = _perform(logged, protocol, 0, squat)

    # Act — no later Session is performed, so no hole opens
    delete_session(first.id, "user_owner", protocols=protocols, logged=logged)

    # Assert
    assert logged.get(first.id, "user_owner") is None


def test_delete_of_a_plan_less_record_succeeds():
    # Arrange — an ad-hoc, standalone record (ADR-0031): never gates a Protocol
    protocols, exercises, _, logged = _wire_with_protocols()
    running = exercises.find_or_create("Running", provenance=Provenance.CURATED)
    record = logged.create(
        "user_owner",
        LoggedSessionDraft(
            session_id=None,
            training_type="cardio",
            performed_on=date(2026, 6, 20),
            logged_sets=[LoggedSetDraft(exercise_id=running.id, quantity=reps_quantity(30))],
        ),
    )

    # Act
    delete_session(record.id, "user_owner", protocols=protocols, logged=logged)

    # Assert
    assert logged.get(record.id, "user_owner") is None


def test_delete_of_a_standalone_session_not_in_any_protocol_succeeds():
    # Arrange — the user owns a Protocol, but the target performance is of a standalone
    # Session that belongs to no Protocol: it has no position to un-settle.
    protocols, exercises, sessions, logged = _wire_with_protocols()
    _protocol_with_three_sessions(protocols, exercises)  # an unrelated owned Protocol
    squat = exercises.find_or_create("Deadlift", provenance=Provenance.AI_GENERATED)
    standalone = sessions.create(
        "user_owner",
        SessionDraft(
            training_type="strength",
            duration_minutes=30,
            prescriptions=[PrescriptionDraft(exercise_id=squat.id, sets=3, reps="5")],
        ),
    )
    record = logged.create(
        "user_owner",
        LoggedSessionDraft(
            session_id=standalone.id,
            training_type="strength",
            performed_on=date(2026, 6, 25),
            completion_outcome="completed",
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5))],
        ),
    )

    # Act — the target's Session is in no Protocol ordering, so the gate allows it
    delete_session(record.id, "user_owner", protocols=protocols, logged=logged)

    # Assert
    assert logged.get(record.id, "user_owner") is None


def test_delete_of_another_users_log_raises_not_found():
    # Arrange — user_owner's record
    protocols, exercises, _, logged = _wire_with_protocols()
    protocol, squat = _protocol_with_three_sessions(protocols, exercises)
    record = _perform(logged, protocol, 0, squat)

    # Act / Assert — a stranger cannot delete it (surfaces as 404 at the route)
    with pytest.raises(LogNotFoundError):
        delete_session(record.id, "user_stranger", protocols=protocols, logged=logged)
    assert logged.get(record.id, "user_owner") is not None


# --- Completion Outcome correction (ADR-0034, contiguity gate) -----------------------


def _correct_outcome(logged, exercises, protocols, record, squat, outcome):
    """Correct only ``record``'s Completion Outcome, re-sending its one squat set."""
    return correct_session(
        CorrectSessionRequest(
            log_id=record.id,
            performed_on=record.performed_on,
            completion_outcome=outcome,
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5))],
        ),
        "user_owner",
        exercises=exercises,
        logged=logged,
        protocols=protocols,
    )


def test_flip_to_incomplete_of_the_last_performed_session_succeeds():
    # Arrange — a Protocol whose first two Sessions are Completed (contiguous prefix)
    protocols, exercises, _, logged = _wire_with_protocols()
    protocol, squat = _protocol_with_three_sessions(protocols, exercises)
    _perform(logged, protocol, 0, squat)
    last = _perform(logged, protocol, 1, squat)

    # Act — un-complete the most recent performance (redo the Session you mis-declared)
    updated = _correct_outcome(logged, exercises, protocols, last, squat, "incomplete")

    # Assert — the outcome flips; the record stays put, its Session and id preserved
    assert updated.id == last.id
    assert updated.completion_outcome == "incomplete"
    assert updated.session_id == protocol.sessions[1].session_id


def test_flip_to_incomplete_of_a_mid_protocol_session_with_a_later_performed_one_is_refused():
    # Arrange — Sessions 1 and 2 Completed; the target is the mid-Protocol Session 1
    protocols, exercises, _, logged = _wire_with_protocols()
    protocol, squat = _protocol_with_three_sessions(protocols, exercises)
    first = _perform(logged, protocol, 0, squat)
    _perform(logged, protocol, 1, squat)

    # Act / Assert — refused: un-completing it would open a hole (later Session performed)
    with pytest.raises(ContiguityError):
        _correct_outcome(logged, exercises, protocols, first, squat, "incomplete")

    # And nothing changed — the outcome is still Completed
    assert logged.get(first.id, "user_owner").completion_outcome == "completed"


def test_flip_to_completed_is_allowed_even_when_a_later_session_is_performed():
    # Arrange — a mid-Protocol Session logged Incomplete while a later one is Completed.
    # Marking it Completed only fills the performed set, so it is never gated.
    protocols, exercises, _, logged = _wire_with_protocols()
    protocol, squat = _protocol_with_three_sessions(protocols, exercises)
    first = _perform(logged, protocol, 0, squat, outcome="incomplete")
    _perform(logged, protocol, 1, squat)

    # Act
    updated = _correct_outcome(logged, exercises, protocols, first, squat, "completed")

    # Assert — the fill direction succeeds
    assert updated.completion_outcome == "completed"


def test_data_only_correction_preserves_the_outcome_when_none_is_supplied():
    # Arrange — a Completed performance; a contents-only correction sends no outcome
    protocols, exercises, _, logged = _wire_with_protocols()
    protocol, squat = _protocol_with_three_sessions(protocols, exercises)
    record = _perform(logged, protocol, 0, squat)

    # Act — correct the reps only, leaving completion_outcome unset (None)
    updated = correct_session(
        CorrectSessionRequest(
            log_id=record.id,
            performed_on=record.performed_on,
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(6))],
        ),
        "user_owner",
        exercises=exercises,
        logged=logged,
        protocols=protocols,
    )

    # Assert — the record's own outcome is preserved (Slice 1 behavior, now with the gate)
    assert updated.completion_outcome == "completed"


def test_adding_an_off_plan_set_keeps_completed_and_never_trips_contiguity():
    # Characterization guard (issue #358): the record-side "add a movement" flow relies
    # on the correction path already accepting an off-plan Catalog Exercise and full-
    # replacing the record's sets. Pin the two invariants the frontend seam leans on —
    # a Completed record stays Completed, and adding attempted work never trips the
    # contiguity gate — even in the sharpest case: a mid-Protocol Session with a *later*
    # performed Session (where a delete or flip-to-Incomplete would be refused).
    protocols, exercises, _, logged = _wire_with_protocols()
    protocol, squat = _protocol_with_three_sessions(protocols, exercises)
    first = _perform(logged, protocol, 0, squat)  # Completed, mid-Protocol
    _perform(logged, protocol, 1, squat)  # a later Session is performed
    curl = exercises.find_or_create("Bicep Curl", provenance=Provenance.CURATED)

    # Act — a contents-only correction (no outcome supplied) that appends an off-plan set
    # the plan never prescribed, re-sending the record's own squat set unchanged.
    updated = correct_session(
        CorrectSessionRequest(
            log_id=first.id,
            performed_on=first.performed_on,
            logged_sets=[
                LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5)),
                LoggedSetDraft(exercise_id=curl.id, quantity=reps_quantity(12), load="15kg"),
            ],
        ),
        "user_owner",
        exercises=exercises,
        logged=logged,
        protocols=protocols,
    )

    # Assert — the off-plan set persists as an ordinary set; the record stays Completed
    # (Completion Outcome is over *prescribed* sets, ADR-0013), its Session and id are
    # preserved, and no ContiguityError was raised (ADR-0034).
    assert updated.id == first.id
    assert updated.session_id == protocol.sessions[0].session_id
    assert updated.completion_outcome == "completed"
    assert [s.exercise_id for s in updated.logged_sets] == [squat.id, curl.id]


def test_plan_less_correction_supplying_an_outcome_is_rejected():
    # Arrange — an ad-hoc, plan-less record gates no Protocol and declares no outcome
    sessions, exercises, logged, profiles = _wire()
    protocols = InMemoryProtocolRepository(exercises)
    view, running = _log_plan_less(exercises, logged, profiles)

    # Act / Assert — supplying a Completion Outcome violates the boundary rule (422)
    with pytest.raises(LogKindError):
        correct_session(
            CorrectSessionRequest(
                log_id=view.id,
                performed_on=date(2026, 7, 1),
                training_type="cardio",
                completion_outcome="incomplete",
                logged_sets=[LoggedSetDraft(exercise_id=running.id, quantity=reps_quantity(20))],
            ),
            "user_owner",
            exercises=exercises,
            logged=logged,
            protocols=protocols,
        )
