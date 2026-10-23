import { test } from "node:test";
import assert from "node:assert/strict";

import { projectHistoryMonth, visibleHistory } from "./history-month.ts";
import type { HistoryFilters } from "./history-filter.ts";
import type { HistoryIndexRow } from "./logs-types.ts";

// `history-month` is the projection behind History's Month view (ADR-0138): a descriptive,
// read-time filter over the record's `performed_on` dates. It takes the History index (newest
// first, ADR-0128) and the filters, and returns the month on screen, the Logged Sessions in it
// that match the exercise / Training Type facets (AND), and the count or empty-state copy.

function row(
  id: number,
  performed_on: string,
  overrides: Partial<HistoryIndexRow> = {},
): HistoryIndexRow {
  return {
    id,
    performed_on,
    training_type: "strength",
    exercise_names: [],
    deletable: true,
    uncompletable: true,
    ...overrides,
  };
}

function monthView(overrides: Partial<HistoryFilters> = {}): HistoryFilters {
  return {
    exercise: null,
    trainingTypes: [],
    view: "month",
    month: null,
    ...overrides,
  };
}

test("Month view opens on the month of the newest Logged Session when the URL names none", () => {
  // Arrange: the index is newest first, as the API returns it
  const index = [row(3, "2026-04-02"), row(2, "2026-03-20"), row(1, "2026-03-05")];

  // Act
  const view = projectHistoryMonth(index, monthView());

  // Assert
  assert.equal(view.month, "2026-04");
  assert.deepEqual(view.visible.map((r) => r.id), [3]);
});

test("Month view opens on the newest matching Logged Session's month, not the newest overall", () => {
  // Arrange: the newest record is yoga, the newest strength one is a month older
  const index = [
    row(3, "2026-04-02", { training_type: "yoga" }),
    row(2, "2026-03-20"),
    row(1, "2026-02-05"),
  ];

  // Act
  const view = projectHistoryMonth(index, monthView({ trainingTypes: ["strength"] }));

  // Assert
  assert.equal(view.month, "2026-03");
  assert.deepEqual(view.visible.map((r) => r.id), [2]);
});

test("Month view shows the month the URL names, not the newest one", () => {
  // Arrange
  const index = [row(3, "2026-04-02"), row(2, "2026-03-20"), row(1, "2026-02-05")];

  // Act
  const view = projectHistoryMonth(index, monthView({ month: "2026-02" }));

  // Assert
  assert.equal(view.month, "2026-02");
  assert.deepEqual(view.visible.map((r) => r.id), [1]);
});

test("Month view opens on the newest record's month when nothing matches the filters", () => {
  // Arrange: no yoga anywhere in the record
  const index = [row(2, "2026-04-02"), row(1, "2026-03-20")];

  // Act
  const view = projectHistoryMonth(index, monthView({ trainingTypes: ["yoga"] }));

  // Assert: the screen still names a month, and it is empty
  assert.equal(view.month, "2026-04");
  assert.deepEqual(view.visible, []);
});

test("Month view lists every Logged Session in the month matching the exercise filter, newest first", () => {
  // Arrange: two squat sessions on one day, one without squat, one squat in the next month
  // and one in the previous month
  const squat = { exercise_names: ["Back Squat"] };
  const index = [
    row(6, "2026-04-01", squat),
    row(5, "2026-03-31", squat),
    row(4, "2026-03-14", squat),
    row(3, "2026-03-14", squat),
    row(2, "2026-03-10", { exercise_names: ["Bench Press"] }),
    row(1, "2026-02-28", squat),
  ];

  // Act
  const view = projectHistoryMonth(
    index,
    monthView({ exercise: "Back Squat", month: "2026-03" }),
  );

  // Assert: the facet and the month both apply (AND), in the index's newest-first order
  assert.deepEqual(view.visible.map((r) => r.id), [5, 4, 3]);
});

test("Month view names the month and counts its matches", () => {
  // Arrange
  const index = [row(3, "2026-03-20"), row(2, "2026-03-05"), row(1, "2026-02-05")];

  // Act
  const view = projectHistoryMonth(index, monthView({ month: "2026-03" }));

  // Assert
  assert.equal(view.heading, "March 2026");
  assert.equal(view.summary, "2 in March 2026");
});

test("Month view with no match in its month says so, without calling the days missed", () => {
  // Arrange: a month inside the record that holds nothing
  const index = [row(2, "2026-04-02"), row(1, "2026-02-05")];

  // Act
  const view = projectHistoryMonth(index, monthView({ month: "2026-03" }));

  // Assert
  assert.deepEqual(view.visible, []);
  assert.equal(view.heading, "March 2026");
  assert.equal(view.summary, "No matching sessions in March 2026");
});

test("visibleHistory is the month's matches in Month view and every match in the List", () => {
  // Arrange
  const index = [
    row(3, "2026-04-02"),
    row(2, "2026-03-20", { training_type: "yoga" }),
    row(1, "2026-03-05"),
  ];
  const facets = { exercise: null, trainingTypes: ["strength"] };

  // Act
  const list = visibleHistory(index, { ...facets, view: "list", month: null });
  const month = visibleHistory(index, { ...facets, view: "month", month: "2026-03" });

  // Assert
  assert.deepEqual(list.map((r) => r.id), [3, 1]);
  assert.deepEqual(month.map((r) => r.id), [1]);
});

test("Month view of an empty record names no month", () => {
  const view = projectHistoryMonth([], monthView());

  assert.equal(view.month, null);
  assert.deepEqual(view.visible, []);
});
