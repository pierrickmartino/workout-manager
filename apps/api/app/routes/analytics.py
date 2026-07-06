"""Analytics route: the honest count read model the Analytics screen renders from.

``GET /api/analytics?range=7d|30d|90d`` returns the standard envelope with the
range-scoped counts — sessions, active days, total sets — the set-count muscle
distribution, the last 8 Personal Records all-time (``recent_records``), and the
range-scoped ``new_prs`` count, all computed by ``logbook/analytics.py`` over the
user's Logged Sessions. The counts come straight from the *record* side with no
conversion; the records are Estimated-1RM PRs derived read-time from Logged Sets.
The window ends on the server's current date; an unknown range is rejected by
validation and surfaced in the same error envelope. Reads are scoped to the owning
user."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import get_current_user
from app.envelope import success_envelope
from app.logbook.analytics import AnalyticsOverview, AnalyticsRange, analytics_overview
from app.repositories.deps import get_logged_session_repository
from app.repositories.logged_session_repository import LoggedSessionRepository

router = APIRouter(prefix="/api", tags=["analytics"])


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
    }


@router.get("/analytics")
def read_analytics(
    range: AnalyticsRange = Query(default=AnalyticsRange.SEVEN_DAY),
    clerk_user_id: str = Depends(get_current_user),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    overview = analytics_overview(
        clerk_user_id, range, logged=logged, today=date.today()
    )
    return success_envelope(_serialize(overview))
