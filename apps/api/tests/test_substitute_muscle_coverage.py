"""The Muscle Group coverage rule an AI-invented substitute must pass (ADR-0143, #790).

"Same muscle benefits" is checked at **Muscle Group** level: the substitute's Primary
Muscles must cover every Muscle Group the original's Primary Muscles roll up into (the
original's full targeted-muscle union when it records no Primary Muscles)."""

from __future__ import annotations

from app.domain.substitute_muscle_coverage import covers_original_muscle_groups


def test_band_row_covers_a_lat_pulldown():
    assert covers_original_muscle_groups(
        original_primary=["latissimus dorsi"],
        original_targeted=["latissimus dorsi", "biceps"],
        substitute_primary=["latissimus dorsi", "rhomboids"],
    )


def test_push_up_does_not_cover_a_squat():
    assert not covers_original_muscle_groups(
        original_primary=["quadriceps", "glutes"],
        original_targeted=["quadriceps", "glutes", "hamstrings"],
        substitute_primary=["pectoralis major", "triceps"],
    )


def test_a_coarse_region_resolves_to_its_muscle_group():
    assert covers_original_muscle_groups(
        original_primary=["back"],
        original_targeted=["back"],
        substitute_primary=["rhomboids"],
    )


def test_every_original_group_must_be_covered_not_just_one():
    assert not covers_original_muscle_groups(
        original_primary=["latissimus dorsi", "biceps"],
        original_targeted=["latissimus dorsi", "biceps"],
        substitute_primary=["rhomboids"],
    )


def test_falls_back_to_the_targeted_union_when_no_primary_muscles_are_recorded():
    original_targeted = ["quadriceps", "glutes"]

    assert not covers_original_muscle_groups(
        original_primary=[],
        original_targeted=original_targeted,
        substitute_primary=["pectoralis major"],
    )
    assert covers_original_muscle_groups(
        original_primary=[],
        original_targeted=original_targeted,
        substitute_primary=["quadriceps"],
    )


def test_substitute_secondary_muscles_do_not_count_toward_coverage():
    # Only the substitute's Primary Muscles are passed in; an empty split covers nothing.
    assert not covers_original_muscle_groups(
        original_primary=["quadriceps"],
        original_targeted=["quadriceps"],
        substitute_primary=[],
    )


def test_an_original_with_no_classifiable_muscles_imposes_no_requirement():
    assert covers_original_muscle_groups(
        original_primary=[],
        original_targeted=[],
        substitute_primary=["pectoralis major"],
    )
