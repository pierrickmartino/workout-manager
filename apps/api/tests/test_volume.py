"""The pure volume engine (F3 Slice 5–6): converting typed Loads to kg volume and
rolling a stream of Logged Sets into a daily-bucketed series with disclosed
coverage and an equal-window trend delta.

``set_volume`` is the per-set conversion — ``absolute`` and ``range`` loads carry a
kilogram volume outright, ``bodyweight`` resolves against the user's body weight and
``percent_1rm`` against the Exercise's Estimated 1RM; a conversion whose input is
missing returns ``None`` and is disclosed in coverage rather than guessed.
``volume_series`` buckets convertible volume by day across a rolling window, reports
the fraction of logged reps it actually converted (coverage), and compares the
window against the immediately preceding equal-length window (the delta). Pure over
the domain — no ORM, no HTTP — and exercised directly on flattened ``VolumeSet``s."""

from __future__ import annotations

from datetime import date

from datetime import timedelta

from app.domain.load import LoadKind, ParsedLoad
from app.domain.volume import VolumePoint, VolumeSet, set_volume, volume_series

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


def test_bodyweight_set_converts_using_body_weight():
    # Arrange — ten strict pull-ups at a recorded body weight of 70 kg
    bodyweight = ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()

    # Act
    volume = set_volume(bodyweight, reps=10, body_weight_kg=70.0)

    # Assert — the body itself is the load: 10 × 70 kg
    assert volume == 700.0


def test_bodyweight_set_adds_the_extra_load_on_top_of_body_weight():
    # Arrange — five weighted pull-ups: 70 kg of body plus a 20 kg belt
    weighted = ParsedLoad(
        kind=LoadKind.BODYWEIGHT, text="bodyweight + 20 kg", added_kg=20.0
    ).to_dict()

    # Act
    volume = set_volume(weighted, reps=5, body_weight_kg=70.0)

    # Assert — each rep moves body + belt: 5 × (70 + 20)
    assert volume == 450.0


def test_bodyweight_set_is_excluded_when_body_weight_is_unknown():
    # Arrange — a bodyweight set logged by a user who never recorded their weight
    bodyweight = ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()

    # Act / Assert — no honest figure exists, so the set stays excluded (coverage),
    # never counted as zero
    assert set_volume(bodyweight, reps=10, body_weight_kg=None) is None


def test_percent_1rm_set_converts_against_the_estimated_1rm():
    # Arrange — three reps at 80% of a 100 kg Estimated 1RM
    percent = ParsedLoad(
        kind=LoadKind.PERCENT_1RM, text="80% 1RM", percent=80.0
    ).to_dict()

    # Act
    volume = set_volume(percent, reps=3, estimated_1rm=100.0)

    # Assert — 80% of 100 kg is 80 kg per rep: 3 × 80
    assert volume == 240.0


def test_percent_1rm_set_is_excluded_when_no_estimated_1rm_exists():
    # Arrange — a percentage set for an Exercise with no Estimated 1RM yet
    percent = ParsedLoad(
        kind=LoadKind.PERCENT_1RM, text="80% 1RM", percent=80.0
    ).to_dict()

    # Act / Assert — nothing to take a percentage of, so the set stays excluded
    assert set_volume(percent, reps=3, estimated_1rm=None) is None


def _bodyweight(added_kg: float | None = None) -> dict:
    text = "bodyweight" if added_kg is None else f"bodyweight + {added_kg:g} kg"
    return ParsedLoad(
        kind=LoadKind.BODYWEIGHT, text=text, added_kg=added_kg
    ).to_dict()


def _percent(pct: float) -> dict:
    return ParsedLoad(
        kind=LoadKind.PERCENT_1RM, text=f"{pct:g}% 1RM", percent=pct
    ).to_dict()


def _set(kg, reps, day):
    """A convertible absolute-load VolumeSet performed on ``day``."""

    return VolumeSet(reps=reps, load=_abs(kg), performed_on=day)


PULLUP = 3
SQUAT = 1


def test_volume_series_folds_in_bodyweight_and_percent_sets_with_context():
    # Arrange — a bodyweight set (10 pull-ups at 70 kg body = 700) and a percent set
    # (3 reps at 80% of Squat's 100 kg Estimated 1RM = 240), both today
    history = [
        VolumeSet(reps=10, load=_bodyweight(), performed_on=TODAY, exercise_id=PULLUP),
        VolumeSet(reps=3, load=_percent(80.0), performed_on=TODAY, exercise_id=SQUAT),
    ]

    # Act
    series = volume_series(
        history,
        days=7,
        today=TODAY,
        body_weight_kg=70.0,
        estimated_1rm_by_exercise={SQUAT: 100.0},
    )

    # Assert — both convert and sum into the day; every logged rep counted
    assert series.points == (VolumePoint(TODAY, 940.0),)
    assert series.coverage_pct == 100.0


def test_volume_series_excludes_unconvertible_sets_but_counts_them_in_coverage():
    # Arrange — an absolute set (convertible) alongside a bodyweight set with no body
    # weight and a percent set with no Estimated 1RM (both unconvertible), 5 reps each
    history = [
        _set(100.0, 5, TODAY),
        VolumeSet(reps=5, load=_bodyweight(), performed_on=TODAY, exercise_id=PULLUP),
        VolumeSet(reps=5, load=_percent(80.0), performed_on=TODAY, exercise_id=SQUAT),
    ]

    # Act — no body weight and no 1RM supplied, so only the absolute set converts
    series = volume_series(history, days=7, today=TODAY)

    # Assert — only the absolute volume points, but coverage sees all 15 reps: 5 / 15
    assert series.points == (VolumePoint(TODAY, 500.0),)
    assert series.coverage_pct == 5 / 15 * 100


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
