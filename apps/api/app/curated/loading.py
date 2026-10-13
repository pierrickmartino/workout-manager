"""Rounding a computed weight to one a barbell can actually be loaded with (ADR-0130).

Every weight a Curated Protocol computes for the user, a prefilled starting weight or a wave's
week, is rounded *down* to the smallest loadable step, so a computed weight never asks for more
than the arithmetic did. Pure: no I/O."""

from __future__ import annotations

import math

# The smallest step a barbell can be loaded by: a pair of 1.25 kg plates.
LOADABLE_INCREMENT_KG = 2.5
# Absorbs float error so an exact multiple (0.7 × 125 = 87.5) never floors one step short.
_ROUNDING_TOLERANCE = 1e-9


def floor_to_loadable(kg: float) -> float:
    """``kg`` rounded down to a multiple of ``LOADABLE_INCREMENT_KG`` (``0`` below one step)."""

    return math.floor(kg / LOADABLE_INCREMENT_KG + _ROUNDING_TOLERANCE) * LOADABLE_INCREMENT_KG


__all__ = ["LOADABLE_INCREMENT_KG", "floor_to_loadable"]
