"""The Training Heatmap domain (#378, ADR-0054) — a descriptive daily projection.

``project_heatmap`` turns each Logged Session's performed date and its attempted-set
count, plus a reference ``today``, into an immutable trailing ~53-week grid of dated,
shaded cells. It is deliberately and strictly *descriptive* record texture: it derives
**no** daily run and **no** daily streak — the weekly Streak stays the sole
consecutiveness metric (hard boundary, ADR-0054/ADR-0001).

Columns are Monday-aligned via ``domain/week.week_start`` and shade levels come from
**fixed** module-constant thresholds, so a past day's cell never recolours when a bigger
day is logged later. These tests feed constructed ``(date, set_count)`` pairs and assert
the projected grid, never reaching into the window-bucketing internals."""

from __future__ import annotations

from dataclasses import fields
from datetime import date, timedelta

from app.domain.heatmap import (
    WINDOW_WEEKS,
    Heatmap,
    HeatmapCell,
    project_heatmap,
    shade_level,
)
from app.domain.week import week_start

# A Wednesday; its ISO week runs Mon 2026-07-06 .. Sun 2026-07-12.
TODAY = date(2026, 7, 8)
CELLS_IN_WINDOW = WINDOW_WEEKS * 7


def _cells_by_date(heatmap: Heatmap) -> dict[date, HeatmapCell]:
    return {cell.date: cell for cell in heatmap.cells}


def test_projects_a_full_stable_width_53_week_grid():
    # Arrange — an empty history still renders the full frame
    # Act
    heatmap = project_heatmap([], TODAY)

    # Assert — one cell per day over the whole trailing window
    assert len(heatmap.cells) == CELLS_IN_WINDOW


def test_columns_are_monday_aligned_and_window_ends_at_this_week():
    # Arrange / Act
    heatmap = project_heatmap([], TODAY)
    by_column: dict[int, list[HeatmapCell]] = {}
    for cell in heatmap.cells:
        by_column.setdefault(cell.column, []).append(cell)

    # Assert — every column's row-0 cell is a Monday, and the last column is this week's
    first_of_each_column = {col: min(c.date for c in cells) for col, cells in by_column.items()}
    for monday in first_of_each_column.values():
        assert week_start(monday) == monday
    assert first_of_each_column[WINDOW_WEEKS - 1] == week_start(TODAY)
    # Row 0 is Monday, row 6 is Sunday.
    for cells in by_column.values():
        rows = {cell.row: cell for cell in cells}
        assert rows[0].date.weekday() == 0
        assert rows[6].date.weekday() == 6


def test_cells_are_ordered_and_immutable():
    # Arrange / Act
    heatmap = project_heatmap([], TODAY)

    # Assert — ascending by date, and the DTOs are frozen dataclasses
    dates = [cell.date for cell in heatmap.cells]
    assert dates == sorted(dates)
    assert all(field.name for field in fields(HeatmapCell))
    first = heatmap.cells[0]
    try:
        first.level = 4  # type: ignore[misc]
    except Exception:  # frozen dataclass raises on mutation
        pass
    else:  # pragma: no cover - guards against a mutable DTO regressing
        raise AssertionError("HeatmapCell must be immutable")


def test_a_day_is_shaded_by_its_attempted_set_count_on_fixed_thresholds():
    # Arrange — one session of eight sets this week (bucket 6–12 -> level 2)
    performed = week_start(TODAY)
    # Act
    heatmap = project_heatmap([(performed, 8)], TODAY)
    cell = _cells_by_date(heatmap)[performed]

    # Assert
    assert cell.session_count == 1
    assert cell.set_count == 8
    assert cell.level == 2


def test_shade_level_is_a_pure_function_of_the_bucket_thresholds():
    # Arrange / Act / Assert — the four placeholder buckets 1–5 / 6–12 / 13–20 / 21+
    assert shade_level(0) == 0
    assert shade_level(1) == 1
    assert shade_level(5) == 1
    assert shade_level(6) == 2
    assert shade_level(12) == 2
    assert shade_level(13) == 3
    assert shade_level(20) == 3
    assert shade_level(21) == 4
    assert shade_level(999) == 4


def test_a_later_larger_day_never_recolours_an_earlier_day():
    # Arrange — a small early day (level 1) and, later, a huge day
    early = week_start(TODAY) - timedelta(weeks=3)
    later = week_start(TODAY)
    small_only = project_heatmap([(early, 2)], TODAY)
    with_a_big_later_day = project_heatmap([(early, 2), (later, 40)], TODAY)

    # Act
    early_before = _cells_by_date(small_only)[early]
    early_after = _cells_by_date(with_a_big_later_day)[early]

    # Assert — fixed (not per-user relative) thresholds: the early cell is unchanged
    assert early_before.level == 1
    assert early_after.level == 1
    assert early_after.set_count == 2


def test_multiple_sessions_on_one_day_sum_their_attempted_sets():
    # Arrange — two Logged Sessions the same day, plan-backed and plan-less counting alike
    day = week_start(TODAY)
    # Act — 4 + 5 = 9 sets across two sessions -> bucket 6–12 -> level 2
    heatmap = project_heatmap([(day, 4), (day, 5)], TODAY)
    cell = _cells_by_date(heatmap)[day]

    # Assert
    assert cell.session_count == 2
    assert cell.set_count == 9
    assert cell.level == 2


def test_a_session_with_zero_sets_still_marks_the_day_trained():
    # Arrange — an Incomplete session that logged no sets still counts as a trained day
    day = week_start(TODAY)
    # Act
    heatmap = project_heatmap([(day, 0)], TODAY)
    cell = _cells_by_date(heatmap)[day]

    # Assert — the day is trained (a session exists) but shades neutral (no sets)
    assert cell.session_count == 1
    assert cell.set_count == 0
    assert cell.level == 0


def test_empty_history_projects_to_an_all_neutral_frame():
    # Arrange / Act
    heatmap = project_heatmap([], TODAY)

    # Assert — full width, every cell neutral and empty, never an error
    assert len(heatmap.cells) == CELLS_IN_WINDOW
    assert all(cell.level == 0 for cell in heatmap.cells)
    assert all(cell.session_count == 0 and cell.set_count == 0 for cell in heatmap.cells)


def test_under_a_year_of_history_renders_the_full_frame_with_neutral_pre_history():
    # Arrange — a single recent session; the pre-history is neutral, the frame full-width
    day = week_start(TODAY)
    # Act
    heatmap = project_heatmap([(day, 3)], TODAY)

    # Assert — stable full width; exactly the one dated cell is non-neutral
    assert len(heatmap.cells) == CELLS_IN_WINDOW
    non_neutral = [cell for cell in heatmap.cells if cell.level > 0]
    assert len(non_neutral) == 1
    assert non_neutral[0].date == day


def test_a_session_older_than_the_window_is_ignored_without_error():
    # Arrange — a session from well before the trailing window
    ancient = week_start(TODAY) - timedelta(weeks=WINDOW_WEEKS + 5)
    # Act
    heatmap = project_heatmap([(ancient, 30)], TODAY)

    # Assert — it simply falls outside the frame; the grid is untouched and all-neutral
    assert len(heatmap.cells) == CELLS_IN_WINDOW
    assert all(cell.level == 0 for cell in heatmap.cells)


def test_the_scale_exposes_the_fixed_bucket_thresholds_for_the_legend():
    # Arrange / Act
    heatmap = project_heatmap([], TODAY)

    # Assert — neutral level 0 plus the four non-zero buckets, ascending by min_sets
    scale = heatmap.scale
    assert [bucket.level for bucket in scale] == [0, 1, 2, 3, 4]
    assert [bucket.min_sets for bucket in scale] == [0, 1, 6, 13, 21]


def test_the_contract_exposes_no_daily_run_or_daily_streak_field():
    # Arrange / Act
    heatmap = project_heatmap([(week_start(TODAY), 5)], TODAY)

    # Assert — the projection emits ONLY per-cell facts and the legend scale; the weekly
    # Streak stays the sole consecutiveness metric (ADR-0054/ADR-0001).
    assert {field.name for field in fields(Heatmap)} == {"cells", "scale"}
    forbidden = ("daily_run", "current_daily_run", "longest_daily_run", "daily_streak")
    for name in forbidden:
        assert not hasattr(heatmap, name)
    cell_fields = {field.name for field in fields(HeatmapCell)}
    assert cell_fields == {"date", "column", "row", "session_count", "set_count", "level"}
