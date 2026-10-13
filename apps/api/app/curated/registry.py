"""The closed set of Curated Protocols and the released view of it (ADR-0130).

``CURATED_PROTOCOLS`` is every Curated Protocol in the repo, released or not; the content-integrity
test gates all of them. Routes read through ``get_curated_registry`` so a test can swap in a
registry that releases unreleased content, without ever editing the shipped data."""

from __future__ import annotations

from dataclasses import dataclass

from app.curated.beginner_linear import BEGINNER_LINEAR
from app.curated.model import CuratedProtocol
from app.curated.push_pull_legs import PUSH_PULL_LEGS
from app.curated.tiered import TIERED

CURATED_PROTOCOLS: tuple[CuratedProtocol, ...] = (BEGINNER_LINEAR, PUSH_PULL_LEGS, TIERED)


@dataclass(frozen=True)
class CuratedRegistry:
    """A set of Curated Protocols, of which only the ``released`` ones are visible."""

    curated_protocols: tuple[CuratedProtocol, ...]

    def released(self) -> tuple[CuratedProtocol, ...]:
        """The Curated Protocols a user may see and adopt, in authored order."""

        return tuple(curated for curated in self.curated_protocols if curated.released)

    def find_released(self, identifier: str) -> CuratedProtocol | None:
        """The released Curated Protocol with ``identifier``, or ``None`` — an unreleased one
        is indistinguishable from an unknown one."""

        return next(
            (p for p in self.released() if p.identifier == identifier), None
        )


_REGISTRY = CuratedRegistry(CURATED_PROTOCOLS)


def get_curated_registry() -> CuratedRegistry:
    """The dependency routes read the Curated Protocols through."""

    return _REGISTRY


__all__ = [
    "CURATED_PROTOCOLS",
    "CuratedRegistry",
    "get_curated_registry",
]
