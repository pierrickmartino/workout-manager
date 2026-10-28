"""Muscle Group coverage: does an AI-invented substitute train what the original trained?

ADR-0143 checks "same muscle benefits" in code, at **Muscle Group** level, on AI output
only (curated catalog Variations and Alternatives are trusted). The substitute's Primary
Muscles must cover every Muscle Group the original's Primary Muscles roll up into; when the
original records no Primary Muscles, its full targeted-muscle union stands in. The check is
coarse on purpose: a per-Muscle comparison would reject good swaps wherever catalog data is
still a region blob ("back"), and the group roll-up resolves those. Pure — the same curated
``real_groups_of`` roll-up the Coverage surfaces read."""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.muscle_groups import MuscleGroup
from app.domain.muscles import real_groups_of


def required_muscle_groups(
    *, original_primary: Sequence[str], original_targeted: Sequence[str]
) -> frozenset[MuscleGroup]:
    """The Muscle Groups a substitute must cover: the original's Primary Muscles rolled
    up, or its targeted-muscle union when no Primary Muscles are recorded."""

    basis = original_primary if original_primary else original_targeted
    return real_groups_of(basis)


def covers_original_muscle_groups(
    *,
    original_primary: Sequence[str],
    original_targeted: Sequence[str],
    substitute_primary: Sequence[str],
) -> bool:
    """Whether the substitute's Primary Muscles cover every required Muscle Group.

    An original whose muscles roll up to no real group imposes no requirement."""

    required = required_muscle_groups(
        original_primary=original_primary, original_targeted=original_targeted
    )
    return required <= real_groups_of(substitute_primary)


__all__ = ["required_muscle_groups", "covers_original_muscle_groups"]
