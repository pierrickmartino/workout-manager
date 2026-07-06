"""Behavior of the Load domain module (ADR-0010): ``parse_load`` fixes the meaning
of the free-text load vocabulary at the write boundary so downstream analytics
never re-guess. It is a pure function over a raw string, returning a tagged
``ParsedLoad`` whose ``kind`` selects how (or whether) the load resolves to a
number. No mocks: the input is plain text and the output is a value object.

The tests walk the full free-text zoo the AI and the log form actually produce."""

from __future__ import annotations

import pytest

from app.domain.load import LoadKind, ParsedLoad, load_from_input, parse_load


def test_a_bare_number_is_an_absolute_load():
    # Arrange — the simplest prescription: a number with no unit
    raw = "60"

    # Act
    parsed = parse_load(raw)

    # Assert — a plain number means kilograms lifted
    assert parsed.kind is LoadKind.ABSOLUTE
    assert parsed.kg == 60.0
    assert parsed.text == "60"


def test_a_number_with_a_kg_unit_is_absolute():
    # Arrange — the common prescription form, glued and spaced
    glued = parse_load("70kg")
    spaced = parse_load("70 kg")

    # Act / Assert — the unit is recognized; the kilogram value is extracted
    assert glued.kind is LoadKind.ABSOLUTE and glued.kg == 70.0
    assert spaced.kind is LoadKind.ABSOLUTE and spaced.kg == 70.0
    # …and the original text is preserved verbatim for display and no-loss backfill
    assert glued.text == "70kg"
    assert spaced.text == "70 kg"


def test_a_percent_of_one_rep_max_is_its_own_kind():
    # Arrange — a percentage-based prescription, not a kilogram figure
    raw = "70% 1RM"

    # Act
    parsed = parse_load(raw)

    # Assert — recognized as percent-of-1RM; the percentage is captured, kg is not
    assert parsed.kind is LoadKind.PERCENT_1RM
    assert parsed.percent == 70.0
    assert parsed.kg is None
    assert parsed.text == "70% 1RM"


def test_a_hyphenated_pair_is_a_range():
    # Arrange — a load prescribed as a window, not a single figure
    raw = "70-80 kg"

    # Act
    parsed = parse_load(raw)

    # Assert — captured as a range with both ends; no single kg value
    assert parsed.kind is LoadKind.RANGE
    assert parsed.low_kg == 70.0
    assert parsed.high_kg == 80.0
    assert parsed.kg is None
    assert parsed.text == "70-80 kg"


def test_bodyweight_is_its_own_kind():
    # Arrange — a movement loaded by the user's own mass
    raw = "bodyweight"

    # Act
    parsed = parse_load(raw)

    # Assert — a bodyweight kind with no added load and no bare kg
    assert parsed.kind is LoadKind.BODYWEIGHT
    assert parsed.added_kg is None
    assert parsed.kg is None
    assert parsed.text == "bodyweight"


def test_bodyweight_with_added_load_captures_the_extra_kilograms():
    # Arrange — bodyweight plus a weighted vest / belt
    raw = "bodyweight + 10kg"

    # Act
    parsed = parse_load(raw)

    # Assert — still bodyweight, but the added kilograms are captured
    assert parsed.kind is LoadKind.BODYWEIGHT
    assert parsed.added_kg == 10.0
    assert parsed.text == "bodyweight + 10kg"


def test_a_descriptive_effort_is_qualitative():
    # Arrange — an effort word the AI legitimately prescribes
    raw = "moderate"

    # Act
    parsed = parse_load(raw)

    # Assert — qualitative: it never resolves to a number, but is kept verbatim
    assert parsed.kind is LoadKind.QUALITATIVE
    assert parsed.kg is None
    assert parsed.text == "moderate"


def test_unparseable_input_falls_back_to_qualitative():
    # Arrange — noise that fits no known form
    raw = "as heavy as feels right"

    # Act
    parsed = parse_load(raw)

    # Assert — never dropped or guessed at; preserved as qualitative
    assert parsed.kind is LoadKind.QUALITATIVE
    assert parsed.text == "as heavy as feels right"


def test_to_dict_serializes_kind_text_and_only_the_relevant_payload():
    # Arrange — an absolute load carries kg but not percent or range ends
    parsed = parse_load("70 kg")

    # Act
    data = parsed.to_dict()

    # Assert — the tag, the text, and only the kg payload are present
    assert data == {"kind": "absolute", "text": "70 kg", "kg": 70.0}


@pytest.mark.parametrize(
    "raw",
    ["60", "70 kg", "70% 1RM", "70-80 kg", "bodyweight", "bodyweight + 10kg", "moderate"],
)
def test_from_dict_round_trips_every_kind(raw):
    # Arrange — the full zoo, typed then serialized as it would be in the column
    original = parse_load(raw)

    # Act — read back exactly what was stored
    restored = ParsedLoad.from_dict(original.to_dict())

    # Assert — a stored typed Load survives the JSON round-trip unchanged
    assert restored == original


def test_load_from_input_honors_the_chosen_kind_over_a_guess():
    # Arrange — the user picked "percent of 1RM" and typed the number 70. The bare
    # value "70" would otherwise parse as absolute; the explicit pick must win.

    # Act
    parsed = load_from_input("percent_1rm", "70")

    # Assert — the picked kind is authoritative, with a readable canonical text
    assert parsed.kind is LoadKind.PERCENT_1RM
    assert parsed.percent == 70.0
    assert parsed.text == "70% 1RM"


def test_load_from_input_builds_an_absolute_load_from_a_number():
    # Act
    parsed = load_from_input("absolute", "72.5")

    # Assert
    assert parsed.kind is LoadKind.ABSOLUTE
    assert parsed.kg == 72.5
    assert parsed.text == "72.5 kg"


def test_load_from_input_treats_a_blank_value_as_no_load():
    # Arrange / Act — the row was left empty
    # Assert — an absent load stays absent, never a spurious qualitative "".
    assert load_from_input("absolute", "") is None
    assert load_from_input("absolute", None) is None


def test_load_from_input_keeps_a_qualitative_word_verbatim():
    # Act
    parsed = load_from_input("qualitative", "moderate")

    # Assert
    assert parsed.kind is LoadKind.QUALITATIVE
    assert parsed.text == "moderate"


def test_load_from_input_builds_bodyweight_with_and_without_added_load():
    # Act — plain bodyweight, and bodyweight with an added-load value
    plain = load_from_input("bodyweight", None)
    weighted = load_from_input("bodyweight", "10")

    # Assert
    assert plain.kind is LoadKind.BODYWEIGHT and plain.added_kg is None
    assert plain.text == "bodyweight"
    assert weighted.kind is LoadKind.BODYWEIGHT and weighted.added_kg == 10.0
    assert weighted.text == "bodyweight + 10 kg"


def test_load_from_input_builds_a_range_from_a_hyphenated_value():
    # Act
    parsed = load_from_input("range", "70-80")

    # Assert
    assert parsed.kind is LoadKind.RANGE
    assert parsed.low_kg == 70.0
    assert parsed.high_kg == 80.0
    assert parsed.text == "70-80 kg"
