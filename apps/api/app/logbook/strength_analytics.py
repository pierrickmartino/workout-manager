"""Strength Analytics read model (F-strength Slice 1) — a strength lens over the record.

``strength_analytics_overview`` reads the user's Logged Sessions once and projects them
onto a frozen ``StrengthAnalyticsOverview``: the all-time, all-Exercise **Personal Record
timeline**, reverse-chronological and paginated, plus a ``has_qualifying_strength`` gate
flag. The timeline reuses ``domain/personal_records.logged_set_records`` +
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
from datetime import date

from app.domain.muscle_groups import (
    MUSCLE_BALANCE_WEEKS,
    WeeklyComposition,
    weekly_distribution,
)
from app.domain.personal_records import (
    PersonalRecord,
    detect_personal_records,
    logged_set_records,
)
from app.logbook.top_sets import ExerciseTrajectory, rank_qualifying_exercises
from app.repositories.logged_session_repository import LoggedSessionRepository

# The balance-over-time series spans :data:`MUSCLE_BALANCE_WEEKS`, imported from the
# muscle-groups domain so the chart provably shares its recent window with the coming
# Muscle Group Coverage read (issue #187) rather than keeping its own private eight.


@dataclass(frozen=True)
class StrengthAnalyticsOverview:
    """The frozen strength projection for one page of the PR timeline.

    ``pr_timeline`` is the requested page of the all-time, all-Exercise Personal Record
    timeline, newest first — a flat reverse-chronological stream, each entry the set that
    set a new Estimated-1RM best for its Exercise with the gain over that Exercise's prior
    PR. ``total_records`` is the full count across every page, so the caller can paginate.

    ``trajectories`` is the ranked strength small-multiples (ADR-0024 / issue #177): the
    user's top few *qualifying* Exercises by recent training frequency, each with its
    oldest-first Top-Set series. Unlike the PR timeline it is **not** paginated — it is the
    whole small-multiples set, the same on every page — because it is a fixed handful the
    screen renders in one grid above the timeline.

    ``has_qualifying_strength`` gates the screen: true iff the user holds at least one
    Personal Record. A user with no comparable strength history reads ``False`` here and is
    never offered the screen (nor shown a fabricated zero if they reach it directly). A
    qualifying trajectory and a Personal Record open the gate on the same condition — the
    first absolute-Load set in the trustworthy window both sets a PR and starts a trajectory
    — so the flag stays a single honest signal.
    """

    pr_timeline: tuple[PersonalRecord, ...]
    total_records: int
    has_qualifying_strength: bool
    trajectories: tuple[ExerciseTrajectory, ...]
    # The Muscle-Group balance-over-time series (ADR-0024 / issue #178): one set-count
    # composition per week over the last :data:`MUSCLE_BALANCE_WEEKS`, oldest-first. It
    # reads *all* logged sets (not just qualifying strength), is descriptive only, and
    # keeps untrained weeks as honest empty compositions rather than dropping them.
    weekly_muscle_balance: tuple[WeeklyComposition, ...]


def strength_analytics_overview(
    clerk_user_id: str,
    *,
    logged: LoggedSessionRepository,
    limit: int | None = None,
    offset: int = 0,
    today: date | None = None,
) -> StrengthAnalyticsOverview:
    """Return the user's newest-first Personal Record timeline for one page.

    Personal Records are detected over the whole history (oldest-first, each strictly
    beating the prior best for its Exercise), then reversed so the freshest milestone
    leads. ``offset``/``limit`` slice out the requested page; ``limit`` of ``None`` returns
    the full remaining tail. A user who holds no Personal Record yields an empty timeline
    with the gate closed — the honest empty state, never an error.
    """

    history = logged.list_for_user(clerk_user_id)
    records = detect_personal_records(logged_set_records(history))
    timeline = list(reversed(records))

    end = len(timeline) if limit is None else offset + limit
    page = tuple(timeline[offset:end])

    reference = today if today is not None else date.today()

    return StrengthAnalyticsOverview(
        pr_timeline=page,
        total_records=len(timeline),
        has_qualifying_strength=bool(timeline),
        # The small-multiples are the whole ranked set, independent of the timeline page.
        trajectories=tuple(rank_qualifying_exercises(history)),
        weekly_muscle_balance=tuple(
            weekly_distribution(
                history, reference=reference, weeks=MUSCLE_BALANCE_WEEKS
            )
        ),
    )


__all__ = [
    "MUSCLE_BALANCE_WEEKS",
    "StrengthAnalyticsOverview",
    "strength_analytics_overview",
]
