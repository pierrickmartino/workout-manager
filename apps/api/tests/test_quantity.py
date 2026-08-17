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
    prescribed_quantity_from_input,
    quantity_from_input,
    quantity_from_text,
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


# ---------------------------------------------------------------------------
# quantity_from_text — free-text inference (ADR-0050 / #341)
#
# The one shared primitive that *infers* a Quantity's kind from a prescription's
# free-text amount, reused by both the generation fallback and the backfill
# migration. Unlike ``quantity_from_input`` (which is *told* the kind), this reads
# the kind off the prose and always returns a Quantity — repetitions is the safe
# default, so a bad amount degrades rather than crashing the log form. Prior art:
# the ``quantity_from_input`` table above.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "metres"),
    [
        ("7 km", 7000.0),
        ("7km", 7000.0),
        ("7 KM", 7000.0),
        ("6.8 km", 6800.0),
        ("10 kilometres", 10000.0),
        ("5 kilometers", 5000.0),
        ("3 mi", 4828.032),
        ("3 miles", 4828.032),
        ("1 mile", 1609.344),
    ],
)
def test_text_inference_resolves_distance_to_canonical_metres(text, metres):
    # Act — a distance prescription written any of the ways a plan might carry it
    quantity = quantity_from_text(text)

    # Assert — a distance kind whose canonical payload is metres, km/mi and case alike
    assert quantity.kind is QuantityKind.DISTANCE
    assert quantity.metres == pytest.approx(metres)
    assert quantity.count is None
    assert quantity.seconds is None


@pytest.mark.parametrize(
    ("text", "seconds"),
    [
        ("30 min", 1800.0),
        ("30 mins", 1800.0),
        ("30 minutes", 1800.0),
        ("0:30", 30.0),
        ("90s", 90.0),
        ("90 sec", 90.0),
        ("45 secs", 45.0),
        ("45 seconds", 45.0),
        ("5:00", 300.0),
        ("1:05:30", 3930.0),
        ("1 hour", 3600.0),
        ("2 hrs", 7200.0),
    ],
)
def test_text_inference_resolves_duration_to_canonical_seconds(text, seconds):
    # Act — a duration prescription in min/sec words or an mm:ss / hh:mm:ss clock
    quantity = quantity_from_text(text)

    # Assert — a duration kind whose canonical payload is seconds
    assert quantity.kind is QuantityKind.DURATION
    assert quantity.seconds == pytest.approx(seconds)
    assert quantity.metres is None


@pytest.mark.parametrize(
    ("text", "count"),
    [
        ("8", 8),
        ("12", 12),
        ("8-12", None),
        ("8–12", None),
        ("AMRAP", None),
        ("amrap", None),
        ("to failure", None),
        ("", None),
        ("   ", None),
        ("???", None),
    ],
)
def test_text_inference_defaults_unrecognised_amounts_to_repetitions(text, count):
    # Act — a bare rep count, a range, AMRAP, or anything the parser can't place
    quantity = quantity_from_text(text)

    # Assert — repetitions is the safe default; a clean integer keeps its count,
    # a range/AMRAP/garbage carries no count but never crashes
    assert quantity.kind is QuantityKind.REPETITIONS
    assert quantity.count == count
    assert quantity.metres is None
    assert quantity.seconds is None


@pytest.mark.parametrize(
    "text",
    ["7 KM", "6.8 km", "30 min", "0:30", "8-12", "AMRAP", "to failure"],
)
def test_text_inference_carries_the_original_text_through_verbatim(text):
    # Assert — the prescription's prose survives unchanged for lossless display
    # (issue #340: "1 × 7 KM" keeps reading naturally), whatever kind it resolves to
    assert quantity_from_text(text).text == text


def test_text_inference_of_a_typed_distance_round_trips_through_storage():
    # Arrange — an inferred distance is a real Quantity, storable like any other
    inferred = quantity_from_text("7 km")

    # Act / Assert — it survives the JSON-column round-trip the record side uses
    assert Quantity.from_dict(inferred.to_dict()) == inferred
    assert metres_of(inferred.to_dict()) == 7000.0


# ---------------------------------------------------------------------------
# prescribed_quantity_from_input — the plan-side write boundary (ADR-0050 / #345)
#
# The Hand-Authored builder's boundary: it is *told* the picked kind (and, for a
# distance, the unit) and hands over the single free-text plan target. The picked
# kind is authoritative — built through ``quantity_from_input`` so a "Distance" the
# user chose is stored a distance even when the target reads "5" with no unit — and
# it falls through to ``quantity_from_text`` (the shared #341 inference) when no
# usable kind/value is given or the target can't be typed under the picked kind.
# Unlike ``quantity_from_input`` it *always* returns a Quantity, so an authored plan
# is born typed just like a generated or backfilled one.
# ---------------------------------------------------------------------------


def test_prescribed_kind_wins_over_a_bare_target():
    # Arrange / Act — a distance picked with a unit-less "5" target, and a duration
    # picked with a bare "45": the picked kind, not text inference, decides.
    distance = prescribed_quantity_from_input("distance", "5", unit="km")
    duration = prescribed_quantity_from_input("duration", "45")

    # Assert — the pick is honored (text inference alone would read both as reps)
    assert distance.kind is QuantityKind.DISTANCE
    assert distance.metres == pytest.approx(5000.0)
    assert duration.kind is QuantityKind.DURATION
    assert duration.seconds == pytest.approx(45.0)


def test_prescribed_distance_honors_the_picked_unit():
    # Act — the same "5" target reads as miles when the exercise's unit is miles
    quantity = prescribed_quantity_from_input("distance", "5", unit="mi")

    # Assert — canonicalised through the picked unit, not the km default
    assert quantity.kind is QuantityKind.DISTANCE
    assert quantity.metres == pytest.approx(5000.0 * 1609.344 / 1000)


@pytest.mark.parametrize(
    ("kind", "target", "expected_kind"),
    [
        # A unit-suffixed target the numeric builder can't parse falls through to text
        # inference, which reads the same kind off the prose.
        ("distance", "5 km", QuantityKind.DISTANCE),
        ("duration", "45s", QuantityKind.DURATION),
        # A rep range under the repetitions pick is text-inferred (still repetitions).
        ("repetitions", "8-12", QuantityKind.REPETITIONS),
    ],
)
def test_prescribed_free_text_target_falls_back_to_inference(kind, target, expected_kind):
    # Act — the picked kind matches the prose, so the fallback resolves it correctly
    quantity = prescribed_quantity_from_input(kind, target, unit="km")

    # Assert — the target's verbatim text survives for lossless display
    assert quantity.kind is expected_kind
    assert quantity.text == target


def test_a_target_nonsensical_for_its_kind_degrades_to_repetitions():
    # Arrange / Act — "8-12" can't be a distance; rather than crash or lose the target, it
    # falls back to inference over that same prose (graceful, like a bad generation).
    quantity = prescribed_quantity_from_input("distance", "8-12", unit="km")

    # Assert — the safe default, with the target text preserved verbatim
    assert quantity.kind is QuantityKind.REPETITIONS
    assert quantity.count is None
    assert quantity.text == "8-12"


@pytest.mark.parametrize(
    ("kind", "target", "expected_kind"),
    [
        (None, "7 km", QuantityKind.DISTANCE),
        ("", "30 min", QuantityKind.DURATION),
        (None, "8-12", QuantityKind.REPETITIONS),
    ],
)
def test_a_missing_pick_infers_the_kind_from_the_target(kind, target, expected_kind):
    # Act — an absent kind (an older client) still types the plan from the target prose,
    # exactly as the backfill migration does.
    quantity = prescribed_quantity_from_input(kind, target, unit="km")

    # Assert
    assert quantity.kind is expected_kind


def test_prescribed_quantity_is_never_none():
    # Act — even blank/garbage always yields a Quantity, so an authored plan is born typed
    blank = prescribed_quantity_from_input("repetitions", "")
    garbage = prescribed_quantity_from_input("distance", "???", unit="km")

    # Assert — repetitions is the safe default; nothing raises and nothing is None
    assert blank.kind is QuantityKind.REPETITIONS
    assert garbage.kind is QuantityKind.REPETITIONS
