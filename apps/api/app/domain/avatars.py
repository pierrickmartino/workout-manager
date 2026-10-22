"""Avatar catalog: the curated, fixed roster of workout characters (ADR-0136, ADR-0137).

An **Avatar** (GLOSSARY "Avatar") is the character a user chooses to represent
themselves in the header and on Profile. The choice is a stored **Interface
Preference**, so it never reaches the Fitness Profile, generation or its cache key.
The catalog lives here, in pure domain code: never user-authored, each entry an id and
the Operator Level that unlocks it. Each character is loosely themed on a Training Type
as flavour only; the theme has no behaviour.

Every Avatar is drawn in each **Avatar Universe** (GLOSSARY "Avatar Universe"): the same
eight ids and unlock levels, cast as a different character with its own name in each
universe. The admin publishes which universe the whole app shows (ADR-0137); a user's
stored choice is the id, so switching universe never changes what anyone chose.

The web app owns the portrait for each id in each universe
(``apps/web/lib/avatar/manifest.json``); ``tests/test_avatar_art_contract.py`` fails
when the two lists drift apart.

Reading is tolerant: an absent or unknown stored id resolves to the default Novice,
so retiring an Avatar from the catalog never breaks a user's read."""

from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Mapping

# An Avatar with this unlock level is available from the start.
FREE_UNLOCK_LEVEL = 1

# Tunable Operator Levels that unlock the earned Avatars. Only the level gates an Avatar,
# never a Training Type or an Achievement, so every user can reach the whole roster.
MONK_UNLOCK_LEVEL = 3
BARBARIAN_UNLOCK_LEVEL = 5
VALKYRIE_UNLOCK_LEVEL = 8
PALADIN_UNLOCK_LEVEL = 12
TITAN_UNLOCK_LEVEL = 20


@dataclass(frozen=True)
class Avatar:
    """One curated catalog entry: a stable id and its unlock level.

    Its name depends on the Avatar Universe it is shown in: see ``avatar_name``."""

    id: str
    unlock_level: int = FREE_UNLOCK_LEVEL


# The catalog, in display order: the free Avatars, then the earned ones by unlock level.
AVATAR_CATALOG: tuple[Avatar, ...] = (
    Avatar(id="novice"),
    Avatar(id="dwarf-lifter"),
    Avatar(id="elf-ranger"),
    Avatar(id="monk", unlock_level=MONK_UNLOCK_LEVEL),
    Avatar(id="barbarian", unlock_level=BARBARIAN_UNLOCK_LEVEL),
    Avatar(id="valkyrie", unlock_level=VALKYRIE_UNLOCK_LEVEL),
    Avatar(id="paladin", unlock_level=PALADIN_UNLOCK_LEVEL),
    Avatar(id="titan", unlock_level=TITAN_UNLOCK_LEVEL),
)

# The Avatar a user has until they choose one.
DEFAULT_AVATAR_ID = "novice"

# The Avatar Universes, in the order the admin picker lists them (ADR-0137): The Realm
# (fantasy), Orbit (a deep-space station crew) and Olympus (the ancient games and myth).
AVATAR_UNIVERSES: tuple[str, ...] = ("realm", "orbit", "olympus")

# The universe the app shows until an admin publishes another: the original fantasy cast.
DEFAULT_AVATAR_UNIVERSE = "realm"

# Each Avatar's character name in each universe. Every universe names every catalog id;
# tests/test_avatar_catalog.py fails when one is missing.
AVATAR_NAMES: Mapping[str, Mapping[str, str]] = MappingProxyType({
    "realm": {
        "novice": "Novice",
        "dwarf-lifter": "Dwarf Lifter",
        "elf-ranger": "Elf Ranger",
        "monk": "Monk",
        "barbarian": "Barbarian",
        "valkyrie": "Valkyrie",
        "paladin": "Paladin",
        "titan": "Titan",
    },
    "orbit": {
        "novice": "Cadet",
        "dwarf-lifter": "Rig Hauler",
        "elf-ranger": "Pathfinder",
        "monk": "Zero-G Adept",
        "barbarian": "Void Raider",
        "valkyrie": "Drop Trooper",
        "paladin": "Sentinel",
        "titan": "Colossus",
    },
    "olympus": {
        "novice": "Initiate",
        "dwarf-lifter": "Forgehand",
        "elf-ranger": "Huntress",
        "monk": "Sage",
        "barbarian": "Lion-Bearer",
        "valkyrie": "Amazon",
        "paladin": "Hoplite",
        "titan": "Atlas",
    },
})


def is_avatar_universe(value: str) -> bool:
    """Whether ``value`` names an Avatar Universe."""

    return value in AVATAR_UNIVERSES


def resolve_avatar_universe(stored: str | None) -> str:
    """Read a stored universe tolerantly: absent or unknown becomes The Realm."""

    if stored is None or not is_avatar_universe(stored):
        return DEFAULT_AVATAR_UNIVERSE
    return stored


def avatar_name(avatar: Avatar, universe: str) -> str:
    """The character name ``avatar`` goes by in ``universe`` (unknown reads as The Realm)."""

    return AVATAR_NAMES[resolve_avatar_universe(universe)][avatar.id]


def find_avatar(avatar_id: str) -> Avatar | None:
    """The catalog entry ``avatar_id`` names, or ``None`` if the catalog holds none."""

    return next((avatar for avatar in AVATAR_CATALOG if avatar.id == avatar_id), None)


def is_avatar_id(value: str) -> bool:
    """Whether ``value`` names an Avatar in the catalog."""

    return find_avatar(value) is not None


def resolve_avatar_id(stored: str | None) -> str:
    """Read a stored Avatar id tolerantly: absent or unknown becomes the Novice."""

    if stored is None or not is_avatar_id(stored):
        return DEFAULT_AVATAR_ID
    return stored


def is_unlocked(avatar: Avatar, operator_level: int) -> bool:
    """Whether a user at ``operator_level`` may choose ``avatar`` now.

    Judged only when an Avatar is chosen: one already chosen is kept even after the
    level drops below it (ADR-0136)."""

    return operator_level >= avatar.unlock_level


@dataclass(frozen=True)
class AvatarStanding:
    """One catalog Avatar read against a user's Operator Level.

    ``unlocked`` is whether they may choose it now. ``current_level`` is their progress
    toward it: their Operator Level, held at the unlock level once reached, so a locked
    Avatar reads as ``current_level`` of ``unlock_level`` (e.g. "LVL 5 / 8")."""

    avatar: Avatar
    unlocked: bool
    current_level: int


def avatar_standings(operator_level: int) -> tuple[AvatarStanding, ...]:
    """The whole catalog, in order, each entry's lock state and progress at ``operator_level``.

    Computed each time it is read; no unlock is ever stored (ADR-0018, ADR-0136)."""

    return tuple(
        AvatarStanding(
            avatar=avatar,
            unlocked=is_unlocked(avatar, operator_level),
            current_level=min(operator_level, avatar.unlock_level),
        )
        for avatar in AVATAR_CATALOG
    )


__all__ = [
    "FREE_UNLOCK_LEVEL",
    "MONK_UNLOCK_LEVEL",
    "BARBARIAN_UNLOCK_LEVEL",
    "VALKYRIE_UNLOCK_LEVEL",
    "PALADIN_UNLOCK_LEVEL",
    "TITAN_UNLOCK_LEVEL",
    "Avatar",
    "AVATAR_CATALOG",
    "DEFAULT_AVATAR_ID",
    "AVATAR_UNIVERSES",
    "DEFAULT_AVATAR_UNIVERSE",
    "AVATAR_NAMES",
    "is_avatar_universe",
    "resolve_avatar_universe",
    "avatar_name",
    "find_avatar",
    "is_avatar_id",
    "resolve_avatar_id",
    "is_unlocked",
    "AvatarStanding",
    "avatar_standings",
]
