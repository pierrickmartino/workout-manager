"""Behavior of Switch, ``POST /api/protocols/{id}/switch`` (issue #638).

Switch makes a set-aside Protocol the Current Protocol again by stamping its
``made_current_at`` (ADR-0125). It is a plan-side choice: nothing is written to any
Session or Logged Session. Selection is observed through ``GET /api/home``, exercised end
to end with the in-memory repositories the Home endpoint tests inject."""

from __future__ import annotations

from datetime import date

from app.repositories.logged_session_repository import LoggedSetDraft
from tests.quantities import reps_quantity
from tests.test_home_endpoint import _abs, build_harness


def _switch(h, sub, protocol_id):
    return h.client.post(f"/api/protocols/{protocol_id}/switch", headers=h.auth(sub))


def _home_protocol_id(h, sub):
    return h.fetch_home(sub).json()["data"]["current_protocol"]["id"]


def test_switching_to_a_set_aside_protocol_makes_it_current_on_home():
    # Arrange — a newer generation set the older Protocol aside
    h = build_harness()
    older = h.adopt_protocol("user_switch")
    h.adopt_protocol("user_switch")

    # Act
    response = _switch(h, "user_switch", older.id)

    # Assert
    assert response.status_code == 200
    assert _home_protocol_id(h, "user_switch") == older.id


def test_switch_returns_the_new_current_protocols_progressed_view():
    # Arrange — the older Protocol's Week 1 is performed, so Week 2 is where it left off
    h = build_harness()
    older = h.adopt_protocol("user_view")
    h.perform("user_view", older.sessions[0].session_id)
    h.adopt_protocol("user_view")

    # Act
    body = _switch(h, "user_view", older.id).json()

    # Assert
    assert body["success"] is True
    assert body["data"]["id"] == older.id
    assert body["data"]["completed_count"] == 1
    assert body["data"]["next_session"]["session_id"] == older.sessions[1].session_id


def test_home_shows_the_switched_to_protocols_next_session_where_it_left_off():
    # Arrange
    h = build_harness()
    older = h.adopt_protocol("user_resume")
    h.perform("user_resume", older.sessions[0].session_id)
    h.adopt_protocol("user_resume")

    # Act
    _switch(h, "user_resume", older.id)

    # Assert
    current = h.fetch_home("user_resume").json()["data"]["current_protocol"]
    assert current["next_session"]["session_id"] == older.sessions[1].session_id


def test_the_protocol_switched_away_from_is_set_aside_and_can_be_switched_back_to():
    # Arrange
    h = build_harness()
    first = h.adopt_protocol("user_back")
    second = h.adopt_protocol("user_back")
    _switch(h, "user_back", first.id)

    # Act
    response = _switch(h, "user_back", second.id)

    # Assert
    assert response.status_code == 200
    assert _home_protocol_id(h, "user_back") == second.id


def test_a_switched_to_protocol_stays_current_until_a_later_generation_supersedes_it():
    # Arrange
    h = build_harness()
    older = h.adopt_protocol("user_hold")
    h.adopt_protocol("user_hold")
    _switch(h, "user_hold", older.id)
    assert _home_protocol_id(h, "user_hold") == older.id

    # Act
    newest = h.adopt_protocol("user_hold")

    # Assert
    assert _home_protocol_id(h, "user_hold") == newest.id


def test_switching_to_the_protocol_already_current_is_harmless():
    # Arrange
    h = build_harness()
    set_aside = h.adopt_protocol("user_twice")
    current = h.adopt_protocol("user_twice")

    # Act
    first = _switch(h, "user_twice", current.id)
    second = _switch(h, "user_twice", current.id)

    # Assert
    assert first.status_code == second.status_code == 200
    assert second.json()["data"]["id"] == current.id
    assert _home_protocol_id(h, "user_twice") == current.id
    index = h.client.get("/api/protocols", headers=h.auth("user_twice")).json()["data"]
    assert {row["id"]: row["status"] for row in index} == {
        current.id: "current",
        set_aside.id: "set_aside",
    }


def test_switch_is_404_for_a_protocol_that_does_not_exist():
    # Arrange
    h = build_harness()
    h.adopt_protocol("user_missing")

    # Act
    response = _switch(h, "user_missing", 9999)

    # Assert
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_switch_is_404_for_another_users_protocol_and_changes_nothing():
    # Arrange
    h = build_harness()
    theirs = h.adopt_protocol("user_owner")
    their_current = h.adopt_protocol("user_owner")

    # Act
    response = _switch(h, "user_intruder", theirs.id)

    # Assert
    assert response.status_code == 404
    assert response.json()["success"] is False
    assert _home_protocol_id(h, "user_owner") == their_current.id


def test_switch_is_409_for_a_finished_protocol_and_changes_nothing():
    # Arrange — every Session of the older Protocol is performed
    h = build_harness()
    finished = h.adopt_protocol("user_done")
    for session in finished.sessions:
        h.perform("user_done", session.session_id)
    current = h.adopt_protocol("user_done")

    # Act
    response = _switch(h, "user_done", finished.id)

    # Assert
    assert response.status_code == 409
    assert response.json()["success"] is False
    assert _home_protocol_id(h, "user_done") == current.id


def test_switch_requires_authentication():
    # Arrange
    h = build_harness()
    protocol = h.adopt_protocol("user_anon")

    # Act
    response = h.client.post(f"/api/protocols/{protocol.id}/switch")

    # Assert
    assert response.status_code == 401


def _records(h, sub):
    """Every record projection a Switch must leave alone: XP, Streak and the latest
    Personal Record from Home, and the History list."""

    home = h.fetch_home(sub).json()["data"]
    history = h.client.get("/api/logs", headers=h.auth(sub)).json()["data"]
    return home["gamification"], home["latest_pr"], history


def test_switch_leaves_xp_streak_personal_records_and_history_unchanged():
    # Arrange — real performances with an absolute-Load set, so every projection has data
    h = build_harness()
    older = h.adopt_protocol("user_records")
    squat = h.exercise_id("Back Squat")
    h.perform(
        "user_records",
        older.sessions[0].session_id,
        performed_on=date(2026, 7, 10),
        logged_sets=[
            LoggedSetDraft(
                exercise_id=squat, quantity=reps_quantity(3), load=_abs(120.0)
            )
        ],
    )
    h.adopt_protocol("user_records")
    before = _records(h, "user_records")

    # Act
    _switch(h, "user_records", older.id)

    # Assert
    after = _records(h, "user_records")
    assert after == before
    assert before[0]["xp"] > 0
    assert before[1] is not None
    assert len(before[2]) == 1
