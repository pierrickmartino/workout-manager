"""Unit tests for locating a Session's leading Warm-up Section (ADR-0143, ADR-0074, #782).

``leading_warm_up_length`` is what Replace warm-up swaps: the leading run the Session
Section projection places in the Warm-up — whether hand-authored, curated, generated or
added earlier — and nothing after the first Prescription outside it. Pure; a lightweight
``_P`` double carries just what the projection reads."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.warm_up import leading_warm_up_length


@dataclass
class _P:
    exercise_name: str = "Movement"
    targeted_muscles: list[str] = field(default_factory=list)
    required_equipment: list[str] = field(default_factory=list)
    set_type: str | None = None
    prescribed_quantity: dict | None = None
    superset_group: str | None = None


def test_a_session_without_a_warm_up_has_no_leading_warm_up():
    items = [_P("Back Squat"), _P("Romanian Deadlift")]

    assert leading_warm_up_length(items) == 0


def test_an_empty_session_has_no_leading_warm_up():
    assert leading_warm_up_length([]) == 0


def test_leading_warm_up_typed_prescriptions_form_the_section():
    items = [
        _P("Glute Bridge", set_type="warm_up"),
        _P("Hip Circle", set_type="warm_up"),
        _P("Back Squat"),
    ]

    assert leading_warm_up_length(items) == 2


def test_hand_authored_prep_drills_read_as_the_warm_up_by_name():
    # Arrange — no warm-up Set Type: the projection reads the prep vocabulary.
    items = [_P("Jumping Jack"), _P("World's Greatest Stretch"), _P("Bench Press")]

    assert leading_warm_up_length(items) == 2


def test_a_later_warm_up_typed_set_is_not_part_of_the_leading_section():
    # Arrange — ramp-up sets before a later lift sit outside the leading run.
    items = [
        _P("Glute Bridge", set_type="warm_up"),
        _P("Back Squat"),
        _P("Bench Press", set_type="warm_up"),
        _P("Bench Press"),
    ]

    assert leading_warm_up_length(items) == 1


def test_a_trailing_stretch_after_the_work_is_not_a_warm_up():
    items = [_P("Back Squat"), _P("Hamstring Stretch")]

    assert leading_warm_up_length(items) == 0
