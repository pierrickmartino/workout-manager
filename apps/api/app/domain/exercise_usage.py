"""Exercise usage — the user's per-Exercise last-performed projection (ADR-0042).

The **Browse the Catalog** rows carry a strictly descriptive TRAINED / NEW marker and a
"last performed" recency. Both read from this one pure projection over the user's Logged
Sessions: for each catalog Exercise the user has ever performed a set of, the most recent
date it was performed. Pure and dependency-free — no ORM, no HTTP — like the other
read-time projections (XP, Streak, Personal Records): the record is the single source of
truth, so a corrected or deleted log simply recomputes it (ADR-0018/0019).

Reading a **record's** date is honest under the self-paced, calendar-free model
(ADR-0001): that rule forbids dated *plans*, not reading when a performance happened. The
marker built on top stays descriptive — it never prescribes training a gap (ADR-0025)."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from datetime import date
from typing import Protocol


class _LoggedSet(Protocol):
    exercise_id: int


class _LoggedSession(Protocol):
    performed_on: date
    logged_sets: Sequence[_LoggedSet]


def last_performed(history: Iterable[_LoggedSession]) -> dict[int, date]:
    """Map each performed Exercise id to the most recent date it was performed.

    Walks every Logged Set in the history and keeps, per ``exercise_id``, the latest
    ``performed_on`` across the sessions it appears in. An Exercise the user has never
    logged is simply absent from the map — the browse marker reads that absence as NEW.
    Order-independent: a later session with an earlier date never overwrites a newer one.
    """

    latest: dict[int, date] = {}
    for session in history:
        performed_on = session.performed_on
        for logged_set in session.logged_sets:
            current = latest.get(logged_set.exercise_id)
            if current is None or performed_on > current:
                latest[logged_set.exercise_id] = performed_on
    return latest


__all__ = ["last_performed"]
