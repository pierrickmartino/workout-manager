"""Behavior of Delete, ``DELETE /api/protocols/{id}`` (issue #639).

A Protocol the user adopted but never trained (no Logged Session of any Completion
Outcome against any member Session) can be hard-deleted together with its plan-side
dependents (ADR-0125). The index carries the server-computed ``deletable`` that offers it,
and the delete re-checks it, so a Session logged in between turns into a ``409`` rather
than a lost record. Exercised end to end with the in-memory repositories the Home endpoint
tests inject."""

from __future__ import annotations

from datetime import date

from app.domain.completion import CompletionOutcome
from app.domain.feedback import Verdict
from app.repositories.deps import (
    get_generation_feedback_repository,
    get_protocol_repository,
)
from app.repositories.generation_feedback_repository import (
    InMemoryGenerationFeedbackRepository,
)
from app.repositories.logged_session_repository import LoggedSessionDraft
from app.repositories.protocol_repository import ProtocolStarted
from tests.test_home_endpoint import build_harness


def _index_rows(h, sub) -> dict[int, dict]:
    response = h.client.get("/api/protocols", headers=h.auth(sub))
    return {row["id"]: row for row in response.json()["data"]}


def _log(h, sub, session_id, outcome: CompletionOutcome):
    h.logged.create(
        sub,
        LoggedSessionDraft(
            session_id=session_id,
            performed_on=date(2026, 3, 1),
            completion_outcome=outcome.value,
        ),
    )


def test_an_unstarted_protocol_is_deletable_on_the_index():
    # Arrange
    h = build_harness()
    protocol = h.adopt_protocol("user_fresh")

    # Act
    rows = _index_rows(h, "user_fresh")

    # Assert
    assert rows[protocol.id]["deletable"] is True


def test_a_protocol_with_a_completed_logged_session_is_not_deletable():
    # Arrange
    h = build_harness()
    protocol = h.adopt_protocol("user_done_one")
    _log(h, "user_done_one", protocol.sessions[0].session_id, CompletionOutcome.COMPLETED)

    # Act
    rows = _index_rows(h, "user_done_one")

    # Assert
    assert rows[protocol.id]["deletable"] is False


def test_a_protocol_with_only_an_incomplete_logged_session_is_not_deletable():
    # Arrange — an Incomplete log performs nothing, but it is still logged training
    h = build_harness()
    protocol = h.adopt_protocol("user_tried")
    _log(h, "user_tried", protocol.sessions[0].session_id, CompletionOutcome.INCOMPLETE)

    # Act
    rows = _index_rows(h, "user_tried")

    # Assert
    assert rows[protocol.id]["performed_count"] == 0
    assert rows[protocol.id]["deletable"] is False


def _harness():
    """The Home harness plus an in-memory Generation Feedback repository, the one plan-side
    dependent of a member Session that lives outside the Protocol repository."""

    h = build_harness()
    h.feedback = InMemoryGenerationFeedbackRepository()
    h.client.app.dependency_overrides[get_generation_feedback_repository] = (
        lambda: h.feedback
    )
    return h


def _delete(h, sub, protocol_id):
    return h.client.delete(f"/api/protocols/{protocol_id}", headers=h.auth(sub))


def test_deleting_an_unstarted_protocol_removes_it_and_its_plan_side_dependents():
    # Arrange — a Calibration and a Generation Feedback hang off the plan
    h = _harness()
    protocol = h.adopt_protocol("user_oops")
    member = protocol.sessions[0].session_id
    h.client.post(
        f"/api/protocols/{protocol.id}/calibrate",
        json={"calibration": 1},
        headers=h.auth("user_oops"),
    )
    h.feedback.record("user_oops", session_id=member, verdict=Verdict.NEGATIVE)

    # Act
    response = _delete(h, "user_oops", protocol.id)

    # Assert
    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "data": {"id": protocol.id},
        "error": None,
    }
    read = h.client.get(f"/api/protocols/{protocol.id}", headers=h.auth("user_oops"))
    assert read.status_code == 404
    assert _index_rows(h, "user_oops") == {}
    assert h.feedback.latest(member, "user_oops") is None


def test_delete_is_404_for_a_protocol_that_does_not_exist():
    # Arrange
    h = _harness()
    h.adopt_protocol("user_missing")

    # Act
    response = _delete(h, "user_missing", 9999)

    # Assert
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_delete_is_404_for_another_users_protocol_and_removes_nothing():
    # Arrange
    h = _harness()
    theirs = h.adopt_protocol("user_owner")

    # Act
    response = _delete(h, "user_intruder", theirs.id)

    # Assert
    assert response.status_code == 404
    assert response.json()["success"] is False
    assert theirs.id in _index_rows(h, "user_owner")


def test_delete_is_409_for_a_started_protocol_whatever_the_completion_outcome():
    # Arrange — one Protocol with a Completed log, one with only an Incomplete one
    h = _harness()
    completed = h.adopt_protocol("user_started")
    _log(h, "user_started", completed.sessions[0].session_id, CompletionOutcome.COMPLETED)
    incomplete = h.adopt_protocol("user_started")
    _log(
        h, "user_started", incomplete.sessions[0].session_id, CompletionOutcome.INCOMPLETE
    )

    # Act
    responses = [_delete(h, "user_started", p.id) for p in (completed, incomplete)]

    # Assert
    assert [r.status_code for r in responses] == [409, 409]
    assert all(r.json()["success"] is False for r in responses)
    assert set(_index_rows(h, "user_started")) == {completed.id, incomplete.id}


def test_a_session_logged_after_the_index_read_turns_the_delete_into_a_409():
    # Arrange — the client draws the index while the Protocol is still un-started
    h = _harness()
    protocol = h.adopt_protocol("user_race")
    member = protocol.sessions[0].session_id
    h.feedback.record("user_race", session_id=member, verdict=Verdict.POSITIVE)
    assert _index_rows(h, "user_race")[protocol.id]["deletable"] is True
    _log(h, "user_race", member, CompletionOutcome.COMPLETED)  # lands in between

    # Act
    response = _delete(h, "user_race", protocol.id)

    # Assert — refused, with the plan, its feedback and the record all intact
    assert response.status_code == 409
    read = h.client.get(f"/api/protocols/{protocol.id}", headers=h.auth("user_race"))
    assert read.status_code == 200
    assert read.json()["data"]["completed_count"] == 1
    assert h.feedback.latest(member, "user_race") is not None
    history = h.client.get("/api/logs", headers=h.auth("user_race")).json()["data"]
    assert len(history) == 1


class _LogLandsMidDelete:
    """A Protocol repository whose delete meets a Logged Session committed after the guard
    read — what the FK-enforcing database reports as ``ProtocolStarted`` (the SQL refusal
    itself is exercised in the repository suite)."""

    def __init__(self, inner) -> None:
        self._inner = inner

    def get(self, protocol_id, clerk_user_id):
        return self._inner.get(protocol_id, clerk_user_id)

    def delete(self, protocol_id, clerk_user_id):
        raise ProtocolStarted


def test_a_session_logged_during_the_delete_is_a_409_not_a_server_error():
    # Arrange
    h = _harness()
    protocol = h.adopt_protocol("user_mid")
    h.client.app.dependency_overrides[get_protocol_repository] = lambda: _LogLandsMidDelete(
        h.protocols
    )

    # Act
    response = _delete(h, "user_mid", protocol.id)

    # Assert
    assert response.status_code == 409
    assert response.json()["success"] is False


def test_deleting_the_unstarted_current_protocol_falls_back_to_the_next_most_recently_current():
    # Arrange — oldest was switched to last, so it outranks middle once newest is gone
    h = _harness()
    oldest = h.adopt_protocol("user_fallback")
    h.adopt_protocol("user_fallback")
    h.client.post(
        f"/api/protocols/{oldest.id}/switch", headers=h.auth("user_fallback")
    )
    newest = h.adopt_protocol("user_fallback")

    # Act
    response = _delete(h, "user_fallback", newest.id)

    # Assert
    assert response.status_code == 200
    home = h.fetch_home("user_fallback").json()["data"]
    assert home["current_protocol"]["id"] == oldest.id


def test_deleting_the_only_unfinished_protocol_leaves_home_in_the_empty_state():
    # Arrange — a Finished Protocol remains, but nothing unfinished
    h = _harness()
    finished = h.adopt_protocol("user_empty")
    for session in finished.sessions:
        h.perform("user_empty", session.session_id)
    fresh = h.adopt_protocol("user_empty")

    # Act
    response = _delete(h, "user_empty", fresh.id)

    # Assert
    assert response.status_code == 200
    assert h.fetch_home("user_empty").json()["data"]["current_protocol"] is None


def test_delete_requires_authentication():
    # Arrange
    h = _harness()
    protocol = h.adopt_protocol("user_anon")

    # Act
    response = h.client.delete(f"/api/protocols/{protocol.id}")

    # Assert
    assert response.status_code == 401
