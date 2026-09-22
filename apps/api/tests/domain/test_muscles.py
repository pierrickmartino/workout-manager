"""Unit tests for the canonical Muscle vocabulary (issue #539, the Muscle Atlas prefactor).

``classify_muscle`` folds each free-form muscle string into one curated, canonical
:class:`Muscle`, each of which nests under exactly one of the six real Muscle Groups, with an
``UNCLASSIFIED`` fall-through when no curated alias claims it. The vocabulary is the finer
tier beneath the coarse Muscle Group roll-up — a strict refinement that leaves the group
roll-up (``muscle_groups.classify``) unchanged. Pure — no ORM, no HTTP."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

import pytest

from app.domain.muscle_groups import (
    MuscleGroup,
    classify,
    covered_groups,
)
from app.domain.muscles import (
    MUSCLE_ORDER,
    MUSCLE_TO_GROUP,
    MUSCLES_IN_GROUP,
    PRIMARY_EMPHASIS_WEIGHT,
    SECONDARY_EMPHASIS_WEIGHT,
    Muscle,
    MuscleCoverage,
    classify_muscle,
    exercise_muscle_highlight,
    group_of,
    recent_muscle_coverage,
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


# ``recent_muscle_coverage`` — the finer per-muscle tier of the Muscle Atlas coverage read
# (issue #540, ADR-0073/0078): each canonical Muscle's presence, emphasis-weighted volume, and
# contributing exercises over the same fixed 8-week window as the six-group roll-up. Descriptive
# only — presence + heat, never a target or a rank. The group tier is the source of truth for
# what is on the map, so the finer read can never contradict it.


@dataclass
class _Set:
    """A Logged Set stub carrying the emphasis split and Exercise name the per-muscle read
    reads. ``targeted_muscles`` is the flat union the ``no split → all primary`` fallback uses."""

    targeted_muscles: list[str] = field(default_factory=list)
    primary_muscles: list[str] = field(default_factory=list)
    secondary_muscles: list[str] = field(default_factory=list)
    exercise_name: str = ""


@dataclass
class _Session:
    """A dated Logged Session: the ``performed_on`` the coverage window buckets on, plus sets."""

    performed_on: date
    logged_sets: list[_Set] = field(default_factory=list)


# A Wednesday; its ISO week opens Mon 2026-07-06. An 8-week window reaches back to Mon 2026-05-18.
_TODAY = date(2026, 7, 8)


def _row(coverage, muscle: Muscle) -> MuscleCoverage:
    return next(row for row in coverage.muscles if row.muscle is muscle)


def _present(coverage) -> set[Muscle]:
    return {row.muscle for row in coverage.muscles if row.present}


class TestEmphasisWeighting:
    def test_primary_muscles_get_full_weight_secondary_a_fraction(self) -> None:
        # Arrange — a bench press with an asserted split: chest primary, arms/shoulders assist
        history = [
            _Session(
                _TODAY,
                [
                    _Set(
                        targeted_muscles=["chest", "triceps", "front delts"],
                        primary_muscles=["chest"],
                        secondary_muscles=["triceps", "front delts"],
                        exercise_name="Bench Press",
                    )
                ],
            )
        ]

        # Act
        coverage = recent_muscle_coverage(history, reference=_TODAY, weeks=8)

        # Assert — the prime mover reads at full weight, the assistors at the fraction
        assert _row(coverage, Muscle.PECTORALIS_MAJOR).volume == PRIMARY_EMPHASIS_WEIGHT
        assert _row(coverage, Muscle.TRICEPS_BRACHII).volume == SECONDARY_EMPHASIS_WEIGHT
        assert _row(coverage, Muscle.DELTOIDS).volume == SECONDARY_EMPHASIS_WEIGHT

    def test_no_asserted_split_falls_back_to_all_primary(self) -> None:
        # Arrange — a squat carrying only the flat union, no primary/secondary split
        history = [
            _Session(
                _TODAY,
                [_Set(targeted_muscles=["quadriceps", "glutes"], exercise_name="Back Squat")],
            )
        ]

        # Act
        coverage = recent_muscle_coverage(history, reference=_TODAY, weeks=8)

        # Assert — the whole union rides as primary, so both muscles read at full weight
        assert _row(coverage, Muscle.QUADRICEPS).volume == PRIMARY_EMPHASIS_WEIGHT
        assert _row(coverage, Muscle.GLUTEUS_MAXIMUS).volume == PRIMARY_EMPHASIS_WEIGHT

    def test_presence_is_any_weight_not_a_threshold(self) -> None:
        # Arrange — a muscle trained only as a secondary assistor
        history = [
            _Session(
                _TODAY,
                [
                    _Set(
                        targeted_muscles=["chest", "triceps"],
                        primary_muscles=["chest"],
                        secondary_muscles=["triceps"],
                        exercise_name="Bench Press",
                    )
                ],
            )
        ]

        # Act / Assert — even a fractional contribution reads present (presence, not a cutoff)
        coverage = recent_muscle_coverage(history, reference=_TODAY, weeks=8)
        assert _row(coverage, Muscle.TRICEPS_BRACHII).present is True
        assert _row(coverage, Muscle.TRICEPS_BRACHII).volume == SECONDARY_EMPHASIS_WEIGHT

    def test_volume_accumulates_across_in_window_sets(self) -> None:
        # Arrange — three all-primary squat sets in-window
        history = [
            _Session(
                _TODAY,
                [_Set(targeted_muscles=["quadriceps"], exercise_name="Back Squat") for _ in range(3)],
            )
        ]

        # Act / Assert — the muscle's heat is the summed weight, three full-weight sets
        coverage = recent_muscle_coverage(history, reference=_TODAY, weeks=8)
        assert _row(coverage, Muscle.QUADRICEPS).volume == 3 * PRIMARY_EMPHASIS_WEIGHT


class TestCoarseDataSpread:
    def test_a_coarse_group_term_spreads_evenly_across_its_group(self) -> None:
        # Arrange — a set naming only the group-level "back" (all-primary fallback)
        history = [_Session(_TODAY, [_Set(targeted_muscles=["back"], exercise_name="Pull-up")])]

        # Act
        coverage = recent_muscle_coverage(history, reference=_TODAY, weeks=8)

        # Assert — the full weight spreads evenly across every muscle nested under Back, so the
        # region is lit rather than a sea of grey, and the spread conserves the set's weight
        back_muscles = MUSCLES_IN_GROUP[MuscleGroup.BACK]
        share = PRIMARY_EMPHASIS_WEIGHT / len(back_muscles)
        for muscle in back_muscles:
            assert _row(coverage, muscle).present is True
            assert _row(coverage, muscle).volume == pytest.approx(share)
        total = sum(_row(coverage, muscle).volume for muscle in back_muscles)
        assert total == pytest.approx(PRIMARY_EMPHASIS_WEIGHT)

    def test_a_specific_term_sharpens_onto_one_muscle(self) -> None:
        # Arrange — the same group, but the data now names a specific muscle
        history = [_Session(_TODAY, [_Set(targeted_muscles=["lats"], exercise_name="Pull-up")])]

        # Act
        coverage = recent_muscle_coverage(history, reference=_TODAY, weeks=8)

        # Assert — the map sharpens: all the weight lands on Latissimus Dorsi, the rest of the
        # Back muscles stay dark (no spread when a specific muscle is named)
        assert _present(coverage) == {Muscle.LATISSIMUS_DORSI}
        assert _row(coverage, Muscle.LATISSIMUS_DORSI).volume == PRIMARY_EMPHASIS_WEIGHT


class TestContributingExercises:
    def test_exercises_are_ranked_most_sets_first_then_alphabetically(self) -> None:
        # Arrange — Quadriceps trained by three exercises with 3 / 3 / 1 sets; the two tied at 3
        # must break alphabetically so the order is deterministic
        sets = (
            [_Set(targeted_muscles=["quadriceps"], exercise_name="Back Squat")] * 3
            + [_Set(targeted_muscles=["quadriceps"], exercise_name="Front Squat")] * 3
            + [_Set(targeted_muscles=["quadriceps"], exercise_name="Leg Extension")]
        )
        history = [_Session(_TODAY, sets)]

        # Act
        row = _row(recent_muscle_coverage(history, reference=_TODAY, weeks=8), Muscle.QUADRICEPS)

        # Assert — sorted by set count desc, then name asc
        assert [(e.name, e.sets) for e in row.contributing_exercises] == [
            ("Back Squat", 3),
            ("Front Squat", 3),
            ("Leg Extension", 1),
        ]

    def test_a_coarse_term_credits_its_exercise_to_every_spread_muscle(self) -> None:
        # Arrange — a coarse "back" set: the exercise behind it explains each spread muscle
        history = [_Session(_TODAY, [_Set(targeted_muscles=["back"], exercise_name="Row")])]

        # Act
        coverage = recent_muscle_coverage(history, reference=_TODAY, weeks=8)

        # Assert — the one set counts once toward each Back muscle it spread onto
        for muscle in MUSCLES_IN_GROUP[MuscleGroup.BACK]:
            assert [(e.name, e.sets) for e in _row(coverage, muscle).contributing_exercises] == [
                ("Row", 1)
            ]

    def test_an_untrained_muscle_has_zero_volume_and_no_exercises(self) -> None:
        # Arrange — only Chest trained; a Legs muscle is never touched
        history = [_Session(_TODAY, [_Set(targeted_muscles=["chest"], exercise_name="Bench Press")])]

        # Act
        row = _row(recent_muscle_coverage(history, reference=_TODAY, weeks=8), Muscle.QUADRICEPS)

        # Assert — an honest empty muscle: absent, zero heat, no exercises
        assert row.present is False
        assert row.volume == 0.0
        assert row.contributing_exercises == ()


class TestWindow:
    def test_out_of_window_work_is_ignored(self) -> None:
        # Arrange — Legs trained a day before the 8-week window opens (Mon 2026-05-18)
        history = [
            _Session(date(2026, 5, 17), [_Set(targeted_muscles=["quadriceps"], exercise_name="Squat")])
        ]

        # Act / Assert — out-of-window work lights nothing
        coverage = recent_muscle_coverage(history, reference=_TODAY, weeks=8)
        assert _present(coverage) == set()

    def test_the_earliest_week_in_the_window_still_counts(self) -> None:
        # Arrange — trained on the Monday the window opens (inclusive of its eighth week back)
        history = [
            _Session(date(2026, 5, 18), [_Set(targeted_muscles=["chest"], exercise_name="Bench Press")])
        ]

        # Act / Assert — the boundary week counts
        coverage = recent_muscle_coverage(history, reference=_TODAY, weeks=8)
        assert _row(coverage, Muscle.PECTORALIS_MAJOR).present is True


class TestShape:
    def test_returns_every_real_muscle_in_canonical_order_no_unclassified_row(self) -> None:
        # Arrange — any history at all
        history = [_Session(_TODAY, [_Set(targeted_muscles=["chest"], exercise_name="Bench Press")])]

        # Act
        coverage = recent_muscle_coverage(history, reference=_TODAY, weeks=8)

        # Assert — exactly MUSCLE_ORDER, in order, Unclassified never a row
        assert tuple(row.muscle for row in coverage.muscles) == MUSCLE_ORDER
        assert Muscle.UNCLASSIFIED not in {row.muscle for row in coverage.muscles}

    def test_empty_history_reads_every_muscle_absent(self) -> None:
        # Arrange / Act — no history
        coverage = recent_muscle_coverage([], reference=_TODAY, weeks=8)

        # Assert — still every real muscle, all absent with zero heat, nothing off-map
        assert tuple(row.muscle for row in coverage.muscles) == MUSCLE_ORDER
        assert all(row.present is False and row.volume == 0.0 for row in coverage.muscles)
        assert coverage.unclassified_present is False
        assert coverage.unclassified_volume == 0.0


class TestUnclassifiedDisclosure:
    def test_a_string_neither_muscle_nor_group_is_disclosed_not_folded(self) -> None:
        # Arrange — an AI-invented muscle the group tier can't place either
        history = [_Session(_TODAY, [_Set(targeted_muscles=["unobtainium"], exercise_name="Aerial Silks")])]

        # Act
        coverage = recent_muscle_coverage(history, reference=_TODAY, weeks=8)

        # Assert — no muscle is lit, and the off-map weight is disclosed, never dropped
        assert _present(coverage) == set()
        assert coverage.unclassified_present is True
        assert coverage.unclassified_volume == PRIMARY_EMPHASIS_WEIGHT

    def test_a_fine_only_alias_the_group_tier_cannot_place_stays_off_map(self) -> None:
        # Arrange — "supraspinatus" is a fine-map alias the coarse group map does not carry, so
        # the group tier leaves it Unclassified; the finer read must not light a Shoulders muscle
        # the roll-up leaves dark — the two tiers can never disagree.
        history = [_Session(_TODAY, [_Set(targeted_muscles=["supraspinatus"], exercise_name="Y-Raise")])]

        # Act
        coverage = recent_muscle_coverage(history, reference=_TODAY, weeks=8)

        # Assert — nothing lit; the group tier is the source of truth for what is on the map
        assert _present(coverage) == set()
        assert coverage.unclassified_present is True

    def test_off_map_work_leaves_real_muscles_untouched(self) -> None:
        # Arrange — a real Chest set beside an off-map one, both in-window
        history = [
            _Session(
                _TODAY,
                [
                    _Set(targeted_muscles=["chest"], exercise_name="Bench Press"),
                    _Set(targeted_muscles=["unobtainium"], exercise_name="Aerial Silks"),
                ],
            )
        ]

        # Act
        coverage = recent_muscle_coverage(history, reference=_TODAY, weeks=8)

        # Assert — the real work is untouched, the off-map work disclosed alongside it
        assert _row(coverage, Muscle.PECTORALIS_MAJOR).present is True
        assert coverage.unclassified_present is True


class TestGroupRollUpConsistency:
    def test_present_muscles_roll_up_exactly_to_the_covered_groups(self) -> None:
        # Arrange — a realistic mixed history: a bench (split), a squat (all-primary), a coarse
        # "back" set, and off-map work. ``targeted_muscles`` is the union primary ∪ secondary,
        # exactly as the record carries it, so the group tier reads the same strings.
        history = [
            _Session(
                _TODAY,
                [
                    _Set(
                        targeted_muscles=["chest", "triceps", "front delts"],
                        primary_muscles=["chest"],
                        secondary_muscles=["triceps", "front delts"],
                        exercise_name="Bench Press",
                    ),
                    _Set(targeted_muscles=["quadriceps", "glutes"], exercise_name="Back Squat"),
                    _Set(targeted_muscles=["back"], exercise_name="Row"),
                    _Set(targeted_muscles=["unobtainium"], exercise_name="Aerial Silks"),
                ],
            )
        ]

        # Act
        coverage = recent_muscle_coverage(history, reference=_TODAY, weeks=8)

        # Assert — the parent groups of every present muscle are *exactly* the covered groups the
        # six-group roll-up reports: the map and its per-muscle detail can never disagree.
        present_groups = {group_of(muscle) for muscle in _present(coverage)}
        assert present_groups == covered_groups(history)

    def test_a_covered_group_always_has_at_least_one_present_muscle(self) -> None:
        # Arrange — a coarse group term is the only work: the group is covered at the roll-up, so
        # the finer read must light at least one muscle under it (never a covered-but-grey region)
        history = [_Session(_TODAY, [_Set(targeted_muscles=["shoulders"], exercise_name="Overhead Press")])]

        # Act
        coverage = recent_muscle_coverage(history, reference=_TODAY, weeks=8)

        # Assert — every covered group has a present muscle beneath it
        for group in covered_groups(history):
            assert any(row.present for row in coverage.muscles if row.group is group)

    def test_a_split_muscle_outside_the_union_never_lights_an_uncovered_group(self) -> None:
        # Arrange — a drifted split (ADR-0016 stores split and union independently): the
        # secondary names "triceps", but the flat union does not carry it. The union is what the
        # group roll-up reads, so Arms is NOT covered — and the finer read must not light a
        # Triceps under an uncovered Arms, or the map and its detail would contradict.
        history = [
            _Session(
                _TODAY,
                [
                    _Set(
                        targeted_muscles=["chest"],
                        primary_muscles=["chest"],
                        secondary_muscles=["triceps"],
                        exercise_name="Bench Press",
                    )
                ],
            )
        ]

        # Act
        coverage = recent_muscle_coverage(history, reference=_TODAY, weeks=8)

        # Assert — only the union's muscle lights; presence rolls up exactly to covered groups
        assert _present(coverage) == {Muscle.PECTORALIS_MAJOR}
        assert _row(coverage, Muscle.TRICEPS_BRACHII).present is False
        assert {group_of(m) for m in _present(coverage)} == covered_groups(history)

    def test_the_union_drives_presence_when_a_split_omits_a_targeted_muscle(self) -> None:
        # Arrange — the mirror drift: the union carries "triceps" but the asserted split names
        # it in neither list. A covered group (Arms) must still have a lit muscle beneath it —
        # an incomplete split never leaves a covered region grey — so it defaults to full weight.
        history = [
            _Session(
                _TODAY,
                [
                    _Set(
                        targeted_muscles=["chest", "triceps"],
                        primary_muscles=["chest"],
                        secondary_muscles=[],
                        exercise_name="Bench Press",
                    )
                ],
            )
        ]

        # Act
        coverage = recent_muscle_coverage(history, reference=_TODAY, weeks=8)

        # Assert — the union's Triceps lights (at full default weight), and every covered group
        # has a present muscle: the roll-up agrees in both directions regardless of the split
        assert _row(coverage, Muscle.TRICEPS_BRACHII).present is True
        assert _row(coverage, Muscle.TRICEPS_BRACHII).volume == PRIMARY_EMPHASIS_WEIGHT
        assert {group_of(m) for m in _present(coverage)} == covered_groups(history)


# ``exercise_muscle_highlight`` — the single-exercise Atlas highlight (issue #544). Resolves one
# Exercise's own Primary/Secondary muscles into the canonical Muscles to light on the anatomical
# figure, distinct from the aggregate windowed coverage read: it shares ``classify_muscle`` and the
# same on-map/coarse-spread partition, not the coverage read. A specific muscle resolves to itself;
# a coarse group-level term resolves to its group (the consuming figure spreads it); an off-map term
# is disclosed by its absence. The "no asserted split → all primary" fallback mirrors ``emphasis_of``.


@dataclass
class _Exercise:
    """A catalog Exercise stub carrying the three muscle fields the highlight reads (ADR-0016)."""

    targeted_muscles: list[str] = field(default_factory=list)
    primary_muscles: list[str] = field(default_factory=list)
    secondary_muscles: list[str] = field(default_factory=list)


class TestExerciseMuscleHighlight:
    def test_specific_muscles_resolve_to_themselves_split_by_emphasis(self) -> None:
        # Arrange — a bench press naming specific muscles, chest primary, arms/shoulders assist
        exercise = _Exercise(
            targeted_muscles=["chest", "triceps", "front delts"],
            primary_muscles=["chest"],
            secondary_muscles=["triceps", "front delts"],
        )

        # Act
        highlight = exercise_muscle_highlight(exercise)

        # Assert — each free-form term folds to its canonical muscle, kept in its emphasis lane
        assert highlight.primary.muscles == (Muscle.PECTORALIS_MAJOR,)
        assert highlight.primary.groups == ()
        assert highlight.secondary.muscles == (Muscle.TRICEPS_BRACHII, Muscle.DELTOIDS)
        assert highlight.secondary.groups == ()

    def test_a_coarse_group_term_resolves_to_its_group_not_a_guessed_muscle(self) -> None:
        # Arrange — a plank whose only asserted muscle is the bare region term "core"
        exercise = _Exercise(primary_muscles=["core"])

        # Act
        highlight = exercise_muscle_highlight(exercise)

        # Assert — a bare region names a group, not one muscle: it lands in ``groups`` (the figure
        # spreads it across the group), never fabricated onto a single muscle
        assert highlight.primary.muscles == ()
        assert highlight.primary.groups == (MuscleGroup.CORE,)
        assert highlight.secondary.muscles == ()
        assert highlight.secondary.groups == ()

    def test_no_asserted_split_falls_back_to_all_primary(self) -> None:
        # Arrange — a squat carrying only the flat union, no primary/secondary split
        exercise = _Exercise(targeted_muscles=["quadriceps", "glutes"])

        # Act
        highlight = exercise_muscle_highlight(exercise)

        # Assert — the whole union rides as primary (mirrors ``emphasis_of``), no secondary
        assert highlight.primary.muscles == (Muscle.QUADRICEPS, Muscle.GLUTEUS_MAXIMUS)
        assert highlight.secondary.muscles == ()
        assert highlight.secondary.groups == ()

    def test_off_map_muscles_are_disclosed_by_absence(self) -> None:
        # Arrange — an AI-invented muscle the group tier cannot place
        exercise = _Exercise(primary_muscles=["mega power core"])

        # Act
        highlight = exercise_muscle_highlight(exercise)

        # Assert — off-map work lights nothing and never guesses a region
        assert highlight.primary.muscles == ()
        assert highlight.primary.groups == ()

    def test_duplicate_terms_collapse_and_keep_first_seen_order(self) -> None:
        # Arrange — synonyms that fold to the same muscle plus a repeated group term
        exercise = _Exercise(
            primary_muscles=["quads", "quadriceps", "back", "lats", "back"],
        )

        # Act
        highlight = exercise_muscle_highlight(exercise)

        # Assert — each canonical target appears once, in first-seen order
        assert highlight.primary.muscles == (Muscle.QUADRICEPS, Muscle.LATISSIMUS_DORSI)
        assert highlight.primary.groups == (MuscleGroup.BACK,)
