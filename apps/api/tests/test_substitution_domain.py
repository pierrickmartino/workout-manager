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
