"""The admin audit-trail vocabulary (ADR-0075/0076).

The exercise-admin audit trail records the consequential admin acts on a catalog
Exercise. This module owns the closed set of act names, so the repository, routes, and
tests all name an action through one enum rather than scattering string literals — the
same discipline ``Provenance`` gives the trust axis.

Pure: no I/O, no ORM. The stored ``action`` column holds the raw value of these members.
Provenance change (ADR-0075) is the first act; retire / un-retire / hard delete (ADR-0076)
join the enum when those endpoints land."""

from __future__ import annotations

from enum import Enum


class AuditAction(str, Enum):
    """A consequential admin act recorded in the exercise-admin audit trail.

    ``PROVENANCE_CHANGE`` is the deliberate promote / correct / demote of an Exercise's
    Provenance (ADR-0075) — the first and, for now, only audited act. Retire, un-retire,
    and hard delete (ADR-0076) extend this enum when their endpoints arrive, reusing the
    same append-only trail.
    """

    PROVENANCE_CHANGE = "provenance_change"


def provenance_change_detail(old: str, new: str) -> dict[str, str]:
    """The ``detail`` payload for a ``PROVENANCE_CHANGE`` row: the old → new tiers.

    Kept here, beside the action it belongs to, so every writer shapes the payload the
    same way and a reader knows exactly which keys a provenance-change row carries."""

    return {"from": old, "to": new}


__all__ = ["AuditAction", "provenance_change_detail"]
