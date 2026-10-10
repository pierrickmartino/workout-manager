"""Behavior of the windowed History reads (ADR-0128) end to end.

The History screen reads a light **index** of every record (the filterable fields plus
the ADR-0034 correction verdicts), then fetches full records in bounded batches: the
newest ``limit`` or an explicit ``ids`` list. The plain ``GET /api/logs`` read is
unchanged for its other callers."""

from __future__ import annotations

from datetime import date

from app.repositories.logged_session_repository import (
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.routes.logs import HISTORY_WINDOW_MAX
from tests.quantities import reps_quantity
from tests.test_logs_endpoint import (
    _auth,
    _perform_protocol_session,
    _seed_protocol,
    build_client,
)


def _log_plan_less(client, owner, performed_on, exercise_names, training_type="cardio"):
    """Seed one plan-less Logged Session with a set per named movement; return it."""
    from app.domain.exercise import Provenance

    exercise_ids = [
        client.exercises.find_or_create(name, provenance=Provenance.AI_GENERATED).id
        for name in exercise_names
    ]
    return client.logged.create(
        owner,
        LoggedSessionDraft(
            session_id=None,
            training_type=training_type,
            performed_on=performed_on,
            logged_sets=[
                LoggedSetDraft(exercise_id=exercise_id, quantity=reps_quantity(5))
                for exercise_id in exercise_ids
            ],
        ),
    )


# --- GET /api/logs/index -------------------------------------------------------------


def test_index_lists_every_record_with_its_filterable_fields_newest_first():
    # Arrange — two plan-less records; the newer one repeats a movement across sets
    client, ctx = build_client()
    headers = _auth(ctx, "user_index")
    older = _log_plan_less(client, "user_index", date(2026, 6, 1), ["Rowing"])
    newer = _log_plan_less(
        client,
        "user_index",
        date(2026, 6, 9),
        ["Back Squat", "Deadlift", "Back Squat"],
        training_type="strength",
    )

    # Act
    response = client.get("/api/logs/index", headers=headers)

    # Assert — one slim row per record, exercise names distinct in first-logged order
    assert response.status_code == 200
    rows = response.json()["data"]
    assert [row["id"] for row in rows] == [newer.id, older.id]
    assert rows[0] == {
        "id": newer.id,
        "performed_on": "2026-06-09",
        "training_type": "strength",
        "exercise_names": ["Back Squat", "Deadlift"],
        "deletable": True,
        "uncompletable": True,
    }
    assert "logged_sets" not in rows[1]


def test_index_carries_the_contiguity_verdicts():
    # Arrange — both Sessions of a Protocol performed in order: only the tail may go
    client, ctx = build_client()
    headers = _auth(ctx, "user_gate")
    protocol, squat = _seed_protocol(client, "user_gate")
    first = _perform_protocol_session(client, "user_gate", protocol, 0, squat)
    second = _perform_protocol_session(client, "user_gate", protocol, 1, squat)

    # Act
    rows = client.get("/api/logs/index", headers=headers).json()["data"]

    # Assert — the same verdicts the full history read reports (ADR-0034)
    verdicts = {row["id"]: (row["deletable"], row["uncompletable"]) for row in rows}
    assert verdicts[second.id] == (True, True)
    assert verdicts[first.id] == (False, False)


def test_index_is_scoped_to_the_requesting_user():
    # Arrange
    client, ctx = build_client()
    _log_plan_less(client, "user_owner", date(2026, 6, 1), ["Rowing"])

    # Act
    response = client.get("/api/logs/index", headers=_auth(ctx, "user_other"))

    # Assert
    assert response.status_code == 200
    assert response.json()["data"] == []


def test_index_requires_authentication():
    # Arrange
    client, _ = build_client()

    # Act
    response = client.get("/api/logs/index")

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False


# --- GET /api/logs?limit= / ?ids= ------------------------------------------------------


def test_limit_returns_only_the_newest_full_records():
    # Arrange — three records on distinct dates
    client, ctx = build_client()
    headers = _auth(ctx, "user_window")
    for day in (1, 5, 9):
        _log_plan_less(client, "user_window", date(2026, 6, day), ["Rowing"])

    # Act
    response = client.get("/api/logs?limit=2", headers=headers)

    # Assert — full records (with sets), newest first; verdicts travel on the index
    assert response.status_code == 200
    records = response.json()["data"]
    assert [record["performed_on"] for record in records] == ["2026-06-09", "2026-06-05"]
    assert records[0]["logged_sets"][0]["exercise_name"] == "Rowing"
    assert "deletable" not in records[0]


def test_ids_returns_the_owners_records_newest_first_and_drops_the_rest():
    # Arrange — two of mine, one of someone else's
    client, ctx = build_client()
    headers = _auth(ctx, "user_mine")
    oldest = _log_plan_less(client, "user_mine", date(2026, 6, 1), ["Rowing"])
    newest = _log_plan_less(client, "user_mine", date(2026, 6, 9), ["Rowing"])
    theirs = _log_plan_less(client, "user_theirs", date(2026, 6, 5), ["Rowing"])

    # Act
    response = client.get(
        f"/api/logs?ids={oldest.id}&ids={theirs.id}&ids={newest.id}&ids=987654",
        headers=headers,
    )

    # Assert — another user's record never leaks; a missing id is simply absent
    assert response.status_code == 200
    assert [record["id"] for record in response.json()["data"]] == [newest.id, oldest.id]


def test_limit_above_the_window_cap_is_rejected():
    # Arrange
    client, ctx = build_client()

    # Act
    response = client.get(
        f"/api/logs?limit={HISTORY_WINDOW_MAX + 1}", headers=_auth(ctx, "user_cap")
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_more_ids_than_the_window_cap_are_rejected():
    # Arrange
    client, ctx = build_client()
    query = "&".join(f"ids={n}" for n in range(1, HISTORY_WINDOW_MAX + 2))

    # Act
    response = client.get(f"/api/logs?{query}", headers=_auth(ctx, "user_cap"))

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_limit_and_ids_together_are_rejected():
    # Arrange
    client, ctx = build_client()

    # Act
    response = client.get("/api/logs?limit=5&ids=1", headers=_auth(ctx, "user_both"))

    # Assert — the two windows are alternatives, never combined
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_unparameterized_history_still_returns_everything_with_verdicts():
    # Arrange — more records than one window holds
    client, ctx = build_client()
    headers = _auth(ctx, "user_all")
    for offset in range(HISTORY_WINDOW_MAX + 1):
        _log_plan_less(
            client, "user_all", date.fromordinal(date(2026, 1, 1).toordinal() + offset), ["Rowing"]
        )

    # Act
    records = client.get("/api/logs", headers=headers).json()["data"]

    # Assert — the other callers' contract is untouched
    assert len(records) == HISTORY_WINDOW_MAX + 1
    assert all("deletable" in record for record in records)
