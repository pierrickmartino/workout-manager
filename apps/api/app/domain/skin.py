"""Skin catalog: the fixed, code-defined registry of palette families (ADR-0048).

A **Skin** is a named palette family — the coordinated colour set the whole app
draws with (CONTEXT "Skin"). Skins come from a *fixed, curated catalog* (never
user- or AI-authored); each one must define **both** a light and a dark variant,
and each variant must cover the full required token set, so a Skin composes with
any Mode. This module owns two domain facts of the Active Skin slice:

- the catalog itself (the id registry the frontend's ``Skin`` union mirrors — the
  single canonical list of which Skins exist, so backend and frontend can't
  drift), and
- ``validate_catalog`` / ``is_known_skin``: the pure invariant check plus the
  gate ``PUT /api/active-skin`` validates a published id against, so an unknown
  id can never become the Active Skin (it fails closed).

No I/O — the concrete token *values* live in the frontend's ``globals.css`` under
a ``[data-skin][data-mode]`` selector; this catalog is the structural contract
those blocks must satisfy, not the colours themselves."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Mapping


class Variant(str, Enum):
    """The two polarities every Skin must define so it composes with any Mode."""

    LIGHT = "light"
    DARK = "dark"


# The colour tokens every Skin variant must define, matching the semantic
# utilities components consume (``bg-surface``, ``text-muted``, ``text-cyan``…)
# and the ``--color-*`` custom properties authored per variant in
# ``apps/web/app/globals.css``. A variant missing any of these would leave a
# component unstyled, so the validator treats it as a broken Skin.
REQUIRED_TOKENS: frozenset[str] = frozenset(
    {
        # Surfaces
        "base",
        "surface",
        "elevated",
        # Borders
        "border",
        "border-lite",
        # Text
        "text-primary",
        "text-secondary",
        "text-muted",
        # Accents
        "cyan",
        "cyan-dim",
        "blue",
        "violet",
        "violet-dim",
        "magenta",
        "magenta-dim",
        "on-accent",
    }
)


@dataclass(frozen=True)
class Skin:
    """One palette family in the catalog: an id and the tokens each variant covers.

    ``variants`` maps a ``Variant`` to the set of token names that variant
    defines. A well-formed Skin carries both ``LIGHT`` and ``DARK``, each a
    superset of ``REQUIRED_TOKENS`` — ``validate_catalog`` is what enforces that,
    so the structure can also express a *broken* Skin (a missing variant, a
    short token set) for the invariant to reject."""

    id: str
    variants: Mapping[Variant, frozenset[str]] = field(default_factory=dict)


def _covered(tokens: frozenset[str]) -> frozenset[str]:
    return REQUIRED_TOKENS - tokens


def validate_catalog(catalog: tuple[Skin, ...]) -> None:
    """Assert the catalog's invariant, raising ``ValueError`` on any violation.

    Every Skin must define both a light and a dark variant, each covering the
    required token set, and ids must be unique. Called once over ``SKIN_CATALOG``
    at import time so a structurally-incomplete Skin can never ship."""

    seen: set[str] = set()
    for skin in catalog:
        if skin.id in seen:
            raise ValueError(f"duplicate Skin id in catalog: {skin.id!r}")
        seen.add(skin.id)

        for variant in Variant:
            if variant not in skin.variants:
                raise ValueError(
                    f"Skin {skin.id!r} is missing its {variant.value} variant"
                )
            missing = _covered(skin.variants[variant])
            if missing:
                raise ValueError(
                    f"Skin {skin.id!r} {variant.value} variant omits required "
                    f"tokens: {sorted(missing)}"
                )


def _full_skin(skin_id: str) -> Skin:
    """A catalog Skin whose light and dark variants both cover the full token set.

    The shipped Skins all satisfy the invariant, so they are declared through this
    helper; the token *values* are authored in ``globals.css`` per variant."""

    return Skin(
        id=skin_id,
        variants={
            Variant.LIGHT: REQUIRED_TOKENS,
            Variant.DARK: REQUIRED_TOKENS,
        },
    )


# The fixed catalog. ``pulse`` is the original tactical-command-center look;
# ``aurora`` is the minimal second seed Skin (ADR-0048 / #331) shipped purely so
# publishing a new Active Skin is observably different. The ids here are the
# single source of truth the frontend ``Skin`` union in lib/theme.ts mirrors.
SKIN_CATALOG: tuple[Skin, ...] = (
    _full_skin("pulse"),
    _full_skin("aurora"),
)

# The Active Skin's starting value: the original PULSE Skin (ADR-0048). The
# migration seeds this and the repository defaults to it when no row exists.
DEFAULT_ACTIVE_SKIN: str = "pulse"


def skin_ids() -> tuple[str, ...]:
    """The ordered ids of every Skin in the catalog."""

    return tuple(skin.id for skin in SKIN_CATALOG)


def is_known_skin(skin_id: str) -> bool:
    """True only for an id present in the fixed catalog — the ``PUT`` gate.

    Fails closed: any id not in the catalog (a typo, a fabricated value, the
    empty string) is unknown, so an invalid publish is rejected and the current
    Active Skin is left untouched."""

    return skin_id in skin_ids()


# Fail fast at import time: a structurally-incomplete shipped catalog is a bug,
# not a runtime condition.
validate_catalog(SKIN_CATALOG)


__all__ = [
    "Variant",
    "REQUIRED_TOKENS",
    "Skin",
    "SKIN_CATALOG",
    "DEFAULT_ACTIVE_SKIN",
    "validate_catalog",
    "skin_ids",
    "is_known_skin",
]
