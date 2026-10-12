"""Curated Protocol equipment mismatches (issue #689, ADR-0130, ADR-0064 "never auto-swap").

The list names, per user and per Curated Protocol, the required equipment the user lacks, read
from their Default Equipment exactly as a generation that states no equipment reads it
(ADR-0038). A mismatch is only a flag: the program is still listed, still adoptable, and its
Prescriptions are adopted unchanged. Driven end to end over HTTP through the shared Curated
Protocol harness."""

from __future__ import annotations

from tests.test_curated_protocols_endpoint import RELEASED, USER, build_harness

OTHER_USER = "user_curated_other"


def _set_equipment(h, equipment: list[str], sub: str = USER) -> None:
    response = h.client.put(
        "/api/profile", json={"default_equipment": equipment}, headers=h.auth(sub)
    )
    assert response.status_code == 200


def _missing(h, sub: str = USER) -> list[str]:
    (row,) = h.list(sub).json()["data"]
    return row["missing_equipment"]


def _prescriptions(h, response, sub: str = USER) -> list[list[tuple]]:
    return [
        [
            (p["exercise_name"], p["sets"], p["reps"], p["recommended_load"], p["scheme"])
            for p in session["prescriptions"]
        ]
        for session in h.adopted(response, sub)["sessions"]
    ]


def test_the_list_names_the_required_equipment_the_user_lacks():
    # Arrange — the beginner program needs a barbell, a rack, a bench and dumbbells
    h = build_harness()
    _set_equipment(h, ["Barbells", "Flat bench"])

    # Act
    missing = _missing(h)

    # Assert
    assert missing == ["rack", "dumbbell"]


def test_the_list_names_nothing_when_the_user_has_every_required_item():
    # Arrange
    h = build_harness()
    _set_equipment(h, ["barbell", "squat rack", "bench", "dumbbells"])

    # Act
    missing = _missing(h)

    # Assert
    assert missing == []


def test_a_user_with_no_equipment_set_is_read_as_generation_reads_them():
    # Arrange — no Default Equipment, so a generation stating none runs with none (ADR-0038)
    h = build_harness()

    # Act
    missing = _missing(h)

    # Assert
    assert missing == list(RELEASED.required_equipment)


def test_the_flag_is_per_user():
    # Arrange
    h = build_harness()
    _set_equipment(h, ["barbell", "rack", "bench", "dumbbell"], sub=OTHER_USER)

    # Act
    mine, theirs = _missing(h), _missing(h, OTHER_USER)

    # Assert
    assert mine == list(RELEASED.required_equipment)
    assert theirs == []


def test_a_flagged_program_is_adopted_with_its_prescriptions_unchanged():
    # Arrange — one user lacks every item, the other has them all
    h = build_harness()
    _set_equipment(h, ["barbell", "rack", "bench", "dumbbell"], sub=OTHER_USER)
    assert _missing(h)

    # Act
    flagged = h.adopt()
    equipped = h.adopt(sub=OTHER_USER)

    # Assert — never auto-substituted: the same plan either way
    assert flagged.status_code == 201
    assert _prescriptions(h, flagged) == _prescriptions(h, equipped, OTHER_USER)
