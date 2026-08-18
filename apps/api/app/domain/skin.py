"""Skin catalog: the fixed, code-defined registry of Skins — visual identities
(colour + typography + shape) — first added in ADR-0048, widened by ADR-0050.

A **Skin** is a named *visual identity* — the coordinated colour, typography, and
shape the whole app draws with (CONTEXT "Skin"; ADR-0050). Skins come from a
*fixed, curated catalog* (never user- or AI-authored). A Skin's tokens fall into
two groups:

- **colour**, which is polarity-dependent: each Skin must define **both** a light
  and a dark variant, each covering the full ``REQUIRED_TOKENS`` colour set, so a
  Skin composes with any Mode; and
- **shared** (fonts + shape), which is *Mode-invariant*: one ``SHARED_TOKENS``
  group per Skin — a typeface never flips between Light and Dark, so it is modelled
  once rather than duplicated across both variants (ADR-0050 supersedes the
  colour-only scope of ADR-0048).

This module owns two domain facts of the Active Skin slice:

- the catalog itself (the id registry the frontend's ``Skin`` union mirrors — the
  single canonical list of which Skins exist, so backend and frontend can't
  drift), and
- ``validate_catalog`` / ``is_known_skin``: the pure invariant check plus the
  gate ``PUT /api/active-skin`` validates a published id against, so an unknown
  id can never become the Active Skin (it fails closed).

No I/O — the concrete token *values* live in the frontend's ``globals.css``
(colour under ``[data-skin][data-mode]``, fonts and shape under ``html[data-skin]``);
this catalog is the structural contract those blocks must satisfy, not the values
themselves."""

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


# The **Mode-invariant** identity tokens every Skin must define once (ADR-0050):
# the three font roles and the four radius steps. A typeface and a corner radius do
# not change between Light and Dark, so — unlike ``REQUIRED_TOKENS`` — these are not
# authored per variant; they are a single per-Skin group. Their concrete *values*
# live in ``globals.css`` under ``html[data-skin="…"]`` (no ``data-mode`` qualifier).
# Disjoint from ``REQUIRED_TOKENS`` by construction: colour is per-variant, identity
# is shared.
SHARED_TOKENS: frozenset[str] = frozenset(
    {
        # Typography
        "font-display",
        "font-sans",
        "font-mono",
        # Shape (a single "roundness" character, expressed as the four radius steps)
        "radius-sm",
        "radius-md",
        "radius-lg",
        "radius-xl",
    }
)


@dataclass(frozen=True)
class Skin:
    """One visual identity in the catalog: an id, the colour tokens each variant
    covers, and the Mode-invariant shared (font + shape) tokens.

    ``variants`` maps a ``Variant`` to the colour token names that variant defines;
    ``shared`` is the single Mode-invariant identity group. A well-formed Skin
    carries both ``LIGHT`` and ``DARK`` (each a superset of ``REQUIRED_TOKENS``) and
    a ``shared`` group that is a superset of ``SHARED_TOKENS`` — ``validate_catalog``
    is what enforces that, so the structure can also express a *broken* Skin (a
    missing variant, a short colour or shared set) for the invariant to reject."""

    id: str
    variants: Mapping[Variant, frozenset[str]] = field(default_factory=dict)
    shared: frozenset[str] = frozenset()


def _covered(tokens: frozenset[str]) -> frozenset[str]:
    return REQUIRED_TOKENS - tokens


def validate_catalog(catalog: tuple[Skin, ...]) -> None:
    """Assert the catalog's invariant, raising ``ValueError`` on any violation.

    Every Skin must define both a light and a dark colour variant (each covering
    ``REQUIRED_TOKENS``) and the full ``SHARED_TOKENS`` identity group, and ids must
    be unique. Called once over ``SKIN_CATALOG`` at import time so a
    structurally-incomplete Skin can never ship."""

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

        missing_shared = SHARED_TOKENS - skin.shared
        if missing_shared:
            raise ValueError(
                f"Skin {skin.id!r} omits required shared tokens: "
                f"{sorted(missing_shared)}"
            )


def _full_skin(skin_id: str) -> Skin:
    """A catalog Skin whose colour variants both cover the full token set and whose
    shared group covers the full identity set.

    The shipped Skins all satisfy the invariant, so they are declared through this
    helper; the token *values* are authored in ``globals.css`` — colour per variant,
    fonts and radii once per ``html[data-skin]``."""

    return Skin(
        id=skin_id,
        variants={
            Variant.LIGHT: REQUIRED_TOKENS,
            Variant.DARK: REQUIRED_TOKENS,
        },
        shared=SHARED_TOKENS,
    )


# The fixed catalog. ``pulse`` is the original tactical-command-center look;
# ``aurora`` is the minimal second seed Skin (ADR-0048 / #331) shipped purely so
# publishing a new Active Skin is observably different; ``vercel`` is a
# minimalist, high-contrast palette inspired by Vercel's Geist design language
# (true-black surfaces, the blue→purple→pink→cyan brand gradient as accents). The
# ids here are the single source of truth the frontend ``Skin`` union in
# lib/theme.ts mirrors.
SKIN_CATALOG: tuple[Skin, ...] = (
    _full_skin("pulse"),
    _full_skin("aurora"),
    _full_skin("vercel"),
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
    "SHARED_TOKENS",
    "Skin",
    "SKIN_CATALOG",
    "DEFAULT_ACTIVE_SKIN",
    "validate_catalog",
    "skin_ids",
    "is_known_skin",
]
