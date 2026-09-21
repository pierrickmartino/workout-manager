"""Unit tests for the Equipment curated read-time vocabulary (ADR-0077).

The classifier folds each free-text equipment string into one coarse, curated **Equipment**
bucket (barbell / dumbbell / … / cardio machine / bodyweight), with an **OTHER** ("Other")
fallback when no alias claims it. The write-time boundary normalizes a mapped string to its
canonical form while keeping an unmapped string verbatim. Pure — no ORM, no HTTP."""

from __future__ import annotations

from app.domain.equipment import (
    EQUIPMENT_ORDER,
    Equipment,
    canonical_equipment,
    classify_equipment,
    normalize_stored_equipment,
)


class TestClassifyFoldsCasingAndPlurals:
    def test_barbell_singular_plural_and_casing_fold_to_one_bucket(self) -> None:
        for raw in ["barbell", "Barbell", "barbells", "  BARBELLS  "]:
            assert classify_equipment(raw) is Equipment.BARBELL

    def test_dumbbell_and_kettlebell_fold_their_variants(self) -> None:
        assert classify_equipment("Dumbbells") is Equipment.DUMBBELL
        assert classify_equipment("kettlebell") is Equipment.KETTLEBELL
        assert classify_equipment("Kettlebells") is Equipment.KETTLEBELL

    def test_hyphen_and_spacing_variants_fold(self) -> None:
        for raw in ["pull-up bar", "pull up bar", "Pull_Up Bar", "chin-up bar"]:
            assert classify_equipment(raw) is Equipment.PULL_UP_BAR


class TestClassifyAbbreviations:
    def test_kb_and_db_resolve_as_whole_word_synonyms(self) -> None:
        # The ADR calls out "kettlebell"/"KB" as a genuine synonym a keyword map must fold.
        assert classify_equipment("KB") is Equipment.KETTLEBELL
        assert classify_equipment("DB") is Equipment.DUMBBELL

    def test_abbreviation_never_fires_from_inside_an_unrelated_word(self) -> None:
        # "db"/"kb" are whole-word only, so a word that merely contains them is not swept up.
        assert classify_equipment("sandbag") is Equipment.OTHER


class TestJudgmentCalls:
    def test_floor_folds_to_bodyweight(self) -> None:  # J1
        assert classify_equipment("Floor") is Equipment.BODYWEIGHT
        assert classify_equipment("bodyweight") is Equipment.BODYWEIGHT
        assert classify_equipment("Mat") is Equipment.BODYWEIGHT

    def test_bar_positions_and_variants_fold_to_barbell(self) -> None:  # J2
        for raw in ["Low Bar", "High Bar", "EZ bar", "Olympic bar"]:
            assert classify_equipment(raw) is Equipment.BARBELL

    def test_cable_and_machine_are_separate_buckets(self) -> None:  # J3
        assert classify_equipment("cable") is Equipment.CABLE
        assert classify_equipment("cable machine") is Equipment.CABLE
        assert classify_equipment("leg press machine") is Equipment.MACHINE

    def test_cardio_machines_share_one_bucket(self) -> None:  # J4
        for raw in ["Treadmill", "Rowing Machine", "Assault Bike", "Elliptical"]:
            assert classify_equipment(raw) is Equipment.CARDIO_MACHINE

    def test_product_names_fall_to_other_rather_than_being_aliased(self) -> None:  # J5
        assert classify_equipment("Atletica R8 Bradley Combat Medium") is Equipment.OTHER
        assert classify_equipment("") is Equipment.OTHER


class TestCanonicalEquipmentProjection:
    def test_dedupes_variants_and_orders_by_canonical_order(self) -> None:
        # Arrange — messy free text with duplicates across casing/plural
        raw = ["barbells", "Barbell", "Dumbbell", "bench"]
        # Act
        result = canonical_equipment(raw)
        # Assert — one entry per bucket, in EQUIPMENT_ORDER (barbell, dumbbell, bench)
        assert result == [Equipment.BARBELL, Equipment.DUMBBELL, Equipment.BENCH]

    def test_other_is_included_only_when_present_and_ordered_last(self) -> None:
        result = canonical_equipment(["Atletica R8 Combat", "barbell"])
        assert result == [Equipment.BARBELL, Equipment.OTHER]
        assert EQUIPMENT_ORDER[-1] is Equipment.OTHER

    def test_blank_strings_contribute_nothing(self) -> None:
        assert canonical_equipment(["  ", ""]) == []


class TestNormalizeStoredEquipment:
    def test_mapped_strings_are_stored_canonically_and_deduped(self) -> None:
        # Arrange — the exact proliferation the critique names
        normalized = normalize_stored_equipment(["Barbell", "barbells", "Floor"])
        # Assert — casing/plural collapse to the canonical token; Floor → bodyweight
        assert normalized.values == ["barbell", "bodyweight"]
        assert normalized.unmapped == []

    def test_unmapped_strings_are_kept_verbatim_and_reported(self) -> None:
        # Arrange — a product name no alias claims
        normalized = normalize_stored_equipment(["barbell", "Atletica R8 Combat"])
        # Assert — the product name survives verbatim (never dropped) and is flagged
        assert normalized.values == ["barbell", "Atletica R8 Combat"]
        assert normalized.unmapped == ["Atletica R8 Combat"]

    def test_blanks_dropped_and_first_seen_order_preserved(self) -> None:
        normalized = normalize_stored_equipment(["  ", "Dumbbells", "", "cable"])
        assert normalized.values == ["dumbbell", "cable"]
