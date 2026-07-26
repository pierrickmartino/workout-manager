"""Shared Top-Set read helper — the one per-session Top Set every strength surface reuses.

A session's **Top Set** for an Exercise is the best Estimated 1RM among its scorable sets
in the trustworthy 1–12-rep window — qualified through the *one yardstick*
(``estimated_1rm_for_set``) the Personal Record tile and PR detector already compare on
(ADR-0017). An ``absolute`` set qualifies on its kilograms; a ``bodyweight`` set qualifies
once resolved against its Performed Body Weight (ADR-0026), so calisthenics Exercises draw
their trend on the identical yardstick as barbell lifts. ``top_set_series`` projects a
Logged-Session history onto one Exercise's
oldest-first trajectory of those Top Sets, capped to the most recent
:data:`TOP_SET_SERIES_LIMIT` so the trend reads as a recent trajectory rather than a wall
of history; a session with no qualifying set contributes no point (no zero-padding).

This logic lived inline in ``logbook/exercise_records`` (F6 Slice 3); issue #177 lifts it
here so Exercise Detail and Strength Analytics compute the *identical* trajectory rather
than drifting apart. Pure orchestration over the repository view — no ORM, no HTTP —
mirroring ``logbook/records.py``."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.domain.personal_records import estimated_1rm_for_set
from app.repositories.logged_session_repository import LoggedSessionView

# The Top-Set trend charts only the most recent qualifying sessions so it reads as a
# trajectory, not a wall of history (ADR-0017: "the last 8 qualifying sessions"). Older
# points fall off the left rather than being averaged away.
TOP_SET_SERIES_LIMIT = 8

# Strength Analytics shows the top few qualifying Exercises as small-multiples, not the
# whole catalog (ADR-0024: "the top ~5–6 qualifying Exercises by recent frequency"). The
# rest stay one tap away on their own Exercise Detail chart.
DEFAULT_TRAJECTORY_CAP = 6


@dataclass(frozen=True)
class TopSetPoint:
    """One qualifying session's Top Set — its best Estimated 1RM (kg) on that date.

    A session contributes a point only when it holds at least one scorable set in the
    trustworthy rep window — an absolute set, or a bodyweight set with a Performed Body
    Weight; ``estimated_1rm`` is the best such Est. 1RM in it. There is no zero-padding —
    a session with nothing qualifying is simply absent, never a 0.
    """

    performed_on: date
    estimated_1rm: float


@dataclass(frozen=True)
class ExerciseTrajectory:
    """One Exercise's ranked Top-Set trajectory for the Strength Analytics small-multiples.

    ``series`` is the same oldest-first, capped Top-Set series :func:`top_set_series`
    yields for the Exercise's canonical chart on Exercise Detail, so the small-multiple is
    a faithful teaser rather than a subtly-different second chart (ADR-0024). Trajectories
    are only built for *qualifying* Exercises, so ``series`` is always non-empty.
    """

    exercise_id: int
    exercise_name: str
    series: list[TopSetPoint]


def _session_top_sets(session: LoggedSessionView) -> dict[int, float]:
    """The best qualifying Estimated 1RM per Exercise within one Logged Session.

    A set qualifies through the one yardstick (``estimated_1rm_for_set``): an absolute set
    on its kilograms, a bodyweight set once resolved against its Performed Body Weight, both
    inside the trustworthy rep window. An Exercise absent from the result had no qualifying
    set that session. The single per-session pass both ``top_set_series`` and
    ``rank_qualifying_exercises`` read through, so a session's Top Set means one thing.
    """

    best: dict[int, float] = {}
    for logged_set in session.logged_sets:
        estimate = estimated_1rm_for_set(
            logged_set.load, logged_set.quantity, logged_set.body_weight_kg
        )
        if estimate is None:
            continue
        current = best.get(logged_set.exercise_id)
        if current is None or estimate > current:
            best[logged_set.exercise_id] = estimate
    return best


def top_set_series(
    history: list[LoggedSessionView], exercise_id: int
) -> list[TopSetPoint]:
    """The Top Set (best Est. 1RM) per qualifying session, oldest-first, last N only.

    Each Logged Session contributes at most one point: the best Estimated 1RM among its
    scorable sets of the Exercise in the trustworthy rep window — absolute, or bodyweight
    resolved against its Performed Body Weight. Sessions with no such set are omitted (no
    zero-padding). Points are ordered oldest-first and capped
    at the last :data:`TOP_SET_SERIES_LIMIT` so the trend reads as a recent trajectory.
    """

    points = [
        TopSetPoint(performed_on=session.performed_on, estimated_1rm=tops[exercise_id])
        for session in history
        if exercise_id in (tops := _session_top_sets(session))
    ]
    points.sort(key=lambda point: point.performed_on)
    return points[-TOP_SET_SERIES_LIMIT:]


def rank_qualifying_exercises(
    history: list[LoggedSessionView], *, cap: int = DEFAULT_TRAJECTORY_CAP
) -> list[ExerciseTrajectory]:
    """The top ``cap`` qualifying Exercises by recent training frequency, each with its
    Top-Set trajectory (issue #177 / ADR-0024).

    A qualifying Exercise has at least one scorable set in the trustworthy rep window — an
    absolute set, or a bodyweight set resolved against its Performed Body Weight (ADR-0026);
    non-scorable sets (bodyweight with no captured weight, qualitative, %-1RM, range,
    high-rep) never bring an Exercise in.
    Exercises are ranked by how many sessions they were trained in (most first), ties
    broken by the most recent qualifying session (freshest first) and then Exercise id for
    a stable order. Each ``series`` is the oldest-first, :data:`TOP_SET_SERIES_LIMIT`-capped
    trajectory — identical to the Exercise's canonical chart. Frequency counts *all*
    qualifying sessions, not just the charted tail, so a staple lift outranks a novelty.
    """

    names: dict[int, str] = {}
    points_by_exercise: dict[int, list[TopSetPoint]] = {}
    for session in history:
        for logged_set in session.logged_sets:
            names.setdefault(logged_set.exercise_id, logged_set.exercise_name)
        for exercise_id, best in _session_top_sets(session).items():
            points_by_exercise.setdefault(exercise_id, []).append(
                TopSetPoint(performed_on=session.performed_on, estimated_1rm=best)
            )

    for points in points_by_exercise.values():
        points.sort(key=lambda point: point.performed_on)

    def rank_key(item: tuple[int, list[TopSetPoint]]) -> tuple[int, int, int]:
        exercise_id, points = item
        # Most qualifying sessions first, then most-recent training, then id for stability.
        return (-len(points), -points[-1].performed_on.toordinal(), exercise_id)

    ranked = sorted(points_by_exercise.items(), key=rank_key)[:cap]
    return [
        ExerciseTrajectory(
            exercise_id=exercise_id,
            exercise_name=names[exercise_id],
            series=points[-TOP_SET_SERIES_LIMIT:],
        )
        for exercise_id, points in ranked
    ]


__all__ = [
    "TopSetPoint",
    "ExerciseTrajectory",
    "TOP_SET_SERIES_LIMIT",
    "DEFAULT_TRAJECTORY_CAP",
    "top_set_series",
    "rank_qualifying_exercises",
]
