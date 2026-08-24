"""Analytics route: the honest count read model the Analytics screen renders from.

``GET /api/analytics?range=30d|90d|150d`` returns the standard envelope with the
range-scoped counts — sessions, active days, total sets — the set-count muscle
distribution, the last 8 Personal Records all-time (``recent_records``), the
range-scoped ``new_prs`` count, the daily total-**volume** series with its coverage
percentage and equal-window delta, and the weekly **distance** series with its own
equal-window delta and all-time ``has_distance`` gate (ADR-0049), all computed by
``logbook/analytics.py`` over the user's Logged Sessions. The counts come straight
from the *record* side with no conversion; the records are Estimated-1RM PRs derived
read-time from Logged Sets, volume is the coverage-honest kg total from typed Loads
(ADR-0010), and distance is the exact-metres weekly total from typed Quantities.
The window ends on the server's current date; an unknown range is rejected by
validation and surfaced in the same error envelope. Reads are scoped to the owning
user."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import get_current_user
from app.domain.muscle_groups import MUSCLE_BALANCE_WEEKS, WeeklyComposition
from app.domain.personal_records import PersonalRecord
from app.envelope import success_envelope
from app.logbook.analytics import AnalyticsOverview, AnalyticsRange, analytics_overview
from app.logbook.records import personal_record_payload
from app.logbook.strength_analytics import strength_analytics_overview
from app.logbook.top_sets import ExerciseTrajectory
from app.repositories.deps import (
    get_logged_session_repository,
    get_profile_repository,
)
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.profile_repository import ProfileRepository

router = APIRouter(prefix="/api", tags=["analytics"])

# The Strength Analytics PR timeline paginates like the Exercise catalog: a modest
# default page, capped so an over-range request is rejected rather than served.
DEFAULT_TIMELINE_LIMIT = 20
MAX_TIMELINE_LIMIT = 50


def _serialize(overview: AnalyticsOverview) -> dict:
    return {
        "range": overview.range,
        # The windows the range selector may offer at the user's History Depth, and the
        # served window is the requested one clamped into that set (ADR-0056).
        "available_ranges": list(overview.available_ranges),
        "sessions": overview.sessions,
        "active_days": overview.active_days,
        "total_sets": overview.total_sets,
        "muscle_distribution": [
            {"group": group, "pct": pct} for group, pct in overview.muscle_distribution
        ],
        "recent_records": [
            personal_record_payload(record) for record in overview.recent_records
        ],
        "new_prs": overview.new_prs,
        "volume": {
            "points": [
                {"date": point.performed_on.isoformat(), "volume_kg": point.volume_kg}
                for point in overview.volume_points
            ],
            "coverage": overview.volume_coverage,
            "delta": overview.volume_delta,
        },
        # Weekly Distance (ADR-0049): one bar per Monday-anchored week in kilometres,
        # its own equal-window delta, and the all-time gate the screen shows the chart
        # on. No coverage figure — a distance Quantity carries exact metres.
        "distance": {
            "weeks": [
                {"week": week.week_start.isoformat(), "km": week.kilometres}
                for week in overview.distance_weeks
            ],
            "delta": overview.distance_delta,
            "has_distance": overview.has_distance,
        },
        # Muscle Group Coverage (ADR-0025): the six real groups each trained / not-trained
        # over the labeled, range-independent 8-week window, in canonical order.
        # ``unclassified_present`` discloses any in-window work that rolls up outside the six
        # real groups (issue #189) — the signal behind the neutral footnote, never a seventh
        # row and never a coverage target.
        "coverage": {
            "weeks": MUSCLE_BALANCE_WEEKS,
            "groups": [
                {"group": row.group.value, "covered": row.covered}
                for row in overview.coverage.groups
            ],
            "unclassified_present": overview.coverage.unclassified_present,
        },
    }


@router.get("/analytics")
def read_analytics(
    range: AnalyticsRange = Query(default=AnalyticsRange.THIRTY_DAY),
    clerk_user_id: str = Depends(get_current_user),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
) -> dict:
    overview = analytics_overview(
        clerk_user_id, range, logged=logged, today=date.today(), profiles=profiles
    )
    return success_envelope(_serialize(overview))


def _serialize_record(record: PersonalRecord) -> dict:
    return personal_record_payload(record)


def _serialize_week(week: WeeklyComposition) -> dict:
    """One week of the Muscle-Group balance series: its Monday and the per-group split.

    ``groups`` reuses the snapshot distribution's ``{group, pct}`` shape, already in
    canonical order (Unclassified last); an untrained week serializes with an empty
    ``groups`` list — the honest empty week, never dropped."""

    return {
        "week": week.week_start.isoformat(),
        "groups": [
            {"group": group, "pct": pct} for group, pct in week.composition.items()
        ],
    }


def _serialize_trajectory(trajectory: ExerciseTrajectory) -> dict:
    return {
        "exercise_id": trajectory.exercise_id,
        "exercise": trajectory.exercise_name,
        "series": [
            {
                "date": point.performed_on.isoformat(),
                "estimated_1rm": point.estimated_1rm,
            }
            for point in trajectory.series
        ],
    }


@router.get("/analytics/strength")
def read_strength_analytics(
    limit: int = Query(default=DEFAULT_TIMELINE_LIMIT, ge=1, le=MAX_TIMELINE_LIMIT),
    offset: int = Query(default=0, ge=0),
    clerk_user_id: str = Depends(get_current_user),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    """The Strength Analytics screen's read model: the all-time, all-Exercise Personal
    Record stream (newest-first, paginated), the ranked strength ``trajectories`` — the
    top qualifying Exercises' Top-Set small-multiples (issue #177) — the weekly
    ``muscle_balance`` composition series (issue #178), and the
    ``has_qualifying_strength`` gate.

    The timeline paginates via ``limit``/``offset``; the trajectories are the whole ranked
    small-multiples set, unpaginated, the same on every page. Reads are scoped to the owning
    user. An out-of-range ``limit``/``offset`` is rejected by validation and surfaced in the
    same error envelope; a user with no qualifying strength history reads a closed gate, an
    empty timeline, and no trajectories, never an error."""

    overview = strength_analytics_overview(
        clerk_user_id, logged=logged, limit=limit, offset=offset, today=date.today()
    )
    return success_envelope(
        {
            "has_qualifying_strength": overview.has_qualifying_strength,
            "records": [_serialize_record(record) for record in overview.pr_timeline],
            "trajectories": [
                _serialize_trajectory(trajectory)
                for trajectory in overview.trajectories
            ],
            "muscle_balance": [
                _serialize_week(week) for week in overview.weekly_muscle_balance
            ],
        },
        meta={"total": overview.total_records, "limit": limit, "offset": offset},
    )
