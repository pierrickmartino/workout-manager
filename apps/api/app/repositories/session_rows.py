"""One home for the rules that build a Session row (ADR-0043, ADR-0057, ADR-0130).

Both repository adapters store Sessions differently — the SQL one hands rows to the
database, the in-memory one assigns ids and keeps them in dicts — but *what* a new
Session row carries is the same domain rule on either side. These pure builders state it
once, so the adapters differ only in how they store the row:

- ``standalone_copy`` is the copy rule Duplicate (ADR-0043) and Redeem (ADR-0057) share;
- ``member_session_row`` is the Protocol-member row Adopt (``create``) and Deploy
  (``deploy_tail``) write.

Each returns a fresh, unsaved ``WorkoutSession`` with no ``id``; prescriptions are written
separately through the spine (``prescription_mapping``, ADR-0069).
"""

from __future__ import annotations

from typing import Protocol as Interface
from typing import TypeVar

from app.db.models import Protocol, WorkoutSession
from app.domain.curated_lineage import lineage_columns, lineage_of

_T = TypeVar("_T")


class SessionSlot(Interface):
    """The per-Session fields of a Protocol member, as an Adopt or a Deploy supplies them.

    ``training_type`` / ``duration_minutes`` are the Session's own, or ``None`` to take
    its Protocol's (ADR-0130 amendment)."""

    @property
    def week(self) -> int: ...

    @property
    def day(self) -> int: ...

    @property
    def title(self) -> str | None: ...

    @property
    def training_type(self) -> str | None: ...

    @property
    def duration_minutes(self) -> int | None: ...


def standalone_copy(source: WorkoutSession, owner_clerk_user_id: str) -> WorkoutSession:
    """A standalone copy of ``source`` owned by ``owner_clerk_user_id``.

    Duplicate passes the source's own owner; Redeem passes the redeemer, so ownership
    transfers. Carried verbatim: the training parameters, Session Provenance, the Session
    Name, the ``title``, the curated lineage and the **Author** — immutable origin, never
    re-attributed to whoever copies it (#395). Dropped, so the copy stands alone: the
    Protocol linkage (``protocol_id``, objective, Week/Day, position) and the spent
    regeneration budget. Logged Sessions and the Favorite marker live in other stores and
    are never copied. The source is read, never mutated."""

    return WorkoutSession(
        clerk_user_id=owner_clerk_user_id,
        training_type=source.training_type,
        duration_minutes=source.duration_minutes,
        provenance=source.provenance,
        title=source.title,
        name=source.name,
        author_clerk_user_id=source.author_clerk_user_id,
        **lineage_columns(lineage_of(source)),
    )


def member_session_row(
    protocol: Protocol, slot: SessionSlot, *, position: int, provenance: str
) -> WorkoutSession:
    """The row for one Session of ``protocol`` at ``position``.

    Owned by the Protocol's owner, who is also its **Author** (#395): a Protocol member
    attributes to whoever adopted or deployed it. It takes the Protocol's objective
    (ADR-0132) and curated lineage — editing a plan doesn't change where it came from
    (ADR-0130) — and the slot's own Training Type and duration, else the Protocol's.
    ``provenance`` is the caller's: Adopt's comes from the adopted plan, Deploy keeps the
    existing tail's."""

    return WorkoutSession(
        clerk_user_id=protocol.clerk_user_id,
        training_type=_own_or(slot.training_type, protocol.training_type),
        duration_minutes=_own_or(slot.duration_minutes, protocol.duration_minutes),
        author_clerk_user_id=protocol.clerk_user_id,
        protocol_id=protocol.id,
        objective=protocol.objective,
        week=slot.week,
        day=slot.day,
        position=position,
        title=slot.title,
        provenance=provenance,
        **lineage_columns(lineage_of(protocol)),
    )


def _own_or(own: _T | None, protocol_value: _T) -> _T:
    """A Session's own Training Type or duration, else its Protocol's (ADR-0130 amendment)."""

    return protocol_value if own is None else own


__all__ = ["SessionSlot", "standalone_copy", "member_session_row"]
