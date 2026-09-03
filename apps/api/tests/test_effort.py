"""Behavior of the Effort domain module (ADR-0066): Effort is a typed value
``{scale, value}`` — RPE or RIR — the same discipline as Load (ADR-0010) and Quantity
(ADR-0032). The scale is fixed at the write boundary and never re-guessed; each scale
projects to the other by the standard relation ``rpe ≈ 10 − rir``, computed at read
time. No mocks: the input is a scale + number and the output is a value object."""

from __future__ import annotations

import pytest

from app.domain.effort import (
    Effort,
    EffortScale,
    effort_from_input,
    logged_effort_rpe,
    parse_effort,
)


def test_an_rpe_effort_carries_its_scale_and_value():
    # Arrange / Act — the conventional RPE resolution, a half-step allowed
    effort = Effort(EffortScale.RPE, 6.5)

    # Assert — the scale is stored, the value is what was felt
    assert effort.scale is EffortScale.RPE
    assert effort.value == 6.5


def test_an_rir_effort_carries_its_scale_and_value():
    # Arrange / Act — reps in reserve, an integer scale
    effort = Effort(EffortScale.RIR, 3)

    # Assert
    assert effort.scale is EffortScale.RIR
    assert effort.value == 3


def test_rpe_rejects_a_value_below_zero_or_above_ten():
    # Assert — out of the 0–10 band is not a valid RPE
    with pytest.raises(ValueError):
        Effort(EffortScale.RPE, -0.5)
    with pytest.raises(ValueError):
        Effort(EffortScale.RPE, 10.5)


def test_rpe_rejects_a_finer_than_half_step():
    # Assert — RPE resolution is half-steps; a quarter-step is not a valid RPE
    with pytest.raises(ValueError):
        Effort(EffortScale.RPE, 6.25)


def test_rir_rejects_a_non_integer_or_out_of_range_value():
    # Assert — RIR is an integer 0–5; a fraction or a value past the "5+" ceiling is invalid
    with pytest.raises(ValueError):
        Effort(EffortScale.RIR, 2.5)
    with pytest.raises(ValueError):
        Effort(EffortScale.RIR, 6)
    with pytest.raises(ValueError):
        Effort(EffortScale.RIR, -1)


def test_projects_rir_to_its_rpe_equivalent():
    # Arrange — "3 reps in reserve"
    effort = Effort(EffortScale.RIR, 3)

    # Act / Assert — the standard relation rpe ≈ 10 − rir
    assert effort.as_rpe == 7.0
    assert effort.as_rir == 3.0


def test_projects_rpe_to_its_rir_equivalent():
    # Arrange — a hard-but-not-maximal set
    effort = Effort(EffortScale.RPE, 8)

    # Act / Assert — rir ≈ 10 − rpe; as_rpe reads back its own value
    assert effort.as_rir == 2.0
    assert effort.as_rpe == 8.0


def test_projected_to_the_other_scale_returns_a_valid_effort():
    # Arrange — a half-step RPE projected to the integer RIR scale rounds to a valid member
    rpe = Effort(EffortScale.RPE, 6.5)

    # Act
    as_rir = rpe.projected(EffortScale.RIR)

    # Assert — a valid integer RIR (10 − 6.5 = 3.5, rounded), still projectable back
    assert as_rir.scale is EffortScale.RIR
    assert as_rir.value in (3, 4)
    # Projecting to the same scale is an identity
    assert rpe.projected(EffortScale.RPE) is rpe
    # …and the reverse projection carries the exact RPE-equivalent (10 − 3 = 7)
    assert Effort(EffortScale.RIR, 3).projected(EffortScale.RPE) == Effort(
        EffortScale.RPE, 7
    )


def test_to_dict_and_from_dict_round_trip_both_scales():
    # Arrange — both scales, whole and half values, as they would sit in the JSON column
    for effort in (
        Effort(EffortScale.RPE, 7),
        Effort(EffortScale.RPE, 6.5),
        Effort(EffortScale.RIR, 3),
        Effort(EffortScale.RIR, 0),
    ):
        # Act
        restored = Effort.from_dict(effort.to_dict())

        # Assert — a stored typed Effort survives the JSON round-trip unchanged
        assert restored == effort


def test_to_dict_stores_a_whole_value_without_a_trailing_decimal():
    # Assert — a whole RPE and an RIR serialize as plain integers, not 7.0 / 3.0
    assert Effort(EffortScale.RPE, 7).to_dict() == {"scale": "rpe", "value": 7}
    assert Effort(EffortScale.RIR, 3).to_dict() == {"scale": "rir", "value": 3}
    assert Effort(EffortScale.RPE, 6.5).to_dict() == {"scale": "rpe", "value": 6.5}


def test_parse_effort_builds_a_typed_effort_from_the_wire():
    # Act — the write-boundary parser, given a picked scale and a raw value
    rpe = parse_effort("rpe", "7")
    rir = parse_effort("rir", 3)

    # Assert
    assert rpe == Effort(EffortScale.RPE, 7.0)
    assert rir == Effort(EffortScale.RIR, 3.0)


def test_parse_effort_rejects_an_unknown_scale_or_bad_value():
    # Assert — an unknown scale, or a value that is not a number, is rejected at the boundary
    with pytest.raises(ValueError):
        parse_effort("borg", "7")
    with pytest.raises(ValueError):
        parse_effort("rpe", "very hard")
    with pytest.raises(ValueError):
        parse_effort("rir", "9")


def test_effort_from_input_treats_a_blank_value_as_no_effort():
    # Arrange / Act — the row was left empty: no effort recorded, never a spurious value
    assert effort_from_input("rpe", "") is None
    assert effort_from_input("rir", None) is None
    assert effort_from_input(None, None) is None


def test_effort_from_input_defaults_a_missing_scale_to_rpe():
    # Arrange / Act — a value with no scale is the conventional RPE (back-compat)
    parsed = effort_from_input(None, "7")

    # Assert
    assert parsed == Effort(EffortScale.RPE, 7.0)


def test_logged_effort_rpe_normalizes_a_typed_rir_to_rpe():
    # Arrange — a set logged at "3 RIR"
    stored = Effort(EffortScale.RIR, 3).to_dict()

    # Act — the gate reads the set's effort as an RPE number
    rpe = logged_effort_rpe(stored, perceived_difficulty=None)

    # Assert — 3 RIR normalizes to RPE 7 for the low-effort compare
    assert rpe == 7.0


def test_logged_effort_rpe_falls_back_to_the_legacy_int_as_rpe():
    # Arrange — a returning user's record: no typed effort, only the legacy int
    rpe = logged_effort_rpe(None, perceived_difficulty=8)

    # Assert — the legacy perceived_difficulty reads as an RPE-scale value
    assert rpe == 8.0


def test_logged_effort_rpe_is_none_when_no_effort_was_recorded():
    # Assert — neither a typed effort nor a legacy int → no effort to gate on
    assert logged_effort_rpe(None, perceived_difficulty=None) is None


def test_typed_effort_wins_over_the_legacy_mirror():
    # Arrange — a dual-written set carries both; the typed value is authoritative
    stored = Effort(EffortScale.RIR, 0).to_dict()

    # Act — perceived_difficulty mirror says 10; the typed RIR 0 also normalizes to 10
    rpe = logged_effort_rpe(stored, perceived_difficulty=10)

    # Assert — read off the typed value, not the mirror
    assert rpe == 10.0
