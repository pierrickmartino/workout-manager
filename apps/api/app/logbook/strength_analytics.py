"""Strength Analytics read model (F-strength Slice 1) — a strength lens over the record.

``strength_analytics_overview`` reads the user's Logged Sessions once and projects them
onto a frozen ``StrengthAnalyticsOverview``: the all-time, all-Exercise **Personal Record
timeline**, reverse-chronological and paginated, plus a ``has_qualifying_strength`` gate
flag. The timeline reuses ``logbook/records.set_records`` +
``domain/personal_records.detect_personal_records`` verbatim — the same PRs every other
surface reads — reversed to newest-first; there is no new strength math here. The gate is
true iff the user holds at least one Personal Record (later slices also let qualifying
trajectories open it), the signal the account Analytics screen reads to decide whether to
offer this screen at all rather than lure a user into an empty one.

Everything is a read-time projection over Logged Sets: a corrected, back-dated, or deleted
log simply recomputes. No stored PR table, no write hook (ADR-0010/0018). Reads are scoped
to the owning user because the repository's ``list_for_user`` already is. Pure orchestration
over the Logged-Session repository; no ORM, no HTTP."""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.personal_records import PersonalRecord, detect_personal_records
from app.logbook.records import set_records
from app.repositories.logged_session_repository import LoggedSessionRepository


@dataclass(frozen=True)
class StrengthAnalyticsOverview:
    """The frozen strength projection for one page of the PR timeline.

    ``pr_timeline`` is the requested page of the all-time, all-Exercise Personal Record
    timeline, newest first — a flat reverse-chronological stream, each entry the set that
    set a new Estimated-1RM best for its Exercise with the gain over that Exercise's prior
    PR. ``total_records`` is the full count across every page, so the caller can paginate.

    ``has_qualifying_strength`` gates the screen: true iff the user holds at least one
    Personal Record. A user with no comparable strength history reads ``False`` here and is
    never offered the screen (nor shown a fabricated zero if they reach it directly).
    """

    pr_timeline: tuple[PersonalRecord, ...]
    total_records: int
    has_qualifying_strength: bool


def strength_analytics_overview(
    clerk_user_id: str,
    *,
    logged: LoggedSessionRepository,
    limit: int | None = None,
    offset: int = 0,
) -> StrengthAnalyticsOverview:
    """Return the user's newest-first Personal Record timeline for one page.

    Personal Records are detected over the whole history (oldest-first, each strictly
    beating the prior best for its Exercise), then reversed so the freshest milestone
    leads. ``offset``/``limit`` slice out the requested page; ``limit`` of ``None`` returns
    the full remaining tail. A user who holds no Personal Record yields an empty timeline
    with the gate closed — the honest empty state, never an error.
    """

    history = logged.list_for_user(clerk_user_id)
    records = detect_personal_records(set_records(history))
    timeline = list(reversed(records))

    end = len(timeline) if limit is None else offset + limit
    page = tuple(timeline[offset:end])

    return StrengthAnalyticsOverview(
        pr_timeline=page,
        total_records=len(timeline),
        has_qualifying_strength=bool(timeline),
    )


__all__ = ["StrengthAnalyticsOverview", "strength_analytics_overview"]
