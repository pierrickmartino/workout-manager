"""Range-scoped Analytics counts (F3 Slice 1) — an honest read of the *record*.

``analytics_overview`` reads the user's Logged Sessions and projects them onto a
single ``AnalyticsOverview``: the count of Logged Sessions, active days (distinct
``performed_on``), total Logged Sets, and the set-count **muscle distribution**
performed inside the selected rolling window ending on a reference ``today``. Every
number comes straight from Logged Sessions and Logged Sets — no Load parsing, no
Estimated 1RM, no conversion — so the read model is honest and shippable on its own
(the volume series and new-PR tile arrive in later slices). The distribution rolls
each Exercise's free-form muscles into the six curated Muscle Groups plus
Unclassified (``domain/muscle_groups.py``), weighted purely by set count.

Reads are scoped to the owning user because the underlying repository's
``list_for_user`` already is. Pure orchestration over the Logged-Session
repository; no ORM, no HTTP."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from enum import Enum

from app.domain.muscle_groups import distribution
from app.repositories.logged_session_repository import LoggedSessionRepository


class AnalyticsRange(Enum):
    """The window the Analytics screen is scoped to: a rolling span of days."""

    SEVEN_DAY = "7d"
    THIRTY_DAY = "30d"
    NINETY_DAY = "90d"

    @property
    def days(self) -> int:
        return {"7d": 7, "30d": 30, "90d": 90}[self.value]


@dataclass(frozen=True)
class AnalyticsOverview:
    """The count read model for one range window: honest, conversion-free totals.

    ``muscle_distribution`` is an ordered tuple of ``(group_label, pct)`` pairs —
    the set-count muscle split for the window (Slice 2), summing to 100% over the
    groups that received work, in canonical body order with Unclassified last. It
    is empty when nothing was logged. Kept as a tuple so the read model stays
    immutable; the pairs preserve order for rendering.
    """

    range: str
    sessions: int
    active_days: int
    total_sets: int
    muscle_distribution: tuple[tuple[str, float], ...]


def analytics_overview(
    clerk_user_id: str,
    window: AnalyticsRange,
    *,
    logged: LoggedSessionRepository,
    today: date,
) -> AnalyticsOverview:
    """Return the user's session / active-day / total-set counts for ``window``.

    A Logged Session counts when its ``performed_on`` falls in the rolling window
    of ``window.days`` calendar days ending on ``today`` (inclusive on both ends).
    A user who has logged nothing yields all-zero counts, never an error.
    """

    start = today - timedelta(days=window.days - 1)
    in_window = [
        session
        for session in logged.list_for_user(clerk_user_id)
        if start <= session.performed_on <= today
    ]

    return AnalyticsOverview(
        range=window.value,
        sessions=len(in_window),
        active_days=len({session.performed_on for session in in_window}),
        total_sets=sum(len(session.logged_sets) for session in in_window),
        muscle_distribution=tuple(
            (group.value, pct) for group, pct in distribution(in_window).items()
        ),
    )


__all__ = [
    "AnalyticsRange",
    "AnalyticsOverview",
    "analytics_overview",
]
