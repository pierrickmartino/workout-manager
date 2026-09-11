"""Unit tests for the Interface Preference domain value (Mode + Keep Screen Awake
+ Weight Unit).

Pure, I/O-free facts: the shipped defaults and the ``with_overrides`` facet merge
that lets the Mode picker, the Keep-Screen-Awake toggle, and the Weight-Unit toggle
each save only their own facet without disturbing the others (ADR-0055)."""

from __future__ import annotations

from app.domain.appearance import (
    DEFAULT_INTERFACE_PREFERENCE,
    DEFAULT_KEEP_SCREEN_AWAKE,
    DEFAULT_MODE,
    DEFAULT_WEIGHT_UNIT,
    InterfacePreference,
    Mode,
    WeightUnit,
)


def test_default_preference_is_dark_awake_and_kilograms():
    # Assert — the shipped defaults preserve today's look and expected gym behaviour,
    # and Weight Unit defaults to kilograms (CONTEXT "Weight Unit")
    assert DEFAULT_MODE == Mode.DARK
    assert DEFAULT_KEEP_SCREEN_AWAKE is True
    assert DEFAULT_WEIGHT_UNIT == WeightUnit.KG
    assert DEFAULT_INTERFACE_PREFERENCE == InterfacePreference(
        mode=Mode.DARK, keep_screen_awake=True, weight_unit=WeightUnit.KG
    )


def test_weight_unit_is_a_closed_two_value_set():
    # Assert — the facet is exactly kg | lb, stored as its raw value
    assert {unit.value for unit in WeightUnit} == {"kg", "lb"}


def test_with_overrides_replaces_only_the_supplied_weight_unit():
    # Arrange
    original = InterfacePreference(mode=Mode.LIGHT, keep_screen_awake=False)

    # Act — change only Weight Unit
    updated = original.with_overrides(weight_unit=WeightUnit.LB)

    # Assert — Weight Unit changed, the other facets left as-is; original untouched
    assert updated == InterfacePreference(
        mode=Mode.LIGHT, keep_screen_awake=False, weight_unit=WeightUnit.LB
    )
    assert original.weight_unit == WeightUnit.KG


def test_with_overrides_replaces_only_the_supplied_mode():
    # Arrange
    original = InterfacePreference(mode=Mode.DARK, keep_screen_awake=False)

    # Act — change only Mode
    updated = original.with_overrides(mode=Mode.LIGHT)

    # Assert — Mode changed, Keep Screen Awake left as-is; original untouched
    assert updated == InterfacePreference(mode=Mode.LIGHT, keep_screen_awake=False)
    assert original == InterfacePreference(mode=Mode.DARK, keep_screen_awake=False)


def test_with_overrides_replaces_only_the_supplied_keep_screen_awake():
    # Arrange
    original = InterfacePreference(mode=Mode.LIGHT, keep_screen_awake=True)

    # Act — change only Keep Screen Awake
    updated = original.with_overrides(keep_screen_awake=False)

    # Assert — the behavioural facet changed, Mode preserved
    assert updated == InterfacePreference(mode=Mode.LIGHT, keep_screen_awake=False)


def test_with_overrides_leaves_the_value_unchanged_when_nothing_supplied():
    # Arrange
    original = InterfacePreference(mode=Mode.SYSTEM, keep_screen_awake=False)

    # Act / Assert — no facets supplied yields an equal value
    assert original.with_overrides() == original
