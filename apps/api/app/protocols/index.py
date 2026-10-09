"""The Protocols index: every Protocol a user owns, with where they stand in it (#637).

Each Protocol projects to one ``ProtocolIndexRow``: its ``status`` — ``current`` (the
one Home drives, ADR-0125), ``set_aside`` (unfinished, not Current) or ``finished``
(every Session performed) — plus how many of its Sessions are performed and when one
was last performed. A read-time projection over the Logged history (ADR-0018), never
stored.

Layered like ``progress``: the pure ``protocol_index_from`` projects over an already
loaded history, and the thin ``protocol_index`` service reads that history **once** for
the whole index, however many Protocols the user owns (ADR-0030). Current is chosen by
walking the same ``by_made_current`` order Home selects with, so the index and Home can
never disagree about which Protocol is Current."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum

from app.protocols.progress import by_made_current, last_performed_on_by_session
from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    LoggedSessionView,
)
from app.repositories.protocol_repository import ProtocolRepository, ProtocolView


class ProtocolStatus(StrEnum):
    """Where a Protocol stands for its owner (GLOSSARY: Current / Set aside / Finished)."""

    CURRENT = "current"
    SET_ASIDE = "set_aside"
    FINISHED = "finished"


@dataclass(frozen=True)
class ProtocolIndexRow:
    """One Protocol in the index: the plan plus its read-time standing."""

    protocol: ProtocolView
    status: ProtocolStatus
    performed_count: int
    session_count: int
    last_performed_on: date | None
    # Ordering only (ADR-0001): the index sorts set-aside rows by it, never shows it.
    made_current_at: datetime


def _row(
    protocol: ProtocolView, status: ProtocolStatus, performed_on: dict[int, date]
) -> ProtocolIndexRow:
    dates = [
        performed_on[session.session_id]
        for session in protocol.sessions
        if session.session_id in performed_on
    ]
    return ProtocolIndexRow(
        protocol=protocol,
        status=status,
        performed_count=len(dates),
        session_count=len(protocol.sessions),
        last_performed_on=max(dates, default=None),
        made_current_at=protocol.made_current_at,
    )


def _is_finished(protocol: ProtocolView, performed_on: dict[int, date]) -> bool:
    return all(session.session_id in performed_on for session in protocol.sessions)


def protocol_index_from(
    protocols: list[ProtocolView], logged_sessions: list[LoggedSessionView]
) -> list[ProtocolIndexRow]:
    """Project each Protocol to its index row over an already-loaded history.

    Rows come back in made-Current order. The first unfinished Protocol in that order is
    Current (ADR-0125); every later unfinished one is set aside. Pure: no I/O.
    """

    performed_on = last_performed_on_by_session(logged_sessions)
    rows: list[ProtocolIndexRow] = []
    has_current = False
    for protocol in by_made_current(protocols):
        if _is_finished(protocol, performed_on):
            status = ProtocolStatus.FINISHED
        elif not has_current:
            status = ProtocolStatus.CURRENT
            has_current = True
        else:
            status = ProtocolStatus.SET_ASIDE
        rows.append(_row(protocol, status, performed_on))
    return rows


def protocol_index(
    clerk_user_id: str,
    *,
    protocols: ProtocolRepository,
    logged: LoggedSessionRepository,
) -> list[ProtocolIndexRow]:
    """The owner's Protocols index, reading the Logged history exactly once."""

    return protocol_index_from(
        protocols.list_for_user(clerk_user_id), logged.list_for_user(clerk_user_id)
    )


__all__ = [
    "ProtocolIndexRow",
    "ProtocolStatus",
    "protocol_index",
    "protocol_index_from",
]
