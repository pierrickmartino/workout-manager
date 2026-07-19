"""Range-scoped Analytics read model (F3 Slice 1–5) — an honest read of the *record*.

``analytics_overview`` reads the user's Logged Sessions and projects them onto a
single ``AnalyticsOverview``: the count of Logged Sessions, active days (distinct
``performed_on``), total Logged Sets, and the set-count **muscle distribution**
performed inside the selected rolling window ending on a reference ``today``. The
count and distribution come straight from Logged Sessions and Logged Sets — no Load
parsing, no conversion.

On top of the counts it adds the total-**volume** line (Slice 5): the daily-bucketed
kg volume converted from typed Loads (``domain/volume``), the coverage percentage of
logged reps that actually converted, and the trend delta against the immediately
preceding equal-length window — the one part of the read model that does resolve
Loads, and does so coverage-honestly (ADR-0010).

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
from app.domain.personal_records import PersonalRecord, detect_personal_records
from app.domain.volume import VolumePoint, VolumeSet, volume_series
from app.logbook.records import set_records
from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    LoggedSessionView,
)
from app.repositories.profile_repository import ProfileRepository

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

    ``volume_points`` is the daily-bucketed total-volume line for the window (Slice 5),
    ascending and empty when nothing convertible was logged. ``volume_coverage`` is the
    share (0–100) of the window's logged reps the line actually converted — the honest
    caption behind "from N% of your logged volume". ``volume_delta`` is the window's
    total volume against the immediately preceding equal-length window, or ``None`` when
    there is no prior volume to compare against.
    """

    range: str
    sessions: int
    active_days: int
    total_sets: int
    muscle_distribution: tuple[tuple[str, float], ...]
    recent_records: tuple[PersonalRecord, ...]
    new_prs: int
    volume_points: tuple[VolumePoint, ...]
    volume_coverage: float
    volume_delta: float | None


def analytics_overview(
    clerk_user_id: str,
    window: AnalyticsRange,
    *,
    logged: LoggedSessionRepository,
    today: date,
    profiles: ProfileRepository | None = None,
) -> AnalyticsOverview:
    """Return the user's session / active-day / total-set counts for ``window``.

    A Logged Session counts when its ``performed_on`` falls in the rolling window
    of ``window.days`` calendar days ending on ``today`` (inclusive on both ends).
    A user who has logged nothing yields all-zero counts, never an error.

    ``profiles`` supplies the user's recorded body weight so ``bodyweight`` sets
    convert into volume; without it (or without a recorded weight) those sets stay
    excluded and disclosed in coverage. ``percent_1rm`` sets convert against each
    Exercise's best Estimated 1RM, taken from the Personal Records detected below.
    """

    start = today - timedelta(days=window.days - 1)
    history = logged.list_for_user(clerk_user_id)
    in_window = [
        session for session in history if start <= session.performed_on <= today
    ]

    # Personal Records are detected over the whole history, not just the window: the
    # feed is decoupled from the toggle, and only the count is scoped to the window.
    records = detect_personal_records(set_records(history))
    recent = tuple(reversed(records[-RECENT_RECORDS_LIMIT:]))
    new_prs = sum(1 for record in records if start <= record.performed_on <= today)

    # Records are oldest-first with each strictly beating the prior for its Exercise,
    # so the last one wins: this leaves each Exercise's best Estimated 1RM, the figure
    # percent-of-1RM sets convert against.
    best_1rm_by_exercise = {
        record.exercise_id: record.estimated_1rm for record in records
    }
    body_weight_kg = (
        profiles.get_or_create(clerk_user_id).weight_kg if profiles is not None else None
    )

    # Total volume is computed over the whole history (the engine slices its own
    # window and the preceding one for the delta), then bucketed daily for the chart.
    series = volume_series(
        _volume_sets(history),
        days=window.days,
        today=today,
        body_weight_kg=body_weight_kg,
        estimated_1rm_by_exercise=best_1rm_by_exercise,
    )

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
        volume_points=series.points,
        volume_coverage=series.coverage_pct,
        volume_delta=series.delta_pct,
    )


def _volume_sets(history: list[LoggedSessionView]) -> list[VolumeSet]:
    """Flatten Logged Sessions into dated Logged Sets for the volume engine.

    The engine needs each set's reps, typed Load, the date it was performed on — the
    session's ``performed_on`` — and its ``exercise_id`` (so a percent-of-1RM set can
    be converted against that Exercise's Estimated 1RM) to convert and bucket it.
    """

    return [
        VolumeSet(
            reps=logged_set.reps,
            load=logged_set.load,
            performed_on=session.performed_on,
            exercise_id=logged_set.exercise_id,
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
