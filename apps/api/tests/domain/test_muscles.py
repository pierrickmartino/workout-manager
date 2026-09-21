"""Unit tests for the canonical Muscle vocabulary (issue #539, the Muscle Atlas prefactor).

``classify_muscle`` folds each free-form muscle string into one curated, canonical
:class:`Muscle`, each of which nests under exactly one of the six real Muscle Groups, with an
``UNCLASSIFIED`` fall-through when no curated alias claims it. The vocabulary is the finer
tier beneath the coarse Muscle Group roll-up — a strict refinement that leaves the group
roll-up (``muscle_groups.classify``) unchanged. Pure — no ORM, no HTTP."""

from __future__ import annotations

from app.domain.muscle_groups import MuscleGroup, classify
from app.domain.muscles import (
    MUSCLE_TO_GROUP,
    Muscle,
    classify_muscle,
    group_of,
)
from app.domain.muscles import _FREEFORM_TO_MUSCLE

# The free-form keys the muscle map claims — read off the module's own alias table so the
# consistency test below covers exactly what is mapped (and grows automatically with it).
_FREEFORM_KEYS = tuple(_FREEFORM_TO_MUSCLE.keys())


class TestVocabularyCompleteness:
    def test_every_muscle_has_a_group(self) -> None:
        # The load-bearing invariant: no muscle can enter the vocabulary without a home
        # group — ``MUSCLE_TO_GROUP`` is exhaustive over ``Muscle``.
        for muscle in Muscle:
            assert muscle in MUSCLE_TO_GROUP

    def test_every_real_muscle_nests_under_a_real_group(self) -> None:
        # Every muscle but the leftovers bucket maps to one of the six real groups.
        for muscle in Muscle:
            if muscle is Muscle.UNCLASSIFIED:
                continue
            assert MUSCLE_TO_GROUP[muscle] in (
                MuscleGroup.LEGS,
                MuscleGroup.CHEST,
                MuscleGroup.BACK,
                MuscleGroup.SHOULDERS,
                MuscleGroup.ARMS,
                MuscleGroup.CORE,
            )

    def test_unclassified_nests_under_the_group_tiers_unclassified(self) -> None:
        # The two Unclassified buckets line up so the map stays total.
        assert MUSCLE_TO_GROUP[Muscle.UNCLASSIFIED] is MuscleGroup.UNCLASSIFIED

    def test_the_vocabulary_is_a_full_anatomical_atlas(self) -> None:
        # ~40–50 individual muscles (issue #539), excluding the leftovers bucket.
        real = [m for m in Muscle if m is not Muscle.UNCLASSIFIED]
        assert 40 <= len(real) <= 50

    def test_each_muscle_nests_under_exactly_one_group(self) -> None:
        # ``group_of`` is total and single-valued over the vocabulary: every muscle has one
        # and only one parent group (dict semantics), the "exactly one" the issue requires.
        for muscle in Muscle:
            assert isinstance(group_of(muscle), MuscleGroup)


class TestClassifyMuscleHits:
    def test_a_known_muscle_resolves_to_its_canonical_muscle(self) -> None:
        assert classify_muscle("quadriceps") is Muscle.QUADRICEPS

    def test_one_representative_muscle_per_real_group_resolves(self) -> None:
        assert group_of(classify_muscle("quadriceps")) is MuscleGroup.LEGS
        assert group_of(classify_muscle("chest")) is MuscleGroup.CHEST
        assert group_of(classify_muscle("lats")) is MuscleGroup.BACK
        assert group_of(classify_muscle("rotator cuff")) is MuscleGroup.SHOULDERS
        assert group_of(classify_muscle("biceps")) is MuscleGroup.ARMS
        assert group_of(classify_muscle("obliques")) is MuscleGroup.CORE


class TestClassifyMuscleSynonymsAndCasing:
    def test_singular_plural_and_casing_fold_to_one_muscle(self) -> None:
        for raw in ["quads", "Quad", "  QUADRICEPS  ", "quadriceps femoris"]:
            assert classify_muscle(raw) is Muscle.QUADRICEPS

    def test_synonyms_fold_across_the_body(self) -> None:
        assert classify_muscle("pecs") is Muscle.PECTORALIS_MAJOR
        assert classify_muscle("traps") is Muscle.TRAPEZIUS
        assert classify_muscle("abs") is Muscle.RECTUS_ABDOMINIS
        assert classify_muscle("calves") is Muscle.GASTROCNEMIUS
        assert classify_muscle("glutes") is Muscle.GLUTEUS_MAXIMUS

    def test_internal_whitespace_is_collapsed(self) -> None:
        assert classify_muscle("gluteus   medius") is Muscle.GLUTEUS_MEDIUS


class TestClassifyMuscleFallThrough:
    def test_an_ai_invented_muscle_falls_through_to_unclassified(self) -> None:
        # Never guessed at — an unknown string is the leftovers bucket, not a nearest match.
        assert classify_muscle("mega power core") is Muscle.UNCLASSIFIED

    def test_a_bare_region_term_is_unclassified_at_the_muscle_tier(self) -> None:
        # "back" names a Muscle Group, not one muscle — so the finer tier declines to
        # fabricate a single muscle for it, even though the group tier still rolls it up.
        assert classify_muscle("back") is Muscle.UNCLASSIFIED
        assert classify("back") is MuscleGroup.BACK

    def test_a_bare_deltoid_term_is_unclassified_but_a_specific_head_maps(self) -> None:
        # Bulk "deltoids" is ambiguous at the muscle tier (still SHOULDERS at the group
        # tier); a specific head resolves to the Deltoids muscle.
        assert classify_muscle("deltoids") is Muscle.UNCLASSIFIED
        assert classify("deltoids") is MuscleGroup.SHOULDERS
        assert classify_muscle("front delts") is Muscle.DELTOIDS

    def test_blank_and_whitespace_only_are_unclassified(self) -> None:
        assert classify_muscle("") is Muscle.UNCLASSIFIED
        assert classify_muscle("   ") is Muscle.UNCLASSIFIED


class TestConsistencyWithGroupRollUp:
    def test_the_muscle_tier_never_contradicts_the_group_roll_up(self) -> None:
        # The finer tier never *contradicts* the coarse one: wherever the group roll-up has
        # an opinion (``classify`` is not Unclassified), the muscle's parent group equals it.
        # The muscle tier may *refine* a term the group map leaves Unclassified (e.g. "hams"
        # → Hamstrings → Legs) — that adds classification, it does not disagree — so those
        # terms are permitted, not required to match. This is what keeps Muscle Split,
        # Balance, and Coverage unchanged on top of the finer vocabulary.
        for term in _FREEFORM_KEYS:
            muscle = classify_muscle(term)
            assert muscle is not Muscle.UNCLASSIFIED  # every mapped key resolves
            group = classify(term)
            if group is not MuscleGroup.UNCLASSIFIED:
                assert group_of(muscle) is group
