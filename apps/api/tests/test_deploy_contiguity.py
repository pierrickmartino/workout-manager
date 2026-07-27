"""Confidence test for the Builder's contiguous-prefix assumption (ADR-0034 / ADR-0020).

``reenumerate_tail`` (Module A of the Builder) folds the *frozen performed prefix* and
the *desired un-performed tail* into one enumerated Session sequence, passing the prefix
through byte-for-byte. That is only sound if the performed Sessions are a **contiguous
prefix** by position — never a holed set like ``{position 0, position 2}``. If a hole
could arise, a DEPLOY would place the un-performed middle Session *after* a performed
later one, reordering settled record — exactly what ADR-0020 forbids.

Log Correction's contiguity gate (ADR-0034) is what guarantees the hole can never arise:
it refuses any delete that would remove a mid-Protocol Session while a later-positioned
one is performed. This test asserts that guarantee end to end — the performed set the
DEPLOY path reads (``protocol_progress.performed_session_ids``) stays a contiguous prefix
across every *permitted* correction, and the fold reproduces the prefix untouched. Offline
over the in-memory repositories; no HTTP.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.domain.exercise import Provenance
from app.logbook.correction import ContiguityError, delete_session
from app.protocols.progress import protocol_progress
from app.protocols.reenumeration import EnumeratedSession, TailSession, reenumerate_tail
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
from app.repositories.session_repository import InMemorySessionRepository, PrescriptionDraft
from tests.quantities import reps_quantity

OWNER = "user_builder"


def _wire():
    exercises = InMemoryExerciseRepository()
    protocols = InMemoryProtocolRepository(exercises)
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    return protocols, exercises, logged


def _three_session_protocol(protocols, exercises):
    squat = exercises.find_or_create("Back Squat", provenance=Provenance.AI_GENERATED)
    return (
        protocols.create(
            OWNER,
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
        ),
        squat,
    )


def _perform(logged, protocol, index, squat):
    return logged.create(
        OWNER,
        LoggedSessionDraft(
            session_id=protocol.sessions[index].session_id,
            training_type="strength",
            performed_on=date(2026, 6, 20 + index),
            completion_outcome="completed",
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5))],
        ),
    )


def _performed_positions(protocol, performed_ids):
    return sorted(
        session.position
        for session in protocol.sessions
        if session.session_id in performed_ids
    )


def _is_contiguous_prefix(positions):
    """Whether ``positions`` occupy an unbroken run 0, 1, … — the Builder's assumption."""
    return positions == list(range(len(positions)))


def test_every_mid_protocol_delete_that_would_hole_the_prefix_is_refused():
    # Arrange — a three-Session Protocol with all three performed (prefix {0, 1, 2})
    protocols, exercises, logged = _wire()
    protocol, squat = _three_session_protocol(protocols, exercises)
    performed_logs = [_perform(logged, protocol, i, squat) for i in range(3)]

    # Act / Assert — deleting either non-last Session would hole the prefix, so the gate
    # refuses both, leaving no way to reach a non-contiguous performed set.
    for mid_index in (0, 1):
        with pytest.raises(ContiguityError):
            delete_session(
                performed_logs[mid_index].id,
                OWNER,
                protocols=protocols,
                logged=logged,
            )

    # The performed set the DEPLOY path reads is still the whole contiguous prefix.
    progress = protocol_progress(OWNER, protocol.id, protocols=protocols, logged=logged)
    positions = _performed_positions(protocol, progress.performed_session_ids)
    assert _is_contiguous_prefix(positions)
    assert positions == [0, 1, 2]


def test_a_permitted_delete_keeps_the_deploy_prefix_contiguous_and_foldable():
    # Arrange — perform all three, then delete the last (permitted, tail-first)
    protocols, exercises, logged = _wire()
    protocol, squat = _three_session_protocol(protocols, exercises)
    performed_logs = [_perform(logged, protocol, i, squat) for i in range(3)]
    delete_session(performed_logs[2].id, OWNER, protocols=protocols, logged=logged)

    # Act — read the performed set exactly as the deploy route does
    progress = protocol_progress(OWNER, protocol.id, protocols=protocols, logged=logged)
    performed = progress.performed_session_ids

    # Assert — still a contiguous prefix {0, 1}, and the fold preserves it byte-for-byte
    positions = _performed_positions(protocol, performed)
    assert _is_contiguous_prefix(positions)
    assert positions == [0, 1]

    prefix = [
        EnumeratedSession(
            session_id=session.session_id,
            position=session.position,
            week=session.week,
            day=session.day,
        )
        for session in protocol.sessions
        if session.session_id in performed
    ]
    tail = [
        TailSession(session_id=session.session_id, week=session.week, day=session.day)
        for session in protocol.sessions
        if session.session_id not in performed
    ]
    enumerated = reenumerate_tail(prefix, tail)

    # Positions run unbroken across the whole plan, and the performed prefix is unchanged.
    assert [s.position for s in enumerated] == [0, 1, 2]
    assert enumerated[: len(prefix)] == prefix
