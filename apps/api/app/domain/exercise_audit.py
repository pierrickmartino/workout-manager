"""The admin audit-trail vocabulary and the record-iff-changed decision (ADR-0075/0076).

The exercise-admin audit trail records the consequential admin acts on a catalog Exercise.
This module owns two things, both pure (no I/O, no ORM):

- the closed set of act names (``AuditAction``), so the repository, the trail, the routes, and
  the tests all name an action through one enum rather than scattering string literals — the
  same discipline ``Provenance`` gives the trust axis; and
- the decision *whether and what* to record for one admin act — ``audit_provenance_change`` /
  ``audit_retire_transition`` / ``audit_hard_delete`` — returning an ``AuditIntent`` to persist
  or ``None`` for a no-op. This is the "audit only a real change" rule that once lived inline in
  three route handlers, now with one home and its own test surface (``tests/test_exercise_audit``).

Persisting an intent is the ``AuditTrail``'s job (``repositories/exercise_audit_trail``), which
holds the repository — the pure decision here stays trivially testable without any I/O.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class AuditAction(str, Enum):
    """A consequential admin act recorded in the exercise-admin audit trail.

    ``PROVENANCE_CHANGE`` is the deliberate promote / correct / demote of an Exercise's
    Provenance (ADR-0075). ``RETIRE`` and ``UNRETIRE`` record the reversible Catalog
    tombstone an admin flips (ADR-0076): a Retired Exercise is hidden from every discovery
    surface while it stays resolvable by id, and only an admin un-retires it — so both acts
    are traceable on the same append-only trail. ``HARD_DELETE`` records the narrow,
    irreversible removal of a Retired, unreferenced Exercise (ADR-0076); its row keeps the
    deleted Exercise's normalized name in ``detail`` and its ``exercise_id`` as a plain int
    (no FK), so the trail outlives the row it describes.
    """

    PROVENANCE_CHANGE = "provenance_change"
    RETIRE = "retire"
    UNRETIRE = "unretire"
    HARD_DELETE = "hard_delete"


@dataclass(frozen=True)
class AuditIntent:
    """What to append to the trail for one admin act — the action plus its detail payload.

    The decisions below return ``AuditIntent | None``: ``None`` is the "nothing changed, record
    nothing" verdict (a re-affirmed tier, or a Retire flip to the current state), and an intent
    is a genuine act to persist. Separating *what to record* (here, pure) from *persisting it*
    (the ``AuditTrail``, which holds the repository) keeps the record-iff-changed rule
    unit-testable without any I/O and gives it one home instead of a copy in every handler.
    """

    action: AuditAction
    detail: dict[str, str]


def audit_provenance_change(*, before: str, after: str) -> AuditIntent | None:
    """The intent for a deliberate Provenance change (ADR-0075), or ``None`` when the tier is
    re-affirmed. Detail carries the old→new tiers so a reader knows exactly what moved.
    """

    if before == after:
        return None
    return AuditIntent(AuditAction.PROVENANCE_CHANGE, {"from": before, "to": after})


def audit_retire_transition(
    *, before_retired: bool, after_retired: bool
) -> AuditIntent | None:
    """The intent for a Retire-tombstone flip (ADR-0076), or ``None`` when the state is
    re-affirmed. The direction picks the action — hiding is ``RETIRE``, restoring ``UNRETIRE`` —
    and the row needs no detail beyond that verb."""

    if before_retired == after_retired:
        return None
    action = AuditAction.RETIRE if after_retired else AuditAction.UNRETIRE
    return AuditIntent(action, {})


def audit_hard_delete(*, normalized_name: str) -> AuditIntent:
    """The intent for a guarded hard delete (ADR-0076) — always recorded, since a delete is a
    terminal act with no before/after to compare. Detail keeps the deleted Exercise's normalized
    name, so the append-only trail outlives the row it describes (the audit row's ``exercise_id``
    is a plain int with no FK)."""

    return AuditIntent(AuditAction.HARD_DELETE, {"name": normalized_name})


__all__ = [
    "AuditAction",
    "AuditIntent",
    "audit_provenance_change",
    "audit_retire_transition",
    "audit_hard_delete",
]
