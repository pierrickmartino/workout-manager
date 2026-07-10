"""Tail re-enumeration for the Protocol Builder (Module A, ADR-0020).

The Builder edits the un-performed tail of a Protocol — adding and removing Sessions,
reshaping weeks and per-week frequency — and on ``DEPLOY`` the server must fold that
desired tail back into a single fully-enumerated Session sequence. ``reenumerate_tail``
is that fold, and the heart of the slice: given the **frozen performed prefix** and the
**desired un-performed tail**, it returns the new enumerated Session list with

* **contiguous ``position``s** running unbroken across the whole plan,
* **positional ``week``/``day`` labels** derived from the grid (day counts 1..k within
  each week; weeks run contiguously), and
* the **performed prefix preserved byte-for-byte** — its Sessions pass through untouched.

It is pure — no I/O, no ORM. Per ADR-0020/0021 ``sessions_per_week`` is a **soft header
value, not a rigid invariant**: the enumeration follows the *actual* per-week Session
count the draft carries (grouping by each tail Session's client-intended ``week``), so
uneven weeks — a two-Session deload beside a four-Session week — are legitimate and
survive the fold. The frequency is validated and stored elsewhere (Module B / Module F),
never enforced as a grid width here.

The tail's Session ``week`` values are the source of truth for *grouping* only; the
emitted labels are compacted so genuinely-new weeks fall directly after the prefix's
last week (no fabricated empty weeks), and a tail that continues the prefix's partial
week — a week straddling the frozen/editable boundary — picks up that week's day count.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class EnumeratedSession:
    """A fully-enumerated Session: its self-paced ``position`` and positional
    ``week``/``day`` labels, plus an opaque ``payload`` (its Prescriptions) carried
    through untouched. Prefix Sessions arrive and leave as these, unchanged."""

    session_id: int | None
    position: int
    week: int
    day: int
    payload: Any = None


@dataclass(frozen=True)
class TailSession:
    """One desired un-performed Session. ``week`` is the client-intended week the
    Session sits in (the grouping that lets weeks be uneven); ``day`` orders Sessions
    within that week and is only a tiebreak — the emitted ``day`` is recomputed. A
    ``session_id`` of ``None`` marks a not-yet-persisted new Session slot."""

    session_id: int | None
    week: int
    payload: Any = None
    day: int = 0


def reenumerate_tail(
    prefix: list[EnumeratedSession],
    tail: list[TailSession],
) -> list[EnumeratedSession]:
    """Return the prefix followed by the re-enumerated tail as one Session sequence.

    ``prefix`` (the performed Sessions, in position order) is returned untouched;
    ``tail`` is grouped by each Session's client-intended ``week`` — ascending, with
    within-week order preserved — then relabeled so positions run contiguously after
    the prefix and week/day labels are positional. A tail Session whose week equals the
    prefix's last week continues that week's day count (a straddling week); otherwise
    each distinct tail week maps to the next contiguous week label.
    """

    result: list[EnumeratedSession] = list(prefix)

    prefix_last_week = prefix[-1].week if prefix else 0
    prefix_last_week_count = sum(1 for s in prefix if s.week == prefix_last_week)
    next_position = (max(s.position for s in prefix) + 1) if prefix else 0

    # Stable sort by (week, client day, original index): weeks ascending, within-week
    # order taken from the client's day then the input order, so the fold is fully
    # deterministic and never reshuffles a week's Sessions.
    ordered = sorted(
        enumerate(tail), key=lambda item: (item[1].week, item[1].day, item[0])
    )

    output_week = prefix_last_week
    day = prefix_last_week_count
    current_client_week: int | None = None

    for _, session in ordered:
        if current_client_week is None:
            # First tail Session: continue the prefix's partial week if it lands in it,
            # else open the next week after the prefix.
            if prefix and session.week == prefix_last_week:
                output_week = prefix_last_week
                day = prefix_last_week_count
            else:
                output_week = prefix_last_week + 1
                day = 0
            current_client_week = session.week
        elif session.week != current_client_week:
            output_week += 1
            day = 0
            current_client_week = session.week

        day += 1
        result.append(
            EnumeratedSession(
                session_id=session.session_id,
                position=next_position,
                week=output_week,
                day=day,
                payload=session.payload,
            )
        )
        next_position += 1

    return result


__all__ = [
    "EnumeratedSession",
    "TailSession",
    "reenumerate_tail",
]
