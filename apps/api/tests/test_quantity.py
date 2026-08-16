"""Behavior of the Quantity domain module (ADR-0032): the typed per-set amount
axis, sibling to ``Load``. ``quantity_from_input`` fixes the meaning of a set's
amount at the write boundary — a count, a distance in canonical metres, or a
duration in canonical seconds — so downstream read paths never re-guess. It is a
pure builder over a kind pick plus a value; the output is a value object. No
mocks: the input is plain strings and the output is a ``Quantity``.

Prior art: ``test_load*`` over ``domain/load.py``."""

from __future__ import annotations

import pytest

from app.domain.quantity import (
    Quantity,
    QuantityKind,
    metres_of,
    quantity_from_input,
)


def _every_kind() -> list[Quantity]:
    """The full zoo the log form produces, one Quantity per kind (and variant)."""

    return [
        quantity_from_input("repetitions", "8"),
        quantity_from_input("distance", "5", unit="km"),
        quantity_from_input("distance", "3", unit="mi", duration="25:00"),
        quantity_from_input("duration", "5:00"),
    ]


def test_repetitions_builds_from_an_integer():
    # Arrange — the simplest amount: a whole number of reps
    quantity = quantity_from_input("repetitions", "8")

    # Assert — a repetitions kind carrying the count, text kept verbatim
    assert quantity.kind is QuantityKind.REPETITIONS
    assert quantity.count == 8
    assert quantity.text == "8"
    # …and the strength read paths reach the count through one accessor
    assert quantity.repetitions == 8


def test_distance_in_km_is_stored_canonically_in_metres():
    # Arrange — a 5 km run, entered in kilometres
    quantity = quantity_from_input("distance", "5", unit="km")

    # Assert — the canonical payload is metres; the km value is kept for display
    assert quantity.kind is QuantityKind.DISTANCE
    assert quantity.metres == 5000.0
    assert quantity.text == "5 km"
    assert quantity.count is None


def test_distance_in_miles_converts_to_canonical_metres():
    # Arrange — a 3 mile run; miles convert on the way in
    quantity = quantity_from_input("distance", "3", unit="mi")

    # Assert — metres is the canonical figure, the mile unit survives in text
    assert quantity.kind is QuantityKind.DISTANCE
    assert quantity.metres == pytest.approx(4828.032)
    assert quantity.text == "3 mi"


def test_duration_from_a_mm_ss_time_is_stored_in_seconds():
    # Arrange — a 5-minute plank, entered as mm:ss
    quantity = quantity_from_input("duration", "5:00")

    # Assert — canonical seconds, text kept verbatim
    assert quantity.kind is QuantityKind.DURATION
    assert quantity.seconds == 300.0
    assert quantity.text == "5:00"
    assert quantity.metres is None


def test_duration_accepts_hh_mm_ss_and_bare_seconds():
    # Arrange — an hour-plus effort, and a raw seconds count
    hms = quantity_from_input("duration", "1:05:30")
    bare = quantity_from_input("duration", "90")

    # Assert — both canonicalise to seconds
    assert hms.seconds == 3930.0
    assert bare.seconds == 90.0


def test_repetitions_accessor_is_none_for_non_repetition_kinds():
    # Arrange — a run and a hold both lack a rep count
    distance = quantity_from_input("distance", "5", unit="km")
    duration = quantity_from_input("duration", "5:00")

    # Assert — the strength read paths degrade to None, no "is this a run?" branch
    assert distance.repetitions is None
    assert duration.repetitions is None


def test_metres_of_reads_the_distance_of_a_stored_distance_quantity():
    # Arrange — a 5 km run stored in its JSON-column form
    stored = quantity_from_input("distance", "5", unit="km").to_dict()

    # Act / Assert — the weekly-distance read path reads canonical metres back out
    assert metres_of(stored) == 5000.0


def test_metres_of_is_none_for_a_non_distance_or_absent_quantity():
    # Arrange — a rep count, a timed hold, and a load-less (None) amount
    reps = quantity_from_input("repetitions", "8").to_dict()
    duration = quantity_from_input("duration", "5:00").to_dict()

    # Assert — only a distance amount carries metres; everything else degrades to
    # None at this single call site, mirroring ``repetitions_of``
    assert metres_of(reps) is None
    assert metres_of(duration) is None
    assert metres_of(None) is None


def test_a_timed_distance_reports_pace_as_derivable():
    # Arrange — a 5 km run completed in 25:00; both measured numbers are present
    quantity = quantity_from_input("distance", "5", unit="km", duration="25:00")

    # Assert — the companion duration is stored and pace becomes derivable
    assert quantity.duration_s == 1500.0
    assert quantity.has_pace is True


def test_pace_is_not_derivable_without_both_numbers():
    # Arrange — a distance with no time, and a standalone timed hold
    untimed_distance = quantity_from_input("distance", "5", unit="km")
    duration_only = quantity_from_input("duration", "5:00")

    # Assert — pace needs distance *and* duration; neither case qualifies
    assert untimed_distance.duration_s is None
    assert untimed_distance.has_pace is False
    assert duration_only.has_pace is False


def test_to_dict_serializes_kind_text_and_only_the_relevant_payload():
    # Arrange — a repetitions Quantity carries a count but no metres or seconds
    quantity = quantity_from_input("repetitions", "8")

    # Act
    data = quantity.to_dict()

    # Assert — the tag, the text, and only the count payload are present
    assert data == {"kind": "repetitions", "text": "8", "count": 8}


def test_to_dict_of_a_timed_distance_carries_metres_and_duration():
    # Arrange — a timed run carries metres and its companion duration, not seconds
    quantity = quantity_from_input("distance", "5", unit="km", duration="25:00")

    # Act / Assert — only the distance payload fields appear
    assert quantity.to_dict() == {
        "kind": "distance",
        "text": "5 km",
        "metres": 5000.0,
        "duration_s": 1500.0,
    }


@pytest.mark.parametrize("original", _every_kind())
def test_from_dict_round_trips_every_kind(original):
    # Act — read back exactly what was stored in the JSON column
    restored = Quantity.from_dict(original.to_dict())

    # Assert — a stored typed Quantity survives the round-trip unchanged
    assert restored == original


def test_a_blank_value_is_no_quantity():
    # Arrange / Act — the amount field was left empty
    # Assert — an absent amount stays absent for every kind, never a spurious zero
    assert quantity_from_input("repetitions", "") is None
    assert quantity_from_input("distance", None, unit="km") is None
    assert quantity_from_input("duration", "   ") is None


def test_an_unparseable_value_is_tolerated_at_the_boundary():
    # Arrange — noise that fits no numeric form, one per kind
    # Assert — the boundary returns None rather than letting a ValueError escape
    assert quantity_from_input("repetitions", "lots") is None
    assert quantity_from_input("distance", "far", unit="km") is None
    assert quantity_from_input("duration", "a while") is None


def test_an_unknown_kind_is_tolerated_at_the_boundary():
    # Arrange / Act — a kind the picker never should send
    # Assert — no KeyError/ValueError leaks; the boundary declines with None
    assert quantity_from_input("tempo", "120") is None
