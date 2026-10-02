"""Behavior of the Calibration domain module — the user-directed, no-AI re-pitch of a
Protocol's un-performed tail (ADR-0111).

Calibration is a pure function over a Prescription's spine fields plus three inputs: the
standing and desired offsets, the user's Fitness Level band, and the lever the recent record
selects. The invariants these tests hold:

- the offset is **clamped** −3…+3, server-side;
- resolution is **total** — a Prescription whose Load cannot move is still re-pitched, via
  its Quantity or its sets, never silently skipped;
- the **volume sub-cap** holds: sets move at most one per Prescription across the whole
  Calibration, however many notches are applied;
- **easier travels further than harder**, inheriting Progression's deliberate asymmetry;
- the floors are hard — ``sets >= 1``, rest never below its minimum, and a bodyweight-added
  Load reduced to nothing collapses to the bare ``"bodyweight"`` movement;
- the resolved values are a function of the **offset**, not of the path taken to it, so a
  stacked Calibration and a single jump to the same offset agree.

No mocks: the inputs are plain frozen dataclasses.
"""

from __future__ import annotations

import pytest

from app.domain.calibration import (
    EASIER_STEP_KG,
    HARDER_STEP_KG,
    MAX_CALIBRATION,
    MAX_SET_DELTA,
    MIN_CALIBRATION,
    MIN_REST_SECONDS,
    CalibrationLever,
    PrescriptionPitch,
    calibrate_prescription,
    clamp_calibration,
    level_band,
    resolve_lever,
)
from app.domain.completion import CompletionOutcome
from app.domain.effort import Effort, EffortScale
from app.domain.load import parse_load
from app.domain.quantity import quantity_from_text


def pitch(
    *,
    sets: int = 3,
    reps: str = "8-12",
    load: str | None = "60 kg",
    quantity: str | None = None,
    rest_seconds: int | None = 90,
    target_effort: Effort | None = None,
) -> PrescriptionPitch:
    """A Prescription's calibratable spine, built from readable free text."""

    return PrescriptionPitch(
        sets=sets,
        reps=reps,
        recommended_load=parse_load(load).to_dict() if load is not None else None,
        prescribed_quantity=(
            quantity_from_text(quantity).to_dict() if quantity is not None else None
        ),
        rest_seconds=rest_seconds,
        target_effort=target_effort.to_dict() if target_effort is not None else None,
    )


def calibrated(
    source: PrescriptionPitch,
    *,
    to: int,
    frm: int = 0,
    lever: CalibrationLever = CalibrationLever.LOAD,
    band: str = "intermediate",
) -> PrescriptionPitch:
    """Re-pitch ``source`` from ``frm`` to ``to``, defaulting to a plain Load step."""

    return calibrate_prescription(
        source, standing=frm, desired=to, lever=lever, band=band
    )


# --------------------------------------------------------------------------- clamp


class TestClamp:
    """The offset is bounded intent: ±3, enforced here rather than trusted from a client."""

    @pytest.mark.parametrize("value", [-3, -1, 0, 2, 3])
    def test_keeps_a_value_already_within_the_bounds(self, value: int) -> None:
        assert clamp_calibration(value) == value

    def test_clamps_below_the_floor_to_the_floor(self) -> None:
        assert clamp_calibration(-9) == MIN_CALIBRATION

    def test_clamps_above_the_ceiling_to_the_ceiling(self) -> None:
        assert clamp_calibration(9) == MAX_CALIBRATION

    def test_bounds_are_symmetric(self) -> None:
        assert MIN_CALIBRATION == -MAX_CALIBRATION


# ---------------------------------------------------------------------- level band


class TestLevelBand:
    """The magnitude comes from the Fitness Level band, on the same cut points the
    generation cache already uses — a coarse band, never a per-level figure."""

    @pytest.mark.parametrize(
        ("level", "expected"),
        [
            (1, "beginner"),
            (3, "beginner"),
            (4, "intermediate"),
            (7, "intermediate"),
            (8, "advanced"),
            (10, "advanced"),
        ],
    )
    def test_bands_a_fitness_level(self, level: int, expected: str) -> None:
        assert level_band(level) == expected

    def test_a_stronger_band_moves_further_per_notch(self) -> None:
        assert (
            HARDER_STEP_KG["beginner"]
            < HARDER_STEP_KG["intermediate"]
            < HARDER_STEP_KG["advanced"]
        )

    def test_easier_travels_further_than_harder_in_every_band(self) -> None:
        # Progression's own asymmetry: backing off is the cautious direction.
        for band in HARDER_STEP_KG:
            assert EASIER_STEP_KG[band] > HARDER_STEP_KG[band]


# ---------------------------------------------------------------------- lever choice


def test_recent_incomplete_work_selects_the_volume_lever() -> None:
    """Capacity ran out, so easier should drop a set rather than lighten the bar."""

    assert (
        resolve_lever([CompletionOutcome.INCOMPLETE.value]) is CalibrationLever.VOLUME
    )


def test_recent_completed_work_selects_the_load_lever() -> None:
    """Capacity was fine, so the Load is what should move."""

    assert resolve_lever([CompletionOutcome.COMPLETED.value]) is CalibrationLever.LOAD


def test_no_recent_record_falls_back_to_the_load_lever() -> None:
    """A first-day user has only a profile; the Load lever is the conservative default
    because it leaves the Session's structure — and so Completion Outcome — intact."""

    assert resolve_lever([]) is CalibrationLever.LOAD


def test_one_incomplete_outweighs_completed_work_around_it() -> None:
    """Un-done prescribed work is the stronger signal; it decides the lever."""

    outcomes = [
        CompletionOutcome.COMPLETED.value,
        CompletionOutcome.INCOMPLETE.value,
        CompletionOutcome.COMPLETED.value,
    ]
    assert resolve_lever(outcomes) is CalibrationLever.VOLUME


# ------------------------------------------------------------------- the load lever


class TestLoadLever:
    """An absolute Load moves by the band's fixed increment per notch."""

    def test_one_notch_harder_adds_the_bands_increment(self) -> None:
        result = calibrated(pitch(load="60 kg"), to=1)

        assert parse_load(result.recommended_load["text"]).kg == pytest.approx(
            60 + HARDER_STEP_KG["intermediate"]
        )

    def test_one_notch_easier_subtracts_the_larger_easier_increment(self) -> None:
        result = calibrated(pitch(load="60 kg"), to=-1)

        assert parse_load(result.recommended_load["text"]).kg == pytest.approx(
            60 - EASIER_STEP_KG["intermediate"]
        )

    def test_three_notches_apply_three_increments(self) -> None:
        result = calibrated(pitch(load="60 kg"), to=3)

        assert parse_load(result.recommended_load["text"]).kg == pytest.approx(
            60 + 3 * HARDER_STEP_KG["intermediate"]
        )

    def test_a_load_never_goes_negative(self) -> None:
        result = calibrated(pitch(load="5 kg"), to=-3, band="advanced")

        assert parse_load(result.recommended_load["text"]).kg == pytest.approx(0.0)

    def test_the_bodyweight_added_load_steps_its_added_kilograms(self) -> None:
        result = calibrated(pitch(load="bodyweight + 20 kg"), to=-1)

        assert parse_load(result.recommended_load["text"]).added_kg == pytest.approx(
            20 - EASIER_STEP_KG["intermediate"]
        )

    def test_added_load_reduced_to_nothing_collapses_to_bare_bodyweight(self) -> None:
        """Progression's own rule, reused rather than re-derived."""

        result = calibrated(pitch(load="bodyweight + 5 kg"), to=-3)

        assert result.recommended_load["text"] == "bodyweight"

    def test_the_rep_line_is_untouched_by_a_load_step(self) -> None:
        result = calibrated(pitch(reps="8-12", load="60 kg"), to=2)

        assert result.reps == "8-12"

    def test_the_set_count_is_untouched_by_a_load_step(self) -> None:
        result = calibrated(pitch(sets=4, load="60 kg"), to=-2)

        assert result.sets == 4


# ----------------------------------------------------------------- the volume lever


class TestVolumeLever:
    """Volume is sub-capped at one set per Prescription; further notches fall through
    to the Load so a Session's structure stays recognizable (and so Completion Outcome
    keeps measuring the same thing)."""

    def test_one_notch_easier_drops_a_single_set(self) -> None:
        result = calibrated(pitch(sets=4), to=-1, lever=CalibrationLever.VOLUME)

        assert result.sets == 3

    def test_one_notch_harder_adds_a_single_set(self) -> None:
        result = calibrated(pitch(sets=3), to=1, lever=CalibrationLever.VOLUME)

        assert result.sets == 4

    def test_three_notches_still_move_only_one_set(self) -> None:
        result = calibrated(pitch(sets=4), to=-3, lever=CalibrationLever.VOLUME)

        assert result.sets == 4 - MAX_SET_DELTA

    def test_notches_beyond_the_sub_cap_fall_through_to_the_load(self) -> None:
        """−3 on the volume lever is one set plus two notches of Load, not three sets."""

        result = calibrated(
            pitch(sets=4, load="60 kg"), to=-3, lever=CalibrationLever.VOLUME
        )

        assert result.sets == 3
        assert parse_load(result.recommended_load["text"]).kg == pytest.approx(
            60 - 2 * EASIER_STEP_KG["intermediate"]
        )

    def test_the_set_count_never_falls_below_one(self) -> None:
        result = calibrated(pitch(sets=1), to=-3, lever=CalibrationLever.VOLUME)

        assert result.sets == 1

    def test_a_floored_set_count_does_not_double_charge_the_load(self) -> None:
        """When the sets floor refuses the volume step, the notch is still spent there —
        it is not silently re-spent on the Load, which would overshoot the offset."""

        floored = calibrated(
            pitch(sets=1, load="60 kg"), to=-2, lever=CalibrationLever.VOLUME
        )
        unfloored = calibrated(
            pitch(sets=4, load="60 kg"), to=-2, lever=CalibrationLever.VOLUME
        )

        assert floored.recommended_load == unfloored.recommended_load


# ------------------------------------------------------- totality: no silent no-ops


class TestTotality:
    """Every Prescription is re-pitched. A Load with no movable number is exactly what
    Progression leaves alone, so Calibration moves the Quantity or the sets instead —
    a lever that no-ops on a whole class of Prescriptions is not a lever."""

    @pytest.mark.parametrize("load", ["70% 1RM", "60-70 kg", "moderate"])
    def test_an_unmovable_load_is_left_verbatim(self, load: str) -> None:
        result = calibrated(pitch(load=load, sets=3), to=-1)

        assert result.recommended_load["text"] == load

    @pytest.mark.parametrize("load", ["70% 1RM", "60-70 kg", "moderate"])
    def test_an_unmovable_load_moves_the_sets_instead(self, load: str) -> None:
        result = calibrated(pitch(load=load, sets=3), to=-1)

        assert result.sets == 2

    def test_a_prescription_with_no_load_at_all_still_moves(self) -> None:
        result = calibrated(pitch(load=None, sets=3), to=1)

        assert result.sets == 4

    def test_a_distance_quantity_moves_its_metres(self) -> None:
        result = calibrated(pitch(load=None, quantity="5 km"), to=-1)

        assert result.prescribed_quantity["metres"] < 5000

    def test_a_duration_quantity_moves_its_seconds(self) -> None:
        result = calibrated(pitch(load=None, quantity="60s"), to=1)

        assert result.prescribed_quantity["seconds"] > 60

    def test_a_quantity_prescription_prefers_its_quantity_over_its_sets(self) -> None:
        """Halving a run's set count is not "easier by one notch"; shortening it is."""

        result = calibrated(pitch(load=None, quantity="5 km", sets=1), to=-1)

        assert result.sets == 1
        assert result.prescribed_quantity["metres"] < 5000

    def test_zero_moves_nothing_at_all(self) -> None:
        source = pitch(sets=3, load="60 kg", rest_seconds=90)

        assert calibrated(source, to=0) == source


# ------------------------------------------------------- rest and the Target Effort


class TestCoherenceFields:
    """Rest and Target Effort follow the offset so the plan reads consistently. Target
    Effort is descriptive in v1 and feeds no Progression — it moves for coherence only.
    """

    def test_harder_shortens_the_rest(self) -> None:
        result = calibrated(pitch(rest_seconds=90), to=1)

        assert result.rest_seconds < 90

    def test_easier_lengthens_the_rest(self) -> None:
        result = calibrated(pitch(rest_seconds=90), to=-1)

        assert result.rest_seconds > 90

    def test_rest_never_falls_below_its_minimum(self) -> None:
        result = calibrated(pitch(rest_seconds=20), to=3)

        assert result.rest_seconds == MIN_REST_SECONDS

    def test_an_absent_rest_stays_absent(self) -> None:
        result = calibrated(pitch(rest_seconds=None), to=1)

        assert result.rest_seconds is None

    def test_harder_raises_an_rpe_target(self) -> None:
        source = pitch(target_effort=Effort(scale=EffortScale.RPE, value=7))
        result = calibrated(source, to=1)

        assert result.target_effort["value"] > 7

    def test_harder_lowers_an_rir_target(self) -> None:
        """RIR runs the other way — fewer reps in reserve is harder."""

        source = pitch(target_effort=Effort(scale=EffortScale.RIR, value=3))
        result = calibrated(source, to=1)

        assert result.target_effort["value"] < 3

    def test_an_rpe_target_stays_inside_its_scale(self) -> None:
        source = pitch(target_effort=Effort(scale=EffortScale.RPE, value=10))
        result = calibrated(source, to=3)

        assert result.target_effort["value"] <= 10

    def test_an_rir_target_never_goes_negative(self) -> None:
        source = pitch(target_effort=Effort(scale=EffortScale.RIR, value=0))
        result = calibrated(source, to=3)

        assert result.target_effort["value"] >= 0

    def test_an_absent_target_effort_stays_absent(self) -> None:
        result = calibrated(pitch(target_effort=None), to=2)

        assert result.target_effort is None


# --------------------------------------------------------- path-independence & undo


class TestPathIndependence:
    """The resolved values are a function of the *offset*, not of the route to it — so
    stacking agrees with a single jump, and returning the offset to 0 returns the
    authored values whenever the band, the lever and the floors held throughout. (The
    ADR's "not exactly reversible" cost is about those three *changing* between acts,
    which is outside a single pure call.)"""

    def test_stacking_two_notches_matches_one_jump_of_two(self) -> None:
        source = pitch(load="60 kg", sets=4)

        once = calibrated(source, to=2)
        twice = calibrated(calibrated(source, to=1), frm=1, to=2)

        assert twice == once

    def test_returning_to_zero_restores_the_authored_values(self) -> None:
        source = pitch(load="60 kg", sets=4, rest_seconds=90)

        pitched = calibrated(source, to=-2, lever=CalibrationLever.VOLUME)
        restored = calibrated(pitched, frm=-2, to=0, lever=CalibrationLever.VOLUME)

        assert restored == source

    def test_a_no_op_transition_changes_nothing(self) -> None:
        source = pitch(load="60 kg")

        assert calibrated(source, frm=2, to=2) == source

    def test_crossing_zero_honours_both_asymmetric_step_sizes(self) -> None:
        """−1 → +1 must undo one *easier* step and add one *harder* one, not two of either."""

        source = pitch(load="60 kg")
        easier = calibrated(source, to=-1)
        crossed = calibrated(easier, frm=-1, to=1)

        assert parse_load(crossed.recommended_load["text"]).kg == pytest.approx(
            60 + HARDER_STEP_KG["intermediate"]
        )


# ------------------------------------------------------------------ immutability


def test_calibrating_returns_a_new_pitch_and_never_mutates_its_input() -> None:
    source = pitch(load="60 kg", sets=4)
    before = (source.sets, dict(source.recommended_load), source.rest_seconds)

    calibrated(source, to=-2, lever=CalibrationLever.VOLUME)

    assert (source.sets, dict(source.recommended_load), source.rest_seconds) == before


def test_the_band_cut_points_agree_with_the_generation_cache() -> None:
    """``level_band`` restates the cache's bucketing rather than importing it (the pure
    domain tier takes no dependency on the I/O tier), so the two must not drift."""

    from app.domain import calibration
    from app.generation.cache import ADVANCED_MIN_LEVEL, INTERMEDIATE_MIN_LEVEL

    assert calibration.INTERMEDIATE_MIN_LEVEL == INTERMEDIATE_MIN_LEVEL
    assert calibration.ADVANCED_MIN_LEVEL == ADVANCED_MIN_LEVEL
