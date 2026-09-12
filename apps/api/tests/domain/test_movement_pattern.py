"""Unit tests for the Movement Pattern read-time projection (ADR-0072).

The classifier buckets a catalog Exercise into one broad, curated **Movement Pattern**
(squat / hinge / push / pull / carry / locomotion / core), with a **General** fallback
when no pattern is confidently asserted. Pure — a lightweight ``_Ex`` double satisfies the
structural shape the classifier reads (name + targeted muscles)."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.movement_pattern import (
    PATTERN_ORDER,
    MovementPattern,
    classify_movement_pattern,
    group_by_movement_pattern,
)


@dataclass
class _Ex:
    """A minimal Exercise double carrying just what the classifier reads."""

    name: str = "Movement"
    targeted_muscles: list[str] = field(default_factory=list)
    required_equipment: list[str] = field(default_factory=list)


def _pattern(name: str, muscles: list[str] | None = None) -> MovementPattern:
    return classify_movement_pattern(_Ex(name=name, targeted_muscles=muscles or []))


class TestNameKeywordClassification:
    def test_classifies_squat_family_from_name(self) -> None:
        for name in ["Barbell Back Squat", "Bulgarian Split Squat", "Leg Press", "Walking Lunge"]:
            assert _pattern(name) is MovementPattern.SQUAT

    def test_classifies_hinge_family_from_name(self) -> None:
        for name in ["Conventional Deadlift", "Romanian Deadlift", "Hip Thrust", "Good Morning"]:
            assert _pattern(name) is MovementPattern.HINGE

    def test_classifies_push_family_from_name(self) -> None:
        for name in ["Barbell Bench Press", "Overhead Press", "Push-Up", "Triceps Pushdown"]:
            assert _pattern(name) is MovementPattern.PUSH

    def test_classifies_pull_family_from_name(self) -> None:
        for name in ["Pull-Up", "Barbell Row", "Lat Pulldown", "Bicep Curl"]:
            assert _pattern(name) is MovementPattern.PULL

    def test_classifies_carry_family_from_name(self) -> None:
        for name in ["Farmer's Carry", "Suitcase Carry"]:
            assert _pattern(name) is MovementPattern.CARRY

    def test_classifies_locomotion_family_from_name(self) -> None:
        for name in ["Treadmill Run", "Assault Bike", "Sled Push", "Jump Rope"]:
            assert _pattern(name) is MovementPattern.LOCOMOTION

    def test_classifies_core_family_from_name(self) -> None:
        for name in ["Plank", "Russian Twist", "Hanging Leg Raise", "Cable Woodchop"]:
            assert _pattern(name) is MovementPattern.CORE


class TestKeywordPriority:
    def test_rowing_machine_is_locomotion_not_pull(self) -> None:
        # "row" alone is a pull, but a rowing machine is cardio — locomotion wins.
        assert _pattern("Rowing Machine") is MovementPattern.LOCOMOTION
        assert _pattern("Barbell Row") is MovementPattern.PULL

    def test_power_clean_is_hinge_not_pull(self) -> None:
        # A clean is a hip drive (hinge), even though it finishes with a pull.
        assert _pattern("Power Clean") is MovementPattern.HINGE

    def test_pallof_press_is_core_not_push(self) -> None:
        # A distinctive core name beats the generic "press" verb it contains.
        assert _pattern("Pallof Press") is MovementPattern.CORE


class TestMuscleFallback:
    def test_infers_pattern_from_muscles_when_name_has_no_keyword(self) -> None:
        # "Calf Raise" carries no pattern keyword; its leg muscles infer a squat pattern.
        assert _pattern("Calf Raise", ["Calves", "Quadriceps"]) is MovementPattern.SQUAT

    def test_infers_core_from_abdominal_muscles(self) -> None:
        assert _pattern("Ab Rollout", ["Abdominals", "Obliques"]) is MovementPattern.CORE


class TestGeneralFallback:
    def test_unknown_name_and_muscles_fall_back_to_general(self) -> None:
        assert _pattern("Mystery Drill") is MovementPattern.GENERAL

    def test_conflicting_muscle_signal_stays_general(self) -> None:
        # A single muscle each into two families is not a confident inference.
        assert _pattern("Odd Combo", ["Chest", "Lats"]) is MovementPattern.GENERAL


class TestGrouping:
    def test_groups_only_non_empty_patterns_in_canonical_order(self) -> None:
        exercises = [
            _Ex(name="Pull-Up"),
            _Ex(name="Barbell Back Squat"),
            _Ex(name="Plank"),
        ]

        grouped = group_by_movement_pattern(exercises)

        patterns = [pattern for pattern, _ in grouped]
        assert patterns == [
            MovementPattern.SQUAT,
            MovementPattern.PULL,
            MovementPattern.CORE,
        ]

    def test_preserves_input_order_within_a_group(self) -> None:
        first = _Ex(name="Barbell Back Squat")
        second = _Ex(name="Goblet Squat")
        grouped = group_by_movement_pattern([first, second])

        _, members = grouped[0]
        assert members == [first, second]

    def test_empty_input_groups_to_nothing(self) -> None:
        assert group_by_movement_pattern([]) == []

    def test_general_bucket_sorts_last(self) -> None:
        grouped = group_by_movement_pattern([_Ex(name="Mystery Drill"), _Ex(name="Plank")])
        patterns = [pattern for pattern, _ in grouped]
        assert patterns == [MovementPattern.CORE, MovementPattern.GENERAL]


def test_pattern_order_covers_every_pattern() -> None:
    assert set(PATTERN_ORDER) == set(MovementPattern)
    assert PATTERN_ORDER[-1] is MovementPattern.GENERAL
