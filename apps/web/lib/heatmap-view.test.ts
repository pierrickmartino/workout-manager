import { test } from "node:test";
import assert from "node:assert/strict";

import { toHeatmapGrid } from "./heatmap-view.ts";
import type { HeatmapCell, TrainingHeatmap } from "./heatmap-types.ts";

// `heatmap-view` maps the API's ordered cell list into the column×row matrix the
// Training Heatmap component renders — columns left-to-right, each column's seven cells
// top-to-bottom (Monday..Sunday) — plus the legend steps read straight off the fixed
// scale. Pure and server-free, like the other view helpers.

const SCALE = [
  { level: 0, min_sets: 0 },
  { level: 1, min_sets: 1 },
  { level: 2, min_sets: 6 },
  { level: 3, min_sets: 13 },
  { level: 4, min_sets: 21 },
];

// Build a small two-column frame (14 cells) with a couple of shaded days, in the same
// ascending-by-date order the backend emits.
function twoColumnPayload(): TrainingHeatmap {
  const cells: HeatmapCell[] = [];
  for (let column = 0; column < 2; column += 1) {
    for (let row = 0; row < 7; row += 1) {
      const isShaded = column === 0 && row === 2;
      const isBig = column === 1 && row === 5;
      cells.push({
        date: `2026-07-${String(column * 7 + row + 1).padStart(2, "0")}`,
        column,
        row,
        session_count: isShaded || isBig ? 1 : 0,
        set_count: isShaded ? 3 : isBig ? 25 : 0,
        level: isShaded ? 1 : isBig ? 4 : 0,
      });
    }
  }
  return { cells, scale: SCALE };
}

test("maps cells into ordered columns of seven weekday rows", () => {
  // Arrange
  const payload = twoColumnPayload();

  // Act
  const grid = toHeatmapGrid(payload);

  // Assert — two columns, each seven rows, ordered Monday..Sunday
  assert.equal(grid.columns.length, 2);
  assert.deepEqual(
    grid.columns.map((c) => c.column),
    [0, 1],
  );
  for (const column of grid.columns) {
    assert.equal(column.cells.length, 7);
  }
});

test("carries each cell's shade level onto the matrix", () => {
  // Arrange / Act
  const grid = toHeatmapGrid(twoColumnPayload());

  // Assert — the shaded and neutral cells land at the right positions
  assert.equal(grid.columns[0].cells[2].level, 1);
  assert.equal(grid.columns[1].cells[5].level, 4);
  assert.equal(grid.columns[0].cells[0].level, 0);
  assert.equal(grid.columns[0].cells[2].date, "2026-07-03");
});

test("reads the legend steps straight off the fixed scale, ascending", () => {
  // Arrange / Act
  const grid = toHeatmapGrid(twoColumnPayload());

  // Assert — neutral level 0 plus the four buckets, so the component never hardcodes them
  assert.deepEqual(grid.legend, [
    { level: 0, minSets: 0 },
    { level: 1, minSets: 1 },
    { level: 2, minSets: 6 },
    { level: 3, minSets: 13 },
    { level: 4, minSets: 21 },
  ]);
});

test("an empty payload maps to an all-neutral grid, never throwing", () => {
  // Arrange — a brand-new user: a full frame of neutral cells (here, one column)
  const cells: HeatmapCell[] = Array.from({ length: 7 }, (_, row) => ({
    date: `2026-07-${String(row + 1).padStart(2, "0")}`,
    column: 0,
    row,
    session_count: 0,
    set_count: 0,
    level: 0,
  }));

  // Act
  const grid = toHeatmapGrid({ cells, scale: SCALE });

  // Assert — the frame renders, every cell neutral
  assert.equal(grid.columns.length, 1);
  assert.ok(
    grid.columns[0].cells.every((cell) => cell.level === 0),
    "every cell is neutral",
  );
});

test("no cells at all yields an empty grid rather than throwing", () => {
  // Arrange / Act — defends the mapper against a degenerate payload
  const grid = toHeatmapGrid({ cells: [], scale: SCALE });

  // Assert
  assert.deepEqual(grid.columns, []);
  assert.equal(grid.legend.length, 5);
});

// Build a single-cell payload so the per-cell label is easy to assert in isolation.
function oneCell(overrides: Partial<HeatmapCell>): TrainingHeatmap {
  const cell: HeatmapCell = {
    date: "2026-03-04",
    column: 0,
    row: 0,
    session_count: 0,
    set_count: 0,
    level: 0,
    ...overrides,
  };
  return { cells: [cell], scale: SCALE };
}

test("a populated cell reads date · session count · set count", () => {
  // Arrange / Act
  const grid = toHeatmapGrid(oneCell({ session_count: 2, set_count: 14, level: 3 }));

  // Assert — the exact fact wording, plural sessions and sets
  assert.equal(grid.columns[0].cells[0].label, "Mar 4 · 2 sessions · 14 sets");
});

test("an empty cell reads a neutral 'no training logged' fact", () => {
  // Arrange / Act — no session, no set
  const grid = toHeatmapGrid(oneCell({ session_count: 0, set_count: 0, level: 0 }));

  // Assert — plainly neutral, never "missed" or a streak phrase
  assert.equal(grid.columns[0].cells[0].label, "Mar 4 · no training logged");
});

test("a single session and single set are labelled in the singular", () => {
  // Arrange / Act
  const grid = toHeatmapGrid(oneCell({ session_count: 1, set_count: 1, level: 1 }));

  // Assert — "1 session", "1 set", not "1 sessions"/"1 sets"
  assert.equal(grid.columns[0].cells[0].label, "Mar 4 · 1 session · 1 set");
});

test("counts above one are labelled in the plural", () => {
  // Arrange / Act
  const grid = toHeatmapGrid(oneCell({ session_count: 3, set_count: 21, level: 4 }));

  // Assert
  assert.equal(grid.columns[0].cells[0].label, "Mar 4 · 3 sessions · 21 sets");
});

test("the cell label never carries a streak / 'in a row' phrase", () => {
  // Arrange / Act — the descriptive-only boundary (ADR-0054) at the label layer
  const grid = toHeatmapGrid(oneCell({ session_count: 2, set_count: 8, level: 2 }));

  // Assert
  const { label } = grid.columns[0].cells[0];
  assert.doesNotMatch(label, /streak|in a row|day(s)? in a row|chain|missed/i);
});
