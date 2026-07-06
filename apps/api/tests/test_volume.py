"""The pure volume engine (F3 Slice 5): converting typed Loads to kg volume and
rolling a stream of Logged Sets into a daily-bucketed series with disclosed
coverage and an equal-window trend delta.

``set_volume`` is the per-set conversion — ``absolute`` and ``range`` loads carry a
kilogram volume; every other kind is not-yet-convertible and returns ``None``.
``volume_series`` buckets convertible volume by day across a rolling window, reports
the fraction of logged reps it actually converted (coverage), and compares the
window against the immediately preceding equal-length window (the delta). Pure over
the domain — no ORM, no HTTP — and exercised directly on flattened ``VolumeSet``s."""

from __future__ import annotations

from datetime import date

from datetime import timedelta

from app.domain.load import LoadKind, ParsedLoad
from app.domain.volume import VolumeSet, set_volume, volume_series

TODAY = date(2026, 7, 5)


def _abs(kg: float) -> dict:
    return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()


def _range(low: float, high: float) -> dict:
    return ParsedLoad(
        kind=LoadKind.RANGE, text=f"{low:g}-{high:g} kg", low_kg=low, high_kg=high
    ).to_dict()


def test_absolute_set_volume_is_reps_times_kg():
    # Arrange — five reps at 100 kg
    load = _abs(100.0)

    # Act
    volume = set_volume(load, reps=5)

    # Assert — one set of five reps moves 500 kg
    assert volume == 500.0


def test_range_set_volume_converts_at_the_midpoint():
    # Arrange — five reps at a prescribed 60-80 kg range
    load = _range(60.0, 80.0)

    # Act
    volume = set_volume(load, reps=5)

    # Assert — the midpoint (70 kg) drives the conversion: 5 × 70
    assert volume == 350.0


def test_qualitative_and_load_less_sets_are_not_convertible():
    # Arrange — a qualitative effort and a set with no recorded load
    qualitative = ParsedLoad(kind=LoadKind.QUALITATIVE, text="moderate").to_dict()

    # Act / Assert — neither carries a kilogram figure, so both are excluded
    assert set_volume(qualitative, reps=5) is None
    assert set_volume(None, reps=5) is None


def test_bodyweight_and_percent_1rm_are_not_yet_convertible():
    # Arrange — the two kinds this slice deliberately leaves for a later slice
    bodyweight = ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()
    percent = ParsedLoad(
        kind=LoadKind.PERCENT_1RM, text="70% 1RM", percent=70.0
    ).to_dict()

    # Act / Assert — both fall into the uncovered fraction for now, never a guess
    assert set_volume(bodyweight, reps=5) is None
    assert set_volume(percent, reps=5) is None


def _set(kg, reps, day):
    """A convertible absolute-load VolumeSet performed on ``day``."""

    return VolumeSet(reps=reps, load=_abs(kg), performed_on=day)


def test_volume_series_buckets_convertible_volume_by_day():
    # Arrange — two sets today (100kg×5 + 100kg×5 = 1000) and one yesterday (80kg×5)
    history = [
        _set(100.0, 5, TODAY),
        _set(100.0, 5, TODAY),
        _set(80.0, 5, TODAY - timedelta(days=1)),
    ]

    # Act
    series = volume_series(history, days=7, today=TODAY)

    # Assert — one point per day, ascending, same-day sets summed
    assert [(p.performed_on, p.volume_kg) for p in series.points] == [
        (TODAY - timedelta(days=1), 400.0),
        (TODAY, 1000.0),
    ]


def test_volume_series_excludes_sets_outside_the_window():
    # Arrange — a set 6 days ago (inside 7d) and one 7 days ago (just outside)
    history = [
        _set(100.0, 5, TODAY - timedelta(days=6)),
        _set(100.0, 5, TODAY - timedelta(days=7)),
    ]

    # Act
    series = volume_series(history, days=7, today=TODAY)

    # Assert — only the in-window day produces a point
    assert [p.performed_on for p in series.points] == [TODAY - timedelta(days=6)]


def test_coverage_is_the_share_of_logged_reps_that_converted():
    # Arrange — in the window: 6 convertible reps (absolute) and 4 that aren't
    # (a qualitative set), so 6 of 10 reps convert
    qualitative = ParsedLoad(kind=LoadKind.QUALITATIVE, text="hard").to_dict()
    history = [
        _set(100.0, 6, TODAY),
        VolumeSet(reps=4, load=qualitative, performed_on=TODAY),
    ]

    # Act
    series = volume_series(history, days=7, today=TODAY)

    # Assert — coverage weights by reps, not set count: 6 / 10 = 60%
    assert series.coverage_pct == 60.0


def test_full_coverage_when_every_logged_set_converts():
    # Arrange — every set in the window carries an absolute load
    history = [_set(100.0, 5, TODAY), _set(80.0, 3, TODAY)]

    # Act
    series = volume_series(history, days=7, today=TODAY)

    # Assert — nothing excluded, so coverage is a clean 100%
    assert series.coverage_pct == 100.0


def test_delta_compares_the_window_to_the_preceding_equal_window():
    # Arrange — 1000 kg this 7d window (day 0) vs 800 kg the prior 7d window (day 7)
    history = [
        _set(100.0, 10, TODAY),
        _set(100.0, 8, TODAY - timedelta(days=7)),
    ]

    # Act
    series = volume_series(history, days=7, today=TODAY)

    # Assert — (1000 - 800) / 800 = +25%
    assert series.delta_pct == 25.0


def test_delta_is_none_without_a_prior_window_baseline():
    # Arrange — volume this window, but nothing in the preceding one
    history = [_set(100.0, 5, TODAY)]

    # Act
    series = volume_series(history, days=7, today=TODAY)

    # Assert — no baseline to divide by, so the delta is withheld, not zero
    assert series.delta_pct is None


def test_empty_history_yields_no_points_zero_coverage_and_no_delta():
    # Arrange — a user who has logged nothing

    # Act
    series = volume_series([], days=30, today=TODAY)

    # Assert — the honest empty state, never an error or a divide-by-zero
    assert series.points == ()
    assert series.coverage_pct == 0.0
    assert series.delta_pct is None
