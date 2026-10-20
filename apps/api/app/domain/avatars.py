"""Avatar catalog: the curated, fixed roster of fantasy workout characters (ADR-0136).

An **Avatar** (GLOSSARY "Avatar") is the character a user chooses to represent
themselves in the header and on Profile. The choice is a stored **Interface
Preference**, so it never reaches the Fitness Profile, generation or its cache key.
The catalog lives here, in pure domain code: never user- or AI-authored, each entry
an id, a display name and the Operator Level that unlocks it. Each character is
loosely themed on a Training Type as flavour only; the theme has no behaviour.

The web app owns the artwork for each id (``apps/web/lib/avatar/manifest.json``);
``tests/test_avatar_art_contract.py`` fails when the two id lists drift apart.

Reading is tolerant: an absent or unknown stored id resolves to the default Novice,
so retiring an Avatar from the catalog never breaks a user's read."""

from __future__ import annotations

from dataclasses import dataclass

# An Avatar with this unlock level is available from the start.
FREE_UNLOCK_LEVEL = 1


@dataclass(frozen=True)
class Avatar:
    """One curated catalog entry: a stable id, its display name and its unlock level."""

    id: str
    name: str
    unlock_level: int = FREE_UNLOCK_LEVEL


# The catalog, in display order. Only the free Avatars ship so far (#747).
AVATAR_CATALOG: tuple[Avatar, ...] = (
    Avatar(id="novice", name="Novice"),
    Avatar(id="dwarf-lifter", name="Dwarf Lifter"),
    Avatar(id="elf-ranger", name="Elf Ranger"),
)

# The Avatar a user has until they choose one.
DEFAULT_AVATAR_ID = "novice"


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
    """One catalog Avatar read against a user's Operator Level: may they choose it now."""

    avatar: Avatar
    unlocked: bool


def avatar_standings(operator_level: int) -> tuple[AvatarStanding, ...]:
    """The whole catalog, in order, each entry's lock state at ``operator_level``.

    Computed each time it is read; no unlock is ever stored (ADR-0018, ADR-0136)."""

    return tuple(
        AvatarStanding(avatar=avatar, unlocked=is_unlocked(avatar, operator_level))
        for avatar in AVATAR_CATALOG
    )


__all__ = [
    "FREE_UNLOCK_LEVEL",
    "Avatar",
    "AVATAR_CATALOG",
    "DEFAULT_AVATAR_ID",
    "find_avatar",
    "is_avatar_id",
    "resolve_avatar_id",
    "is_unlocked",
    "AvatarStanding",
    "avatar_standings",
]
