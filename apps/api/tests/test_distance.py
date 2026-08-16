"""The pure Weekly Distance engine (ADR-0049): the endurance twin of the volume
engine. It sums the metres of every ``distance``-kind Quantity across a rolling
window, buckets them by their Monday week-start into one bar per week (kilometres),
and compares the window against the immediately preceding equal-length window (the
delta). Unlike ``volume_series`` there is no coverage figure — a distance Quantity
carries exact metres, so nothing sits in an uncovered remainder.

``has_distance`` is the all-time gate the Analytics screen reads to decide whether a
user is a distance athlete at all. Pure over the domain — no ORM, no HTTP — and
exercised directly on flattened ``DistanceSet``s."""

from __future__ import annotations

from datetime import date, timedelta

from app.domain.quantity import Quantity, QuantityKind
from app.domain.week import week_start
from app.domain.distance import (
    DistanceSet,
    DistanceWeek,
    distance_series,
    has_distance,
)

TODAY = date(2026, 7, 5)  # a Sunday; its Monday week-start is 2026-06-29
THIS_MON = date(2026, 6, 29)
THIS_WED = date(2026, 7, 1)  # same ISO week as THIS_MON
PRIOR_MON = date(2026, 6, 22)  # the week before


def _distance(km: float, day: date, *, duration: str | None = None) -> DistanceSet:
    """A ``distance`` DistanceSet of ``km`` kilometres performed on ``day``."""

    seconds = None
    if duration is not None:
        minutes, secs = duration.split(":")
        seconds = int(minutes) * 60 + int(secs)
    quantity = Quantity(
        kind=QuantityKind.DISTANCE,
        text=f"{km:g} km",
        metres=km * 1000.0,
        duration_s=seconds,
    ).to_dict()
    return DistanceSet(quantity=quantity, performed_on=day)


def _reps(count: int, day: date) -> DistanceSet:
    quantity = Quantity(
        kind=QuantityKind.REPETITIONS, text=str(count), count=count
    ).to_dict()
    return DistanceSet(quantity=quantity, performed_on=day)


def _hold(seconds: float, day: date) -> DistanceSet:
    quantity = Quantity(
        kind=QuantityKind.DURATION, text=f"{seconds:g}s", seconds=seconds
    ).to_dict()
    return DistanceSet(quantity=quantity, performed_on=day)


def test_a_weeks_distance_sums_into_one_bar_in_kilometres():
    # Arrange — a single 5 km run this week
    history = [_distance(5.0, THIS_MON)]

    # Act
    series = distance_series(history, days=30, today=TODAY)

    # Assert — one weekly bar keyed by the week's Monday, in kilometres
    assert series.weeks == (DistanceWeek(THIS_MON, 5.0),)


def test_sets_in_the_same_week_collapse_to_one_bar():
    # Arrange — a Monday 5 km and a Wednesday 3 km in the same ISO week
    history = [_distance(5.0, THIS_MON), _distance(3.0, THIS_WED)]

    # Act
    series = distance_series(history, days=30, today=TODAY)

    # Assert — one bar for the week, summed: 5 + 3 = 8 km
    assert series.weeks == (DistanceWeek(THIS_MON, 8.0),)


def test_sets_in_different_weeks_produce_separate_ascending_bars():
    # Arrange — 4 km the prior week, 6 km this week
    history = [_distance(6.0, THIS_MON), _distance(4.0, PRIOR_MON)]

    # Act
    series = distance_series(history, days=30, today=TODAY)

    # Assert — one bar per week, ascending by Monday
    assert series.weeks == (
        DistanceWeek(PRIOR_MON, 4.0),
        DistanceWeek(THIS_MON, 6.0),
    )


def test_a_timed_run_still_counts_only_its_distance():
    # Arrange — a 5 km run completed in 25:00; the companion time is irrelevant here
    history = [_distance(5.0, THIS_MON, duration="25:00")]

    # Act
    series = distance_series(history, days=30, today=TODAY)

    # Assert — distance is the axis; the duration does not change the kilometres
    assert series.weeks == (DistanceWeek(THIS_MON, 5.0),)


def test_non_distance_sets_contribute_nothing():
    # Arrange — a rep set and a timed hold alongside one real run
    history = [
        _distance(5.0, THIS_MON),
        _reps(8, THIS_MON),
        _hold(60.0, THIS_MON),
    ]

    # Act
    series = distance_series(history, days=30, today=TODAY)

    # Assert — only the distance set's kilometres appear; reps/holds fall out
    assert series.weeks == (DistanceWeek(THIS_MON, 5.0),)


def test_sets_outside_the_window_are_excluded():
    # Arrange — a run inside the 30d window and one 30 days back (just outside)
    inside = _distance(5.0, TODAY - timedelta(days=29))
    outside = _distance(9.0, TODAY - timedelta(days=30))

    # Act
    series = distance_series([inside, outside], days=30, today=TODAY)

    # Assert — only the in-window run's week produces a bar
    assert series.weeks == (DistanceWeek(week_start(TODAY - timedelta(days=29)), 5.0),)


def test_delta_compares_the_window_to_the_preceding_equal_window():
    # Arrange — 10 km this 30d window vs 8 km in the preceding 30d window
    history = [
        _distance(10.0, TODAY),
        _distance(8.0, TODAY - timedelta(days=30)),
    ]

    # Act
    series = distance_series(history, days=30, today=TODAY)

    # Assert — (10 - 8) / 8 = +25%
    assert series.delta_pct == 25.0


def test_delta_is_none_without_a_prior_window_baseline():
    # Arrange — distance this window, nothing in the preceding one
    history = [_distance(5.0, TODAY)]

    # Act
    series = distance_series(history, days=30, today=TODAY)

    # Assert — no baseline to divide by, so the delta is withheld, not zero
    assert series.delta_pct is None


def test_empty_history_yields_no_weeks_and_no_delta():
    # Act
    series = distance_series([], days=90, today=TODAY)

    # Assert — the honest empty state, never an error or a divide-by-zero
    assert series.weeks == ()
    assert series.delta_pct is None


def test_has_distance_is_true_only_when_some_distance_set_exists():
    # Arrange — one history with a run, one with only strength/holds
    runner = [_reps(8, TODAY), _distance(5.0, TODAY)]
    lifter = [_reps(8, TODAY), _hold(60.0, TODAY)]

    # Assert — the all-time gate: a runner reads True, a pure lifter False
    assert has_distance(runner) is True
    assert has_distance(lifter) is False
    assert has_distance([]) is False
