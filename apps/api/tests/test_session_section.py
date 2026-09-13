"""Unit tests for the Session Section read-time projection (ADR-0074).

``sectionize`` buckets each Exercise Prescription in a Session, in order, into one of
four composition sections — **warm-up / main work / accessory / cooldown** — from
signals already on the plan (the warm-up Set Type, name keywords for mobility / cardio /
compound / isolation movements, and position). Pure — a lightweight ``_P`` double
carries just what the classifier reads, the same idiom as ``_Ex`` in the Movement
Pattern tests. It is a heuristic projection: these tests pin the *rules*, not a claim of
perfect authorial intent.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.session_section import (
    MAIN_WORK_LIMIT,
    SECTION_ORDER,
    SessionSection,
    sectionize,
)


@dataclass
class _P:
    """A minimal Prescription double carrying just what the classifier reads."""

    exercise_name: str = "Movement"
    targeted_muscles: list[str] = field(default_factory=list)
    set_type: str | None = None
    prescribed_quantity: dict | None = None


def _sections(names_and_kwargs: list[_P]) -> list[SessionSection]:
    return sectionize(names_and_kwargs)


def test_empty_session_has_no_sections():
    # Arrange / Act
    result = sectionize([])

    # Assert
    assert result == []


def test_explicit_warm_up_set_type_is_warm_up():
    # Arrange — a warm-up Set Type is the strongest signal, wherever it sits.
    items = [_P("Back Squat", set_type="warm_up"), _P("Back Squat", set_type="working")]

    # Act
    result = sectionize(items)

    # Assert
    assert result == [SessionSection.WARM_UP, SessionSection.MAIN]


def test_leading_mobility_and_cardio_are_warm_up():
    # Arrange
    items = [
        _P("World's Greatest Stretch"),
        _P("Assault Bike"),
        _P("Back Squat"),
    ]

    # Act
    result = sectionize(items)

    # Assert — the leading mobility + cardio run is warm-up; the squat starts the work.
    assert result == [
        SessionSection.WARM_UP,
        SessionSection.WARM_UP,
        SessionSection.MAIN,
    ]


def test_trailing_stretch_and_breathing_are_cooldown():
    # Arrange
    items = [
        _P("Back Squat"),
        _P("Pigeon Stretch"),
        _P("Box Breathing"),
    ]

    # Act
    result = sectionize(items)

    # Assert — the trailing stretch + breathing run is cooldown.
    assert result == [
        SessionSection.MAIN,
        SessionSection.COOLDOWN,
        SessionSection.COOLDOWN,
    ]


def test_first_compounds_are_main_then_the_rest_are_accessory():
    # Arrange — four compounds; only the first MAIN_WORK_LIMIT are main work.
    items = [
        _P("Back Squat"),
        _P("Bench Press"),
        _P("Romanian Deadlift"),
        _P("Overhead Press"),
    ]

    # Act
    result = sectionize(items)

    # Assert
    assert result[:MAIN_WORK_LIMIT] == [SessionSection.MAIN] * MAIN_WORK_LIMIT
    assert result[MAIN_WORK_LIMIT:] == [SessionSection.ACCESSORY]


def test_isolation_movements_are_accessory_even_when_early():
    # Arrange — a curl leads, but isolation never reads as main work.
    items = [_P("Bicep Curl"), _P("Back Squat"), _P("Bench Press")]

    # Act
    result = sectionize(items)

    # Assert
    assert result == [
        SessionSection.ACCESSORY,
        SessionSection.MAIN,
        SessionSection.MAIN,
    ]


def test_three_lift_day_is_all_main():
    # Arrange — the classic squat / bench / deadlift day is all main work.
    items = [_P("Back Squat"), _P("Bench Press"), _P("Deadlift")]

    # Act
    result = sectionize(items)

    # Assert
    assert result == [SessionSection.MAIN] * 3


def test_full_composition_sections_in_order():
    # Arrange — a realistic full-body session touching every section.
    items = [
        _P("Jumping Jacks"),
        _P("World's Greatest Stretch"),
        _P("Back Squat"),
        _P("Bench Press"),
        _P("Romanian Deadlift"),
        _P("Dumbbell Bench Press"),
        _P("Chest-Supported Row"),
        _P("Face Pull"),
        _P("Plank"),
        _P("Pigeon Stretch"),
    ]

    # Act
    result = sectionize(items)

    # Assert
    assert result == [
        SessionSection.WARM_UP,
        SessionSection.WARM_UP,
        SessionSection.MAIN,
        SessionSection.MAIN,
        SessionSection.MAIN,
        SessionSection.ACCESSORY,
        SessionSection.ACCESSORY,
        SessionSection.ACCESSORY,
        SessionSection.ACCESSORY,
        SessionSection.COOLDOWN,
    ]


def test_a_mid_session_stretch_is_not_cooldown():
    # Arrange — only a *trailing* mobility run is cooldown; a stretch between working
    # movements stays in the work block rather than splitting off a stray cooldown.
    items = [_P("Back Squat"), _P("Hamstring Stretch"), _P("Bench Press")]

    # Act
    result = sectionize(items)

    # Assert — the middle stretch is not the trailing run, so it is not cooldown.
    assert result[0] == SessionSection.MAIN
    assert result[2] == SessionSection.MAIN
    assert result[1] != SessionSection.COOLDOWN


def test_section_values_are_stable_wire_tokens():
    # Arrange / Act / Assert — the enum value is the wire token the client reads.
    assert SessionSection.WARM_UP.value == "warm_up"
    assert SessionSection.MAIN.value == "main"
    assert SessionSection.ACCESSORY.value == "accessory"
    assert SessionSection.COOLDOWN.value == "cooldown"
    assert SECTION_ORDER == (
        SessionSection.WARM_UP,
        SessionSection.MAIN,
        SessionSection.ACCESSORY,
        SessionSection.COOLDOWN,
    )
