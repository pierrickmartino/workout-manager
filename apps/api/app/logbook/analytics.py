"""Range-scoped Analytics counts (F3 Slice 1) — an honest read of the *record*.

``analytics_overview`` reads the user's Logged Sessions and projects them onto a
single ``AnalyticsOverview``: the count of Logged Sessions, active days (distinct
``performed_on``), and total Logged Sets performed inside the selected rolling
window ending on a reference ``today``. Every number comes straight from Logged
Sessions and Logged Sets — no Load parsing, no Estimated 1RM, no conversion — so
the read model is honest and shippable on its own (the volume series, new-PR tile,
and muscle distribution arrive in later slices).

Reads are scoped to the owning user because the underlying repository's
``list_for_user`` already is. Pure orchestration over the Logged-Session
repository; no ORM, no HTTP."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from enum import Enum

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
    """The count read model for one range window: honest, conversion-free totals."""

    range: str
    sessions: int
    active_days: int
    total_sets: int


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
    )


__all__ = [
    "AnalyticsRange",
    "AnalyticsOverview",
    "analytics_overview",
]
