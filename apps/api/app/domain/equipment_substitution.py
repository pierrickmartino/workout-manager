"""Blocked detection for Equipment Substitution (ADR-0143, GLOSSARY "Equipment Substitution").

An Exercise Prescription is *blocked* by the Available Equipment when its Exercise's required
equipment is not covered by it. Bodyweight movements need no equipment, so they are never
blocked. Pure: the caller decides which list is the Available Equipment (ADR-0038)."""

from __future__ import annotations

from collections.abc import Iterable

from app.domain.equipment import missing_equipment


def is_blocked(required: Iterable[str], available: Iterable[str]) -> bool:
    """Whether a movement needing ``required`` cannot be done with ``available``."""

    return bool(missing_equipment(required, available))


__all__ = ["is_blocked"]
