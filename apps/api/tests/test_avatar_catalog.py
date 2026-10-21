"""Behavior of the curated Avatar catalog and its unlock rule (issue #750, ADR-0136).

Three Avatars are free; the rest of the roster is earned by Operator Level alone. The
lock state is a pure function of the level, read each time, so these tests ask the
domain directly with a level and never touch a store."""

from __future__ import annotations

import dataclasses

from app.domain.avatars import (
    AVATAR_CATALOG,
    Avatar,
    avatar_standings,
    find_avatar,
)


def test_the_catalog_lists_the_free_then_the_earned_avatars_in_order():
    # Act
    roster = [(avatar.name, avatar.unlock_level) for avatar in AVATAR_CATALOG]

    # Assert
    assert roster == [
        ("Novice", 1),
        ("Dwarf Lifter", 1),
        ("Elf Ranger", 1),
        ("Monk", 3),
        ("Barbarian", 5),
        ("Valkyrie", 8),
        ("Paladin", 12),
        ("Titan", 20),
    ]


def test_an_avatar_holds_only_an_id_a_name_and_an_unlock_level():
    # Act — nothing else, such as a Training Type or an Achievement, can gate it
    fields = [field.name for field in dataclasses.fields(Avatar)]

    # Assert
    assert fields == ["id", "name", "unlock_level"]


def test_standings_lock_every_avatar_above_the_operator_level():
    # Act
    standings = avatar_standings(5)

    # Assert
    assert {s.avatar.id: s.unlocked for s in standings} == {
        "novice": True,
        "dwarf-lifter": True,
        "elf-ranger": True,
        "monk": True,
        "barbarian": True,
        "valkyrie": False,
        "paladin": False,
        "titan": False,
    }


def test_progress_toward_a_locked_avatar_is_the_operator_level():
    # Act
    valkyrie = next(s for s in avatar_standings(5) if s.avatar.id == "valkyrie")

    # Assert — reads as "LVL 5 / 8"
    assert (valkyrie.current_level, valkyrie.avatar.unlock_level) == (5, 8)


def test_progress_holds_at_the_unlock_level_once_reached():
    # Act
    monk = next(s for s in avatar_standings(9) if s.avatar.id == "monk")

    # Assert
    assert (monk.unlocked, monk.current_level) == (True, 3)


def test_every_earned_avatar_is_found_by_its_id():
    # Act & Assert
    for avatar_id in ("monk", "barbarian", "valkyrie", "paladin", "titan"):
        assert find_avatar(avatar_id) is not None
