"""Range-scoped Analytics counts (F3 Slice 1–4) — an honest read of the *record*.

``analytics_overview`` reads the user's Logged Sessions and projects them onto a
single ``AnalyticsOverview``: the count of Logged Sessions, active days (distinct
``performed_on``), total Logged Sets, and the set-count **muscle distribution**
performed inside the selected rolling window ending on a reference ``today``. The
count and distribution come straight from Logged Sessions and Logged Sets — no Load
parsing, no conversion.

On top of the counts it derives Personal Records read-time (``domain/personal_records``)
over the user's whole history: the **last 8 PRs all-time** (deliberately decoupled from
the range toggle, so the feed is rarely empty) and the range-scoped **new-PRs count**.
PRs are detected purely from Logged Sets, never a plan; only absolute-Load sets in the
trustworthy rep window can set one.

Reads are scoped to the owning user because the underlying repository's
``list_for_user`` already is. Pure orchestration over the Logged-Session
repository; no ORM, no HTTP."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from enum import Enum

from app.domain.muscle_groups import distribution
from app.domain.personal_records import (
    LoggedSetRecord,
    PersonalRecord,
    detect_personal_records,
)
from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    LoggedSessionView,
)

# The Recent Records feed shows the most recent PRs, all-time — decoupled from the
# range toggle so it is rarely empty even on a quiet week.
RECENT_RECORDS_LIMIT = 8


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

    ``recent_records`` is the last ``RECENT_RECORDS_LIMIT`` Personal Records all-time
    (Slice 4), newest first and **decoupled from the window** so the feed rarely
    empties. ``new_prs`` counts only the PRs whose date falls inside the selected
    window — the number the bento's fourth tile shows.
    """

    range: str
    sessions: int
    active_days: int
    total_sets: int
    muscle_distribution: tuple[tuple[str, float], ...]
    recent_records: tuple[PersonalRecord, ...]
    new_prs: int


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
    history = logged.list_for_user(clerk_user_id)
    in_window = [
        session for session in history if start <= session.performed_on <= today
    ]

    # Personal Records are detected over the whole history, not just the window: the
    # feed is decoupled from the toggle, and only the count is scoped to the window.
    records = detect_personal_records(_set_records(history))
    recent = tuple(reversed(records[-RECENT_RECORDS_LIMIT:]))
    new_prs = sum(1 for record in records if start <= record.performed_on <= today)

    return AnalyticsOverview(
        range=window.value,
        sessions=len(in_window),
        active_days=len({session.performed_on for session in in_window}),
        total_sets=sum(len(session.logged_sets) for session in in_window),
        muscle_distribution=tuple(
            (group.value, pct) for group, pct in distribution(in_window).items()
        ),
        recent_records=recent,
        new_prs=new_prs,
    )


def _set_records(history: list[LoggedSessionView]) -> list[LoggedSetRecord]:
    """Flatten Logged Sessions into dated Logged Set records for PR detection.

    Each Logged Set is paired with its session's ``performed_on`` so the detector,
    which knows nothing about sessions, can order the stream and stamp each PR.
    """

    return [
        LoggedSetRecord(
            exercise_id=logged_set.exercise_id,
            exercise_name=logged_set.exercise_name,
            reps=logged_set.reps,
            load=logged_set.load,
            performed_on=session.performed_on,
        )
        for session in history
        for logged_set in session.logged_sets
    ]


__all__ = [
    "AnalyticsRange",
    "AnalyticsOverview",
    "analytics_overview",
    "RECENT_RECORDS_LIMIT",
]
