"""Unit tests for the pure Catalog-browse domain (ADR-0042).

Covers the difficulty banding, facet parsing, the AND-of-facets / OR-within-facet
predicate, the curated → completeness → name ordering, and the distinct-equipment
option list. No ORM: a lightweight ``_Ex`` double satisfies the ``_Browsable`` shape."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.exercise import normalize_name
from app.domain.exercise_browse import (
    DifficultyBand,
    browse_sort_key,
    difficulty_band,
    distinct_equipment,
    exercise_muscle_groups,
    matches_filters,
    normalize_equipment,
    parse_difficulty_band,
    parse_muscle_group,
    rank_browse_results,
)
from app.domain.muscle_groups import MuscleGroup


@dataclass
class _Ex:
    """A minimal Exercise double carrying just the browse-relevant fields."""

    name: str = "Movement"
    provenance: str = "curated"
    description: str | None = None
    targeted_muscles: list[str] = field(default_factory=list)
    instructions: list[str] = field(default_factory=list)
    primary_muscles: list[str] = field(default_factory=list)
    secondary_muscles: list[str] = field(default_factory=list)
    required_equipment: list[str] = field(default_factory=list)
    difficulty: int | None = None
    precautions: list[str] = field(default_factory=list)
    image: str | None = None

    @property
    def normalized_name(self) -> str:
        return normalize_name(self.name)


def _listable(name: str, **kwargs) -> _Ex:
    """A Listable double: a description, a muscle, and one step, plus overrides."""

    base = dict(
        name=name,
        description="Do the thing.",
        targeted_muscles=["quads"],
        instructions=["Step one."],
    )
    base.update(kwargs)
    return _Ex(**base)


# --- difficulty banding -----------------------------------------------------------


def test_difficulty_band_partitions_one_to_ten():
    # Arrange / Act / Assert — the 1–10 scale buckets with no gaps or overlaps
    assert [difficulty_band(d) for d in (1, 3)] == [DifficultyBand.BEGINNER] * 2
    assert [difficulty_band(d) for d in (4, 7)] == [DifficultyBand.INTERMEDIATE] * 2
    assert [difficulty_band(d) for d in (8, 10)] == [DifficultyBand.ADVANCED] * 2


def test_difficulty_band_out_of_range_is_none():
    # A difficulty outside 1–10 belongs to no band rather than being forced into one
    assert difficulty_band(0) is None
    assert difficulty_band(11) is None


# --- facet value parsing ----------------------------------------------------------


def test_parse_muscle_group_is_case_insensitive_and_excludes_unclassified():
    assert parse_muscle_group("Legs") is MuscleGroup.LEGS
    assert parse_muscle_group("core") is MuscleGroup.CORE
    # Unclassified is never a browse facet (ADR-0025), and junk resolves to nothing
    assert parse_muscle_group("Unclassified") is None
    assert parse_muscle_group("not-a-group") is None


def test_parse_difficulty_band_is_case_insensitive_and_rejects_junk():
    assert parse_difficulty_band("BEGINNER") is DifficultyBand.BEGINNER
    assert parse_difficulty_band(" advanced ") is DifficultyBand.ADVANCED
    assert parse_difficulty_band("elite") is None


# --- the facet predicate ----------------------------------------------------------


def test_no_filters_passes_everything_including_a_stub():
    stub = _Ex(name="Name Only")  # no muscles, equipment, or difficulty
    assert matches_filters(
        stub, muscle_groups=set(), equipment=set(), difficulty_bands=set()
    )


def test_muscle_group_filter_matches_via_the_curated_rollup():
    squat = _listable("Back Squat", targeted_muscles=["quads", "glutes"])
    assert matches_filters(
        squat,
        muscle_groups={MuscleGroup.LEGS},
        equipment=set(),
        difficulty_bands=set(),
    )
    assert not matches_filters(
        squat,
        muscle_groups={MuscleGroup.CHEST},
        equipment=set(),
        difficulty_bands=set(),
    )


def test_any_active_facet_excludes_a_name_only_stub():
    stub = _Ex(name="Mystery Move")
    # a Stub carries none of the three facet fields, so any active facet drops it
    assert not matches_filters(
        stub, muscle_groups={MuscleGroup.LEGS}, equipment=set(), difficulty_bands=set()
    )
    assert not matches_filters(
        stub, muscle_groups=set(), equipment={"barbell"}, difficulty_bands=set()
    )
    assert not matches_filters(
        stub,
        muscle_groups=set(),
        equipment=set(),
        difficulty_bands={DifficultyBand.BEGINNER},
    )


def test_equipment_filter_is_normalized_and_or_within_facet():
    ohp = _listable("Overhead Press", required_equipment=["Pull-up Bar"])
    # normalized both sides, so casing/spacing differences still match
    assert matches_filters(
        ohp,
        muscle_groups=set(),
        equipment={normalize_equipment("pull-up bar")},
        difficulty_bands=set(),
    )
    # OR within the facet: matching any one requested equipment passes
    assert matches_filters(
        ohp,
        muscle_groups=set(),
        equipment={"dumbbell", normalize_equipment("Pull-up Bar")},
        difficulty_bands=set(),
    )


def test_facets_combine_with_and():
    squat = _listable(
        "Back Squat",
        targeted_muscles=["quads"],
        required_equipment=["barbell"],
        difficulty=6,
    )
    # matches all three facets
    assert matches_filters(
        squat,
        muscle_groups={MuscleGroup.LEGS},
        equipment={"barbell"},
        difficulty_bands={DifficultyBand.INTERMEDIATE},
    )
    # fails when one facet (difficulty band) does not match — AND, not OR
    assert not matches_filters(
        squat,
        muscle_groups={MuscleGroup.LEGS},
        equipment={"barbell"},
        difficulty_bands={DifficultyBand.ADVANCED},
    )


def test_exercise_muscle_groups_uses_the_curated_map():
    groups = exercise_muscle_groups(["quads", "chest", "made-up-muscle"])
    assert MuscleGroup.LEGS in groups
    assert MuscleGroup.CHEST in groups
    assert MuscleGroup.UNCLASSIFIED in groups  # unmapped is surfaced, never dropped


# --- ordering ---------------------------------------------------------------------


def test_rank_orders_curated_then_completeness_then_name():
    # Arrange — a spread across the three sort keys
    curated_enriched = _Ex(
        name="Bench Press",
        provenance="curated",
        description="Press.",
        targeted_muscles=["chest"],
        instructions=["Lower and press."],
        primary_muscles=["chest"],
        difficulty=5,
        precautions=["Warm up."],
        image="bench.png",
    )
    curated_listable = _listable("Air Squat", provenance="curated")
    curated_stub_a = _Ex(name="Alpha Raise", provenance="curated")
    curated_stub_b = _Ex(name="Zeta Raise", provenance="curated")
    ai_enriched = _Ex(
        name="Aardvark Curl",
        provenance="ai_generated",
        description="Curl.",
        targeted_muscles=["biceps"],
        instructions=["Curl up."],
        primary_muscles=["biceps"],
        difficulty=3,
        precautions=["Careful."],
        image="curl.png",
    )

    # Act
    ranked = rank_browse_results(
        [curated_stub_b, ai_enriched, curated_listable, curated_stub_a, curated_enriched]
    )

    # Assert — curated block first (enriched, listable, then stubs A→Z), AI last
    assert [e.name for e in ranked] == [
        "Bench Press",
        "Air Squat",
        "Alpha Raise",
        "Zeta Raise",
        "Aardvark Curl",
    ]


def test_browse_sort_key_is_a_pure_tuple():
    key = browse_sort_key(_listable("Back Squat", provenance="curated"))
    assert key == (0, 1, "back squat")  # curated=0, listable=1, normalized name


# --- distinct equipment options ---------------------------------------------------


def test_distinct_equipment_dedupes_case_insensitively_and_sorts():
    exercises = [
        _listable("A", required_equipment=["Barbell", "bench"]),
        _listable("B", required_equipment=["barbell", "  "]),  # blank dropped
        _listable("C", required_equipment=["Dumbbell"]),
    ]
    # one entry per normalized key, first casing kept, sorted; blank never surfaced
    assert distinct_equipment(exercises) == ["Barbell", "bench", "Dumbbell"]
