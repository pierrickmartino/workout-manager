"""The Protocol Builder SIMULATE endpoint end to end (Module C + G, ADR-0021).

``POST /api/protocols/{id}/simulate`` is a **read-only, non-predictive** preview: it
takes the whole draft the Builder assembled client-side and returns per-week Session/Set
counts plus the curated Muscle-Group distribution over every prescribed Set — nothing is
written, and no fatigue/recovery/volume figure is computed. These tests drive the auth
gate, ownership, and the happy path over the same in-memory wiring the other route tests
use.
"""

from __future__ import annotations

from tests.test_protocol_endpoint import build_harness


def _fresh_protocol(h, sub: str) -> dict:
    protocol_id = h.generate_protocol_id(sub)
    return h.fetch_protocol(sub, protocol_id).json()["data"]


def _simulate_body(protocol: dict) -> dict:
    """Echo the fetched Protocol as a whole-plan simulate payload — every Session,
    each Prescription's exercise id and set count (all the preview reads)."""

    return {
        "weeks": protocol["weeks"],
        "sessions_per_week": protocol["sessions_per_week"],
        "sessions": [
            {
                "week": session["week"],
                "prescriptions": [
                    {"exercise_id": p["exercise_id"], "sets": p["sets"]}
                    for p in session["prescriptions"]
                ],
            }
            for session in protocol["sessions"]
        ],
    }


def test_simulate_requires_authentication():
    h = build_harness()
    response = h.client.post(
        "/api/protocols/1/simulate",
        json={"weeks": 2, "sessions_per_week": 1, "sessions": []},
    )
    assert response.status_code == 401


def test_simulate_404s_for_a_protocol_the_user_does_not_own():
    h = build_harness()
    protocol = _fresh_protocol(h, "owner")

    response = h.client.post(
        f"/api/protocols/{protocol['id']}/simulate",
        headers=h.auth("intruder"),
        json=_simulate_body(protocol),
    )
    assert response.status_code == 404


def test_simulate_previews_per_week_counts_and_the_muscle_split():
    # Arrange — the default protocol: two weeks, one Session each, one 5-set Back Squat
    # (quads → Legs) per Session. The preview should reflect exactly that.
    h = build_harness()
    protocol = _fresh_protocol(h, "planner")

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol['id']}/simulate",
        headers=h.auth("planner"),
        json=_simulate_body(protocol),
    )

    # Assert — standard envelope, per-week counts, and a Legs-only split summing to 100
    assert response.status_code == 200
    data = response.json()["data"]
    assert [(w["week"], w["session_count"], w["set_count"]) for w in data["weeks"]] == [
        (1, 1, 5),
        (2, 1, 5),
    ]
    assert data["total_sessions"] == 2
    assert data["total_sets"] == 10
    assert data["muscle_distribution"] == [{"group": "Legs", "pct": 100.0}]


def test_simulate_computes_no_predictive_figure():
    # Arrange — a plain draft
    h = build_harness()
    protocol = _fresh_protocol(h, "planner2")

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol['id']}/simulate",
        headers=h.auth("planner2"),
        json=_simulate_body(protocol),
    )

    # Assert — the payload carries only counts + distribution; no fatigue/recovery/
    # volume-projection/1RM field is present (ADR-0021).
    data = response.json()["data"]
    assert set(data.keys()) == {
        "weeks",
        "total_sessions",
        "total_sets",
        "muscle_distribution",
    }
