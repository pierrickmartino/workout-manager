"""Behavior of the curated Avatar catalog, its unlock rule (issue #750, ADR-0136) and the
character names each Avatar Universe gives it (ADR-0137).

Three Avatars are free; the rest of the roster is earned by Operator Level alone. The
lock state is a pure function of the level, read each time, so these tests ask the
domain directly with a level and never touch a store."""

from __future__ import annotations

import dataclasses

from app.domain.avatars import (
    AVATAR_CATALOG,
    AVATAR_NAMES,
    AVATAR_UNIVERSES,
    DEFAULT_AVATAR_UNIVERSE,
    Avatar,
    AvatarStanding,
    avatar_name,
    avatar_standings,
    find_avatar,
    resolve_avatar_universe,
)


def standing_of(avatar_id: str, operator_level: int) -> AvatarStanding:
    """The standing ``avatar_standings`` reports for ``avatar_id`` at ``operator_level``."""

    return next(s for s in avatar_standings(operator_level) if s.avatar.id == avatar_id)


def test_the_catalog_lists_the_free_then_the_earned_avatars_in_order() -> None:
    # Act
    roster = [
        (avatar_name(avatar, "realm"), avatar.unlock_level) for avatar in AVATAR_CATALOG
    ]

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


def test_an_avatar_holds_only_an_id_and_an_unlock_level() -> None:
    # Act — nothing else, such as a Training Type or an Achievement, can gate it; its
    # name belongs to the universe it is shown in
    fields = [field.name for field in dataclasses.fields(Avatar)]

    # Assert
    assert fields == ["id", "unlock_level"]


def test_there_are_three_universes_and_the_realm_is_the_default() -> None:
    # Assert
    assert AVATAR_UNIVERSES == ("realm", "orbit", "olympus")
    assert DEFAULT_AVATAR_UNIVERSE == "realm"


def test_every_universe_names_every_catalog_avatar_and_nothing_else() -> None:
    # Arrange
    catalog_ids = {avatar.id for avatar in AVATAR_CATALOG}

    # Assert — a universe missing a name, or naming a retired id, fails here
    assert set(AVATAR_NAMES) == set(AVATAR_UNIVERSES)
    for universe in AVATAR_UNIVERSES:
        assert set(AVATAR_NAMES[universe]) == catalog_ids


def test_each_universe_casts_the_same_avatar_as_a_different_character() -> None:
    # Arrange
    titan = find_avatar("titan")
    assert titan is not None

    # Act
    names = [avatar_name(titan, universe) for universe in AVATAR_UNIVERSES]

    # Assert
    assert names == ["Titan", "Colossus", "Atlas"]


def test_an_absent_or_unknown_universe_reads_as_the_realm() -> None:
    # Assert — reading is tolerant, like a stored Avatar id
    assert resolve_avatar_universe(None) == "realm"
    assert resolve_avatar_universe("atlantis") == "realm"
    assert resolve_avatar_universe("orbit") == "orbit"


def test_standings_lock_every_avatar_above_the_operator_level() -> None:
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


def test_progress_toward_a_locked_avatar_is_the_operator_level() -> None:
    # Act
    valkyrie = standing_of("valkyrie", 5)

    # Assert — reads as "LVL 5 / 8"
    assert (valkyrie.current_level, valkyrie.avatar.unlock_level) == (5, 8)


def test_progress_holds_at_the_unlock_level_once_reached() -> None:
    # Act
    monk = standing_of("monk", 9)

    # Assert
    assert (monk.unlocked, monk.current_level) == (True, 3)


def test_every_earned_avatar_is_found_by_its_id() -> None:
    # Act & Assert
    for avatar_id in ("monk", "barbarian", "valkyrie", "paladin", "titan"):
        assert find_avatar(avatar_id) is not None
