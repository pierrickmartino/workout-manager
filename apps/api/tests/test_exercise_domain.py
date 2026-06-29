"""Exercise catalog identity rules.

The catalog dedups by *normalized name* (ADR-0002): same normalized string means
same Exercise, deterministically and with no AI call per write. These tests pin
the normalization (what counts as "the same name") and the Provenance values."""

from __future__ import annotations

from app.domain.exercise import Provenance, normalize_name


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
