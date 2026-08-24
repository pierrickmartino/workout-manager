"""The read-time orchestration behind the Profile Training Heatmap (#378, ADR-0054).

``training_heatmap`` reads the user's Logged Sessions **once** and projects them onto the
pure :func:`app.domain.heatmap.project_heatmap` grid: each session contributes its
performed date and its count of attempted Logged Sets. Every figure is derived from the
*record* side — no stored counters, no write hooks (ADR-0018) — so a corrected or deleted
log simply recomputes, mirroring ``logbook/profile_progress.py``.

Pure orchestration over the Logged-Session repository: no ORM, no HTTP, user-scoped
because ``list_for_user`` already is."""

from __future__ import annotations

from datetime import date

from app.domain.heatmap import Heatmap, project_heatmap
from app.repositories.logged_session_repository import LoggedSessionRepository


def training_heatmap(
    clerk_user_id: str,
    *,
    logged: LoggedSessionRepository,
    today: date,
) -> Heatmap:
    """Project the user's Logged Sessions onto the trailing ~53-week Heatmap grid.

    The history is read once; each session maps to ``(performed_on, attempted-set count)``
    and the domain buckets them into the fixed-shade, Monday-aligned frame ending at the
    week of ``today``. Scoped to the owning user because ``list_for_user`` already is; a
    user with no history projects to an all-neutral full-width frame.
    """

    history = logged.list_for_user(clerk_user_id)
    sessions = [
        (session.performed_on, len(session.logged_sets)) for session in history
    ]
    return project_heatmap(sessions, today=today)


__all__ = ["training_heatmap"]
