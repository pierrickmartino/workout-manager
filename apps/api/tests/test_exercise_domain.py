"""Exercise catalog identity rules.

The catalog dedups by *normalized name* (ADR-0002): same normalized string means
same Exercise, deterministically and with no AI call per write. These tests pin
the normalization (what counts as "the same name") and the Provenance values."""

from __future__ import annotations

from app.domain.exercise import (
    Provenance,
    normalize_name,
    parse_instruction_steps,
)


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
