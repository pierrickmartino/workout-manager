"""Profile Training Heatmap route (#378, ADR-0054): the daily activity mosaic.

``GET /api/profile/heatmap`` returns the standard envelope with a trailing ~53-week grid
of dated, fixed-shade cells plus the legend scale, computed by ``logbook/heatmap.py`` over
the user's Logged Sessions. Every cell is derived read-time from the *record* side — no
stored counters, no write hooks (ADR-0018) — so a corrected or deleted log simply
recomputes it. The window ends at the Monday-week of the server's current date. Reads are
scoped to the authenticated user.

Deliberately a **separate** endpoint, not folded into ``GET /api/profile/progress``, so
the always-fetched progress payload stays lean and the ~371-cell series is fetched only
when the Heatmap is wanted (ADR-0054)."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.domain.heatmap import Heatmap
from app.envelope import success_envelope
from app.logbook.heatmap import training_heatmap
from app.repositories.deps import get_logged_session_repository
from app.repositories.logged_session_repository import LoggedSessionRepository

router = APIRouter(prefix="/api", tags=["profile"])


def _serialize(heatmap: Heatmap) -> dict:
    return {
        "cells": [
            {
                # ISO-8601 date (yyyy-mm-dd) of the day this cell represents.
                "date": cell.date.isoformat(),
                "column": cell.column,
                "row": cell.row,
                "session_count": cell.session_count,
                "set_count": cell.set_count,
                "level": cell.level,
            }
            for cell in heatmap.cells
        ],
        # The fixed shade scale, so the client renders the legend without hardcoding it.
        "scale": [
            {"level": bucket.level, "min_sets": bucket.min_sets}
            for bucket in heatmap.scale
        ],
    }


@router.get("/profile/heatmap")
def read_profile_heatmap(
    clerk_user_id: str = Depends(get_current_user),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    heatmap = training_heatmap(clerk_user_id, logged=logged, today=date.today())
    return success_envelope(_serialize(heatmap))
