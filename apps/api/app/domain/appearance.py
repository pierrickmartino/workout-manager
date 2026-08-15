"""Appearance domain: the per-user Mode.

Appearance is deliberately separate from the Fitness Profile (ADR-0047) so a
user's chosen look never enters generation or the cache key. This module owns
the one domain fact of the Mode slice: the closed set of surface polarities a
user may choose, and the shipped default.

``Mode`` is the user's chosen surface polarity (CONTEXT "Mode"); ``system``
means *follow the device*, resolved client-side via ``prefers-color-scheme``
rather than stored as a concrete polarity. Absence of an Appearance Preference
defaults to ``DARK`` so existing users are never silently light-flipped on
deploy (ADR-0047)."""

from __future__ import annotations

from enum import Enum


class Mode(str, Enum):
    """The closed set of Modes a user may choose.

    A constrained vocabulary stored as its raw value (like ``Gender``): the
    picker only ever offers these three, and an unknown Mode is a boundary
    validation error, never persisted."""

    LIGHT = "light"
    DARK = "dark"
    SYSTEM = "system"


# The shipped default when a user has no Appearance Preference yet. Dark
# preserves today's all-dark PULSE look (ADR-0047); the web ``DEFAULT_MODE`` in
# apps/web/lib/theme.ts mirrors this exact choice.
DEFAULT_MODE: Mode = Mode.DARK


__all__ = ["Mode", "DEFAULT_MODE"]
