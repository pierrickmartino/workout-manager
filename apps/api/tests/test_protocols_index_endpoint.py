"""Behavior of the read-only Protocols index, ``GET /api/protocols`` (issue #637).

The index lists every Protocol the caller owns as one row each: its display label, its
``status`` (``current`` / ``set_aside`` / ``finished``, ADR-0125), how many of its
Sessions are performed, and when one was last performed. Exercised end to end through
the HTTP seam with the in-memory repositories the Home endpoint tests inject."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, date, datetime

from app.domain.completion import CompletionOutcome
from app.repositories.deps import (
    get_logged_session_repository,
    get_protocol_repository,
)
from app.repositories.logged_session_repository import LoggedSessionDraft
from tests.test_home_endpoint import _CountingLoggedRepository, build_harness


class _MadeCurrentAt:
    """Wraps a Protocol repository so its reads carry the given ``made_current_at``.

    Stands in for Switch (a later ticket) so a test can make the made-Current order
    disagree with the adoption order."""

    def __init__(self, inner, made_current_at: dict[int, datetime]) -> None:
        self._inner = inner
        self._made_current_at = made_current_at

    def list_for_user(self, clerk_user_id):
        return [
            replace(p, made_current_at=self._made_current_at.get(p.id, p.made_current_at))
            for p in self._inner.list_for_user(clerk_user_id)
        ]


def _fetch_index(h, sub):
    return h.client.get("/api/protocols", headers=h.auth(sub))


def _rows_by_id(response) -> dict[int, dict]:
    return {row["id"]: row for row in response.json()["data"]}


def test_index_lists_a_single_unstarted_protocol_as_current():
    # Arrange
    h = build_harness()
    protocol = h.adopt_protocol("user_one")

    # Act
    response = _fetch_index(h, "user_one")

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"] == [
        {
            "id": protocol.id,
            "name": None,
            "label": "gain muscle mass · strength",
            "objective": "gain muscle mass",
            "training_type": "strength",
            "status": "current",
            "performed_count": 0,
            "session_count": 2,
            "last_performed_on": None,
            "deletable": True,
            "session_ids": [s.session_id for s in protocol.sessions],
            "made_current_at": protocol.made_current_at.isoformat(),
        }
    ]


def test_index_groups_current_set_aside_and_finished_protocols():
    # Arrange — an older Protocol set aside by a newer generation, and a third one
    # every Session of which was performed.
    h = build_harness()
    set_aside = h.adopt_protocol("user_mix")
    finished = h.adopt_protocol("user_mix")
    for session in finished.sessions:
        h.perform("user_mix", session.session_id)
    current = h.adopt_protocol("user_mix")

    # Act
    rows = _rows_by_id(_fetch_index(h, "user_mix"))

    # Assert
    assert rows[current.id]["status"] == "current"
    assert rows[set_aside.id]["status"] == "set_aside"
    assert rows[finished.id]["status"] == "finished"


def test_index_current_is_the_latest_made_current_unfinished_protocol():
    # Arrange — the older Protocol was made Current after the newer one was adopted.
    h = build_harness()
    older = h.adopt_protocol("user_back")
    newer = h.adopt_protocol("user_back")
    chosen = _MadeCurrentAt(h.protocols, {
        older.id: datetime(2026, 3, 1, tzinfo=UTC),
        newer.id: datetime(2026, 2, 1, tzinfo=UTC),
    })
    h.client.app.dependency_overrides[get_protocol_repository] = lambda: chosen

    # Act
    rows = _rows_by_id(_fetch_index(h, "user_back"))

    # Assert
    assert rows[older.id]["status"] == "current"
    assert rows[newer.id]["status"] == "set_aside"
    assert rows[newer.id]["made_current_at"] == "2026-02-01T00:00:00+00:00"


def test_index_counts_performed_sessions_and_the_last_performed_date():
    # Arrange — Week 1 performed twice (the later date wins), Week 2 only attempted.
    h = build_harness()
    protocol = h.adopt_protocol("user_count")
    week_1, week_2 = protocol.sessions
    h.perform("user_count", week_1.session_id, performed_on=date(2026, 4, 2))
    h.perform("user_count", week_1.session_id, performed_on=date(2026, 4, 9))
    h.logged.create(
        "user_count",
        LoggedSessionDraft(
            session_id=week_2.session_id,
            performed_on=date(2026, 4, 20),
            logged_sets=[],
            completion_outcome=CompletionOutcome.INCOMPLETE.value,
        ),
    )

    # Act
    row = _rows_by_id(_fetch_index(h, "user_count"))[protocol.id]

    # Assert — an Incomplete attempt is not a performance (ADR-0013)
    assert row["performed_count"] == 1
    assert row["session_count"] == 2
    assert row["last_performed_on"] == "2026-04-09"
    assert row["status"] == "current"


def test_index_never_lists_another_users_protocols():
    # Arrange
    h = build_harness()
    mine = h.adopt_protocol("user_me")
    h.adopt_protocol("user_other")

    # Act
    rows = _rows_by_id(_fetch_index(h, "user_me"))

    # Assert
    assert list(rows) == [mine.id]


def test_index_is_empty_for_a_user_with_no_protocols():
    # Arrange
    h = build_harness()

    # Act
    response = _fetch_index(h, "user_none")

    # Assert
    assert response.status_code == 200
    assert response.json()["data"] == []


def test_index_reads_the_logged_history_exactly_once():
    # Arrange — several Protocols, some finished, so a per-Protocol re-read would show.
    h = build_harness()
    counting = _CountingLoggedRepository(h.logged)
    h.client.app.dependency_overrides[get_logged_session_repository] = lambda: counting
    h.adopt_protocol("user_many")
    for _ in range(3):
        finished = h.adopt_protocol("user_many")
        for session in finished.sessions:
            h.perform("user_many", session.session_id)
    counting.list_calls = 0

    # Act
    response = _fetch_index(h, "user_many")

    # Assert
    assert response.status_code == 200
    assert len(response.json()["data"]) == 4
    assert counting.list_calls == 1


def test_index_requires_authentication():
    # Arrange
    h = build_harness()

    # Act
    response = h.client.get("/api/protocols")

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False
