"""Blocked detection for Equipment Substitution (#791, ADR-0143).

An Exercise Prescription is blocked when its Exercise's required equipment is not covered
by the Available Equipment; a bodyweight movement is never blocked. Equipment is read
through the curated vocabulary (ADR-0077), so a plural or capitalized label still covers."""

from __future__ import annotations

from app.domain.equipment_substitution import is_blocked


def test_a_movement_needing_equipment_the_user_lacks_is_blocked():
    assert is_blocked(["barbell"], ["dumbbell"]) is True


def test_a_movement_whose_equipment_is_all_available_is_not_blocked():
    assert is_blocked(["barbell", "bench"], ["Barbells", "bench", "dumbbell"]) is False


def test_one_missing_item_among_several_blocks_the_movement():
    assert is_blocked(["barbell", "bench"], ["barbell"]) is True


def test_a_bodyweight_movement_is_never_blocked_even_with_no_equipment():
    assert is_blocked([], []) is False
    assert is_blocked(["bodyweight"], []) is False


def test_bodyweight_only_blocks_every_loaded_movement():
    assert is_blocked(["dumbbell"], []) is True
