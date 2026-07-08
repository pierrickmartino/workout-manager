"""Per-exercise stat header read model (F6 Slice 2) — an honest read of the *record*.

``exercise_records`` reads the user's Logged Sessions and projects them onto a single
Exercise, deriving the two figures the stat header shows above the SPECS / HISTORY /
RECORDS tabs (ADR-0017):

- ``personal_record`` — the **Personal Record**: the highest Estimated 1RM the user
  has ever logged for the Exercise, or ``None`` when no absolute-Load set in the
  trustworthy 1–12-rep window exists. For a bodyweight / qualitative / %-1RM / range
  Exercise this stays ``None`` so the tile is *hidden, never zeroed* — a ``0 kg`` would
  be a fabrication. It is the highest Estimated 1RM, never the heaviest bar touched:
  CONTEXT.md reserves "Personal Record" for the estimate, not a raw-load "personal best".
- ``total_sets`` — the count of the user's Logged Sets of the Exercise, across every
  session and regardless of Load kind. It always exists, so it always renders.

The strength figure reuses the shipped ``one_rep_max`` / ``personal_records`` domain
(``detect_personal_records``): the records it returns are oldest-first with each strictly
beating the prior, so the last one is the highest — the Personal Record. No new strength
logic, no ORM, no HTTP. Reads are scoped to the owning user because the underlying
repository's ``list_for_user`` already is. Mirrors ``logbook/progress.py`` and
``logbook/analytics.py``.

F6 Slice 3 extends this same module with ``top_set_series`` — the Top Set (best Est. 1RM)
per qualifying session, oldest-first — reusing the same one-yardstick set qualifier
(``estimated_1rm_for_set``) as the PR tile. F6 Slice 4 adds ``pr_milestones`` — every set
that struck a new Estimated-1RM best, newest-first (the RECORDS lens) — reusing the same
``detect_personal_records`` output already computed for the Personal Record tile."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.domain.personal_records import (
    LoggedSetRecord,
    PersonalRecord,
    detect_personal_records,
    estimated_1rm_for_set,
)
from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    LoggedSessionView,
)

# The Top-Set Trend charts only the most recent qualifying sessions so the bar chart
# reads as a trajectory, not a wall of history (ADR-0017: "the last 8 qualifying
# sessions"). Older points fall off the left rather than being averaged away.
TOP_SET_SERIES_LIMIT = 8


@dataclass(frozen=True)
class TopSetPoint:
    """One qualifying session's Top Set — its best Estimated 1RM (kg) on that date.

    A session contributes a point only when it holds at least one absolute-Load set in
    the trustworthy rep window; ``estimated_1rm`` is the best such Est. 1RM in it. There
    is no zero-padding — a session with nothing qualifying is simply absent, never a 0.
    """

    performed_on: date
    estimated_1rm: float


@dataclass(frozen=True)
class ExerciseRecordsView:
    """The stat-header figures for one Exercise, derived purely from the record side.

    ``personal_record`` is the highest Estimated 1RM (kg), or ``None`` when the Exercise
    has no absolute-Load set in the trustworthy rep window — the signal to *hide* the PR
    tile rather than show zero. ``total_sets`` counts every Logged Set of the Exercise.
    ``top_set_series`` is the Top Set (best Est. 1RM) per qualifying session, oldest-first
    and capped at the last :data:`TOP_SET_SERIES_LIMIT`, with no zero-padding — empty for
    an Exercise with no qualifying session. ``pr_milestones`` is every set that struck a
    new Estimated-1RM best for the Exercise — the RECORDS lens (ADR-0017) — newest-first,
    each carrying the new Est. 1RM, the gain over the prior PR (``0.0`` for the first), and
    its date; empty for an Exercise that can set no Personal Record. ``exercise_name`` is
    empty when the user has never logged the Exercise.
    """

    exercise_id: int
    exercise_name: str
    personal_record: float | None
    total_sets: int
    top_set_series: list[TopSetPoint]
    pr_milestones: list[PersonalRecord]


def exercise_records(
    clerk_user_id: str,
    exercise_id: int,
    *,
    logged: LoggedSessionRepository,
) -> ExerciseRecordsView:
    """Return the Personal Record and Total Sets for one Exercise, user-scoped.

    Only the requested Exercise's Logged Sets contribute. The Personal Record is the
    highest Estimated 1RM over that history (``None`` when no absolute-Load qualifying
    set exists); Total Sets counts all of them. A user who has never logged the Exercise
    yields ``None`` / ``0`` with an empty name — an honest empty state, never an error.
    """

    history = logged.list_for_user(clerk_user_id)

    exercise_name = ""
    total_sets = 0
    for session in history:
        for logged_set in session.logged_sets:
            if logged_set.exercise_id != exercise_id:
                continue
            total_sets += 1
            if not exercise_name:
                exercise_name = logged_set.exercise_name

    records = detect_personal_records(_set_records(history, exercise_id))
    # Records are oldest-first with each strictly beating the prior, so the last is the
    # highest Estimated 1RM — the Personal Record. Absent when nothing qualified.
    personal_record = records[-1].estimated_1rm if records else None

    return ExerciseRecordsView(
        exercise_id=exercise_id,
        exercise_name=exercise_name,
        personal_record=personal_record,
        total_sets=total_sets,
        top_set_series=_top_set_series(history, exercise_id),
        # The RECORDS lens shows the milestones newest-first (mirroring the Analytics
        # feed); the detector returns them oldest-first, so reverse the same records
        # already computed for the PR tile — no second pass over the history.
        pr_milestones=list(reversed(records)),
    )


def _top_set_series(
    history: list[LoggedSessionView], exercise_id: int
) -> list[TopSetPoint]:
    """The Top Set (best Est. 1RM) per qualifying session, oldest-first, last N only.

    Each Logged Session contributes at most one point: the best Estimated 1RM among its
    absolute-Load sets of the Exercise in the trustworthy rep window. Sessions with no
    such set are omitted (no zero-padding). Points are ordered oldest-first and capped
    at the last :data:`TOP_SET_SERIES_LIMIT` so the trend reads as a recent trajectory.
    """

    points: list[TopSetPoint] = []
    for session in history:
        best: float | None = None
        for logged_set in session.logged_sets:
            if logged_set.exercise_id != exercise_id:
                continue
            estimate = estimated_1rm_for_set(logged_set.load, logged_set.reps)
            if estimate is None:
                continue
            if best is None or estimate > best:
                best = estimate
        if best is not None:
            points.append(TopSetPoint(performed_on=session.performed_on, estimated_1rm=best))

    points.sort(key=lambda point: point.performed_on)
    return points[-TOP_SET_SERIES_LIMIT:]


def _set_records(
    history: list[LoggedSessionView], exercise_id: int
) -> list[LoggedSetRecord]:
    """Flatten the Exercise's Logged Sets into dated records for PR detection.

    Filtered to the one Exercise so the detector — which is scoped per Exercise but
    otherwise history-wide — only ever weighs this movement. Each set is paired with
    its session's ``performed_on`` so the stream can be ordered.
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
        if logged_set.exercise_id == exercise_id
    ]


__all__ = [
    "ExerciseRecordsView",
    "TopSetPoint",
    "TOP_SET_SERIES_LIMIT",
    "exercise_records",
]
