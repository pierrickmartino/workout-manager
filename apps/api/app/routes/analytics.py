"""Analytics route: the honest count read model the Analytics screen renders from.

``GET /api/analytics?range=7d|30d|90d`` returns the standard envelope with the
range-scoped counts — sessions, active days, total sets — the set-count muscle
distribution, the last 8 Personal Records all-time (``recent_records``), the
range-scoped ``new_prs`` count, and the daily total-**volume** series with its
coverage percentage and equal-window delta, all computed by ``logbook/analytics.py``
over the user's Logged Sessions. The counts come straight from the *record* side with
no conversion; the records are Estimated-1RM PRs derived read-time from Logged Sets,
and volume is the coverage-honest kg total from typed Loads (ADR-0010).
The window ends on the server's current date; an unknown range is rejected by
validation and surfaced in the same error envelope. Reads are scoped to the owning
user."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import get_current_user
from app.domain.personal_records import PersonalRecord
from app.envelope import success_envelope
from app.logbook.analytics import AnalyticsOverview, AnalyticsRange, analytics_overview
from app.logbook.strength_analytics import strength_analytics_overview
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
        "sessions": overview.sessions,
        "active_days": overview.active_days,
        "total_sets": overview.total_sets,
        "muscle_distribution": [
            {"group": group, "pct": pct} for group, pct in overview.muscle_distribution
        ],
        "recent_records": [
            {
                "exercise": record.exercise_name,
                "estimated_1rm": record.estimated_1rm,
                "gain": record.gain,
                "date": record.performed_on.isoformat(),
            }
            for record in overview.recent_records
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
    }


@router.get("/analytics")
def read_analytics(
    range: AnalyticsRange = Query(default=AnalyticsRange.SEVEN_DAY),
    clerk_user_id: str = Depends(get_current_user),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
) -> dict:
    overview = analytics_overview(
        clerk_user_id, range, logged=logged, today=date.today(), profiles=profiles
    )
    return success_envelope(_serialize(overview))


def _serialize_record(record: PersonalRecord) -> dict:
    return {
        "exercise": record.exercise_name,
        "estimated_1rm": record.estimated_1rm,
        "gain": record.gain,
        "date": record.performed_on.isoformat(),
    }


@router.get("/analytics/strength")
def read_strength_analytics(
    limit: int = Query(default=DEFAULT_TIMELINE_LIMIT, ge=1, le=MAX_TIMELINE_LIMIT),
    offset: int = Query(default=0, ge=0),
    clerk_user_id: str = Depends(get_current_user),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    """The Strength Analytics screen's PR timeline: the all-time, all-Exercise Personal
    Record stream, newest-first and paginated, plus the ``has_qualifying_strength`` gate.

    Reads are scoped to the owning user. An out-of-range ``limit``/``offset`` is rejected
    by validation and surfaced in the same error envelope; a user with no qualifying
    strength history reads a closed gate and an empty timeline, never an error."""

    overview = strength_analytics_overview(
        clerk_user_id, logged=logged, limit=limit, offset=offset
    )
    return success_envelope(
        {
            "has_qualifying_strength": overview.has_qualifying_strength,
            "records": [_serialize_record(record) for record in overview.pr_timeline],
        },
        meta={"total": overview.total_records, "limit": limit, "offset": offset},
    )
