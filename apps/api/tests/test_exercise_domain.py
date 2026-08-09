"""Exercise catalog identity rules.

The catalog dedups by *normalized name* (ADR-0002): same normalized string means
same Exercise, deterministically and with no AI call per write. These tests pin
the normalization (what counts as "the same name") and the Provenance values."""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.exercise import (
    CatalogCompleteness,
    Provenance,
    catalog_completeness,
    normalize_name,
    parse_instruction_steps,
    rank_exercise_matches,
)


@dataclass(frozen=True)
class _Match:
    """A minimal Exercise-like stand-in for the ranking helper: it needs only a
    Provenance and a normalized name to be ordered."""

    provenance: str
    normalized_name: str


@dataclass(frozen=True)
class _Fields:
    """A minimal Exercise-like stand-in for the Catalog Completeness projection:
    only the content fields the bar reads, so the pure projection can be pinned
    without a database row. Defaults model a name-only Stub; each test populates
    exactly the fields under scrutiny."""

    description: str | None = None
    targeted_muscles: tuple[str, ...] = ()
    instructions: tuple[str, ...] = ()
    primary_muscles: tuple[str, ...] = ()
    secondary_muscles: tuple[str, ...] = ()
    difficulty: int | None = None
    precautions: tuple[str, ...] = ()
    image: str | None = None


def _listable_fields(**overrides) -> _Fields:
    """The exact minimum Listable set — description + a flat targeted-muscle list +
    one Execution Step — with the emphasis split, difficulty, precautions, and image
    deliberately absent. Overrides layer the gold-tier fields on top."""

    base = {
        "description": "A hinge from the hips.",
        "targeted_muscles": ("hamstrings", "glutes"),
        "instructions": ("Hinge at the hips.",),
    }
    return _Fields(**{**base, **overrides})


def _enriched_fields(**overrides) -> _Fields:
    """A full gold set: the Listable minimum plus every Enriched-tier field — the
    Primary/Secondary split, difficulty, precautions, and an Exercise Image."""

    gold = {
        "primary_muscles": ("hamstrings",),
        "secondary_muscles": ("glutes",),
        "difficulty": 5,
        "precautions": ("keep a neutral spine",),
        "image": "https://cdn.example.com/curated/rdl.svg",
    }
    return _listable_fields(**{**gold, **overrides})


def test_normalize_lowercases_and_trims():
    # Act
    normalized = normalize_name("  Barbell Back Squat  ")

    # Assert
    assert normalized == "barbell back squat"


def test_normalize_collapses_internal_whitespace():
    # Act — tabs/newlines/multiple spaces between words become a single space
    normalized = normalize_name("Goblet\t Squat\n  (heavy)")

    # Assert
    assert normalized == "goblet squat (heavy)"


def test_equivalent_names_normalize_to_the_same_string():
    # Assert — casing and spacing differences are the same Exercise
    assert normalize_name("Push-Up") == normalize_name("  push-up ")


def test_distinct_names_stay_distinct():
    # Assert — near-synonyms are tolerated as separate entries in v1
    assert normalize_name("Bulgarian Split Squat") != normalize_name(
        "Rear-Foot-Elevated Split Squat"
    )


def test_provenance_values_match_the_domain_vocabulary():
    # Assert — the exact stored strings, per the glossary
    assert Provenance.AI_GENERATED.value == "ai_generated"
    assert Provenance.CURATED.value == "curated"
    # The third, least-validated tier: a user-typed ad-hoc movement created with no
    # AI call when logging plan-less (ADR-0033, amending ADR-0002).
    assert Provenance.USER_ENTERED.value == "user_entered"


# Execution Steps (ADR-0015): the single source of truth for the newline-split
# honesty rule. The count of steps always equals what the author wrote — one step
# per non-empty line, never a heuristic sentence chop.


def test_multi_line_prose_becomes_one_step_per_non_empty_line():
    # Arrange — an authored three-line how-to
    prose = "Brace your core.\nUnrack the bar.\nSit down between your hips."

    # Act
    steps = parse_instruction_steps(prose)

    # Assert — exactly the lines the author wrote, in order
    assert steps == [
        "Brace your core.",
        "Unrack the bar.",
        "Sit down between your hips.",
    ]


def test_single_paragraph_becomes_a_single_element_list():
    # Arrange — one paragraph with sentence punctuation but no line breaks
    prose = "Slide down a wall until your thighs are parallel. Hold the position."

    # Act
    steps = parse_instruction_steps(prose)

    # Assert — one honest step; never chopped on ". "
    assert steps == [
        "Slide down a wall until your thighs are parallel. Hold the position."
    ]


def test_blank_lines_are_dropped_and_lines_are_trimmed():
    # Arrange — blank separators and stray surrounding whitespace
    prose = "  Set your feet.  \n\n\n   Drive up.   \n"

    # Act
    steps = parse_instruction_steps(prose)

    # Assert — blank lines vanish and each surviving line is trimmed
    assert steps == ["Set your feet.", "Drive up."]


def test_none_and_blank_prose_yield_an_empty_list():
    # Assert — no instructions authored means no steps, not a fabricated one
    assert parse_instruction_steps(None) == []
    assert parse_instruction_steps("") == []
    assert parse_instruction_steps("   \n\t\n") == []


def test_rank_orders_curated_before_ai_generated():
    # Arrange — an AI-invented match precedes a curated one by name alone
    matches = [
        _Match(Provenance.AI_GENERATED.value, "air squat"),
        _Match(Provenance.CURATED.value, "back squat"),
    ]

    # Act
    ranked = rank_exercise_matches(matches)

    # Assert — the trusted curated entry is surfaced first (ADR-0002/0021)
    assert [m.provenance for m in ranked] == [
        Provenance.CURATED.value,
        Provenance.AI_GENERATED.value,
    ]


def test_rank_orders_curated_then_ai_generated_then_user_entered():
    # Arrange — one match of each Provenance, deliberately in reverse trust order
    matches = [
        _Match(Provenance.USER_ENTERED.value, "a movement"),
        _Match(Provenance.AI_GENERATED.value, "a movement"),
        _Match(Provenance.CURATED.value, "a movement"),
    ]

    # Act
    ranked = rank_exercise_matches(matches)

    # Assert — most-trusted first, least-validated (user-typed) last (ADR-0033)
    assert [m.provenance for m in ranked] == [
        Provenance.CURATED.value,
        Provenance.AI_GENERATED.value,
        Provenance.USER_ENTERED.value,
    ]


def test_rank_orders_by_normalized_name_within_a_provenance():
    # Arrange — three curated matches out of alphabetical order
    matches = [
        _Match(Provenance.CURATED.value, "goblet squat"),
        _Match(Provenance.CURATED.value, "back squat"),
        _Match(Provenance.CURATED.value, "front squat"),
    ]

    # Act
    ranked = rank_exercise_matches(matches)

    # Assert — a stable, sensible A→Z order within the tier
    assert [m.normalized_name for m in ranked] == [
        "back squat",
        "front squat",
        "goblet squat",
    ]


def test_rank_returns_a_new_list_and_leaves_the_input_untouched():
    # Arrange
    matches = [
        _Match(Provenance.AI_GENERATED.value, "zercher squat"),
        _Match(Provenance.CURATED.value, "back squat"),
    ]
    original = list(matches)

    # Act
    ranked = rank_exercise_matches(matches)

    # Assert — pure: the caller's list is not reordered in place
    assert ranked is not matches
    assert matches == original


# Catalog Completeness (ADR-0041): a read-time projection — never a stored column —
# mapping which content fields are populated to Stub → Listable → Enriched. Measured
# provenance-blind: trust (Provenance) and content-presence (Completeness) are
# separate axes, so a curated-but-thin movement still reads sub-bar.


def test_completeness_values_match_the_domain_vocabulary():
    # Assert — the exact stored strings surfaced to the client, per the glossary
    assert CatalogCompleteness.STUB.value == "stub"
    assert CatalogCompleteness.LISTABLE.value == "listable"
    assert CatalogCompleteness.ENRICHED.value == "enriched"


def test_name_only_exercise_is_a_stub():
    # Arrange — nothing but a name (every content field empty)
    # Act & Assert — the frictionless name-only movement reads as a Stub
    assert catalog_completeness(_Fields()) == CatalogCompleteness.STUB


def test_minimum_fields_are_listable():
    # Arrange — description + a flat targeted-muscle list + one Execution Step
    # Act & Assert — exactly the Listable bar, no gold fields needed
    assert catalog_completeness(_listable_fields()) == CatalogCompleteness.LISTABLE


def test_listable_does_not_require_the_emphasis_split():
    # Arrange — the minimum set carries only a flat union, no Primary/Secondary split
    fields = _listable_fields()

    # Assert — the emphasis split stays Enriched-tier only (ADR-0016): a flat list is
    # honest, and requiring a split at the minimum would pressure fabricated primacy
    assert not fields.primary_muscles and not fields.secondary_muscles
    assert catalog_completeness(fields) == CatalogCompleteness.LISTABLE


def test_missing_description_stays_below_listable():
    # Arrange — muscles and a step, but no description
    fields = _listable_fields(description=None)

    # Assert — a missing Listable field drops it back to a Stub
    assert catalog_completeness(fields) == CatalogCompleteness.STUB


def test_blank_description_does_not_count():
    # Arrange — a whitespace-only description is not a real description
    fields = _listable_fields(description="   ")

    # Assert — presence means content, not just a non-null column
    assert catalog_completeness(fields) == CatalogCompleteness.STUB


def test_missing_targeted_muscles_stays_below_listable():
    # Arrange — a described movement with a step but no targeted muscles
    fields = _listable_fields(targeted_muscles=())

    # Assert — the flat targeted-muscle list is a hard Listable requirement
    assert catalog_completeness(fields) == CatalogCompleteness.STUB


def test_missing_execution_steps_stays_below_listable():
    # Arrange — described, with muscles, but no Execution Step
    fields = _listable_fields(instructions=())

    # Assert — at least one Execution Step is required for Listable
    assert catalog_completeness(fields) == CatalogCompleteness.STUB


def test_full_gold_set_is_enriched():
    # Arrange — the Listable minimum plus every Enriched-tier field
    # Act & Assert — the gold bar: split + difficulty + precautions + image
    assert catalog_completeness(_enriched_fields()) == CatalogCompleteness.ENRICHED


def test_a_lone_primary_emphasis_counts_as_a_split():
    # Arrange — an isolation movement asserts a primary but no secondary emphasis
    fields = _enriched_fields(primary_muscles=("biceps",), secondary_muscles=())

    # Assert — any asserted emphasis is a populated split (mirrors the re-enrichment
    # pass's "already split" test), so this is still Enriched
    assert catalog_completeness(fields) == CatalogCompleteness.ENRICHED


def test_missing_emphasis_split_stays_listable():
    # Arrange — every gold field but the Primary/Secondary split
    fields = _enriched_fields(primary_muscles=(), secondary_muscles=())

    # Assert — a missing gold field keeps a fully-described movement at Listable
    assert catalog_completeness(fields) == CatalogCompleteness.LISTABLE


def test_missing_difficulty_stays_listable():
    # Arrange — gold but for difficulty
    fields = _enriched_fields(difficulty=None)

    # Assert — Listable, not Enriched
    assert catalog_completeness(fields) == CatalogCompleteness.LISTABLE


def test_missing_precautions_stays_listable():
    # Arrange — gold but for precautions
    fields = _enriched_fields(precautions=())

    # Assert — Listable, not Enriched
    assert catalog_completeness(fields) == CatalogCompleteness.LISTABLE


def test_missing_image_stays_listable():
    # Arrange — gold but for the Exercise Image
    fields = _enriched_fields(image=None)

    # Assert — the image is a gold-tier requirement; its absence caps at Listable
    assert catalog_completeness(fields) == CatalogCompleteness.LISTABLE


def test_projection_is_provenance_blind():
    # Arrange — the projection reads only content fields; it never sees Provenance,
    # so a curated-but-thin movement (name only) is held to the same yardstick
    curated_but_thin = _Fields(description=None)

    # Assert — trust does not lift content: a curated Stub still reads sub-bar
    assert catalog_completeness(curated_but_thin) == CatalogCompleteness.STUB
