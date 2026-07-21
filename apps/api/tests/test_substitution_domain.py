"""The lookup-first resolution rule at the heart of Substitution.

``resolve_substitute`` chooses a catalog substitute for a prescribed Exercise the
user cannot perform, filtered by the user's equipment and constraints (CONTEXT.md).
It is the deterministic, no-AI core: it returns a compatible catalog match when one
exists and otherwise signals that AI generation is required. These tests pin that
behavior over hand-built candidates so the rule is exercised in isolation."""

from __future__ import annotations

from app.domain.substitution import (
    RelationKind,
    SubstituteCandidate,
    SubstitutionContext,
    next_harder_variation,
    resolve_substitute,
)


def test_resolves_a_candidate_whose_equipment_the_user_has():
    # Arrange — one alternative that needs only a dumbbell the user owns
    candidates = [
        SubstituteCandidate(
            exercise_id=7,
            name="Goblet Squat",
            kind=RelationKind.ALTERNATIVE,
            required_equipment=("dumbbell",),
        )
    ]
    context = SubstitutionContext(available_equipment=frozenset({"dumbbell"}))

    # Act
    resolution = resolve_substitute(candidates, context)

    # Assert — the compatible catalog match is served, no AI needed
    assert resolution.needs_ai_fallback is False
    assert resolution.candidate is not None
    assert resolution.candidate.exercise_id == 7


def test_signals_ai_fallback_when_no_candidate_equipment_fits():
    # Arrange — the only candidate needs a barbell the user does not have
    candidates = [
        SubstituteCandidate(
            exercise_id=3,
            name="Barbell Front Squat",
            kind=RelationKind.VARIATION,
            required_equipment=("barbell",),
        )
    ]
    context = SubstitutionContext(available_equipment=frozenset({"dumbbell"}))

    # Act
    resolution = resolve_substitute(candidates, context)

    # Assert — no catalog link fits, so AI generation is required
    assert resolution.needs_ai_fallback is True
    assert resolution.candidate is None


def test_excludes_a_candidate_contraindicated_by_a_user_constraint():
    # Arrange — the user can't jump; the only equipment-fitting candidate jumps
    candidates = [
        SubstituteCandidate(
            exercise_id=9,
            name="Jump Squat",
            kind=RelationKind.VARIATION,
            required_equipment=(),
            contraindications=("no jumping",),
        )
    ]
    context = SubstitutionContext(constraints=frozenset({"no jumping"}))

    # Act
    resolution = resolve_substitute(candidates, context)

    # Assert — equipment fits but the constraint rules it out → AI fallback
    assert resolution.needs_ai_fallback is True
    assert resolution.candidate is None


def test_prefers_a_variation_over_an_alternative_when_both_fit():
    # Arrange — an alternative is listed first, but a variation also fits
    candidates = [
        SubstituteCandidate(
            exercise_id=1, name="Leg Press", kind=RelationKind.ALTERNATIVE
        ),
        SubstituteCandidate(
            exercise_id=2, name="Box Squat", kind=RelationKind.VARIATION
        ),
    ]
    context = SubstitutionContext()

    # Act
    resolution = resolve_substitute(candidates, context)

    # Assert — the same-movement Variation is the closer swap
    assert resolution.candidate is not None
    assert resolution.candidate.exercise_id == 2


# --- next_harder_variation: the harder-Variation resolver (#202 / ADR-0026) ---


def test_next_harder_variation_picks_the_easiest_step_up():
    # Arrange — the current movement is difficulty 5; two harder Variations exist
    candidates = [
        SubstituteCandidate(
            exercise_id=1,
            name="One-Arm Push-Up",
            kind=RelationKind.VARIATION,
            difficulty=9,
        ),
        SubstituteCandidate(
            exercise_id=2,
            name="Archer Push-Up",
            kind=RelationKind.VARIATION,
            difficulty=7,
        ),
    ]

    # Act
    harder = next_harder_variation(current_difficulty=5, candidates=candidates)

    # Assert — progression by difficulty is one honest step up, not the hardest jump
    assert harder is not None
    assert harder.exercise_id == 2


def test_next_harder_variation_ignores_easier_and_equal_variations():
    # Arrange — a regression (easier) and a same-difficulty Variation, both linked
    candidates = [
        SubstituteCandidate(
            exercise_id=1,
            name="Knee Push-Up",
            kind=RelationKind.VARIATION,
            difficulty=3,
        ),
        SubstituteCandidate(
            exercise_id=2,
            name="Push-Up (wide)",
            kind=RelationKind.VARIATION,
            difficulty=5,
        ),
    ]

    # Act
    harder = next_harder_variation(current_difficulty=5, candidates=candidates)

    # Assert — nothing is strictly harder, so there is no step up to offer
    assert harder is None


def test_next_harder_variation_ignores_alternatives():
    # Arrange — a harder movement, but linked as an Alternative (different movement)
    candidates = [
        SubstituteCandidate(
            exercise_id=1,
            name="Barbell Bench Press",
            kind=RelationKind.ALTERNATIVE,
            difficulty=8,
        ),
    ]

    # Act
    harder = next_harder_variation(current_difficulty=5, candidates=candidates)

    # Assert — a harder Variation must be the *same* movement scaled, not a swap
    assert harder is None


def test_next_harder_variation_holds_when_current_difficulty_is_unknown():
    # Arrange — the current movement carries no difficulty to compare against
    candidates = [
        SubstituteCandidate(
            exercise_id=1,
            name="Archer Push-Up",
            kind=RelationKind.VARIATION,
            difficulty=7,
        ),
    ]

    # Act
    harder = next_harder_variation(current_difficulty=None, candidates=candidates)

    # Assert — without a baseline we cannot know a Variation is harder; hold
    assert harder is None


def test_next_harder_variation_skips_variations_missing_a_difficulty():
    # Arrange — a harder-looking Variation with no recorded difficulty
    candidates = [
        SubstituteCandidate(
            exercise_id=1,
            name="Mystery Push-Up",
            kind=RelationKind.VARIATION,
            difficulty=None,
        ),
    ]

    # Act
    harder = next_harder_variation(current_difficulty=5, candidates=candidates)

    # Assert — an unrated Variation cannot be confirmed harder; it is skipped
    assert harder is None
