"""A Curated Protocol's Session may override the Training Type and duration (ADR-0130 amendment).

A hybrid Curated Protocol mixes lifting Sessions and run Sessions in one weekly pattern, so a
``PatternSession`` may name its own ``training_type`` and ``duration_minutes``; one that doesn't
falls back to the Curated Protocol's. The override is what the record is typed by, so it must
reach every adopted Session and survive a Builder deploy of the un-performed tail. Driven over
HTTP against the same SQLite harness as the endpoint tests."""

from __future__ import annotations

from dataclasses import replace

from tests.test_curated_protocols_endpoint import RELEASED, build_harness

# The beginner Curated Protocol, its first Session retyped as cardio with its own length.
OVERRIDDEN = replace(
    RELEASED,
    weekly_pattern=(
        replace(RELEASED.weekly_pattern[0], training_type="cardio", duration_minutes=35),
        *RELEASED.weekly_pattern[1:],
    ),
)


def _session_reads(h, protocol: dict) -> list[tuple[str, int]]:
    reads = [
        h.get(f"/api/sessions/{s['session_id']}").json()["data"]
        for s in protocol["sessions"]
    ]
    return [(read["training_type"], read["duration_minutes"]) for read in reads]


def _expected_week() -> list[tuple[str, int]]:
    fallback = (RELEASED.training_type, RELEASED.duration_minutes)
    return [("cardio", 35), *[fallback] * (RELEASED.sessions_per_week - 1)]


def test_an_overriding_session_is_adopted_with_its_own_training_type_and_duration():
    # Arrange
    h = build_harness(OVERRIDDEN)

    # Act
    protocol = h.adopted(h.adopt())

    # Assert — every week repeats the pattern; the rest fall back to the protocol's values.
    assert _session_reads(h, protocol) == _expected_week() * 4


def test_a_builder_deploy_keeps_each_sessions_training_type_and_duration():
    # Arrange — the user re-deploys the whole (un-performed) plan from the Builder.
    h = build_harness(OVERRIDDEN)
    protocol = h.adopted(h.adopt())
    sessions = [
        {
            "session_id": s["session_id"],
            "week": s["week"],
            "day": s["day"],
            "prescriptions": [
                {"exercise_id": p["exercise_id"], "sets": p["sets"], "reps": p["reps"]}
                for p in s["prescriptions"]
            ],
        }
        for s in protocol["sessions"]
    ]

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol['id']}/deploy",
        json={"weeks": 4, "sessions_per_week": 3, "sessions": sessions},
        headers=h.auth(),
    )

    # Assert
    assert response.status_code == 200
    deployed = h.get(f"/api/protocols/{protocol['id']}").json()["data"]
    assert _session_reads(h, deployed) == _expected_week() * 4
