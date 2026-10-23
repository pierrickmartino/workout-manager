import { test } from "node:test";
import assert from "node:assert/strict";

import {
  pinVisibleMonth,
  projectHistoryMonth,
  visibleHistory,
} from "./history-month.ts";
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

test("Month view's navigation bounds run from the first record's month to the newest, over the whole index", () => {
  // Arrange: the yoga filter matches only the middle month, but the record spans four
  const index = [
    row(3, "2026-04-02"),
    row(2, "2026-03-20", { training_type: "yoga" }),
    row(1, "2026-01-05"),
  ];

  // Act
  const view = projectHistoryMonth(index, monthView({ trainingTypes: ["yoga"] }));

  // Assert: a filter never shrinks the reachable range
  assert.deepEqual(view.bounds, { first: "2026-01", newest: "2026-04" });
});

test("Month view's arrows step one month either way, across a year end, named by the month they go to", () => {
  // Arrange: the record runs from November 2025 to March 2026
  const index = [row(2, "2026-03-02"), row(1, "2025-11-20")];

  // Act
  const view = projectHistoryMonth(index, monthView({ month: "2026-01" }));

  // Assert
  assert.deepEqual(view.previous, {
    month: "2025-12",
    label: "Previous month, December 2025",
  });
  assert.deepEqual(view.next, {
    month: "2026-02",
    label: "Next month, February 2026",
  });
});

test("Month view's arrows lead nowhere at the first and newest record months", () => {
  // Arrange
  const index = [row(2, "2026-03-02"), row(1, "2026-02-20")];

  // Act
  const atNewest = projectHistoryMonth(index, monthView({ month: "2026-03" }));
  const atFirst = projectHistoryMonth(index, monthView({ month: "2026-02" }));

  // Assert: the arrow at each end is disabled, and still names its direction
  assert.deepEqual(atNewest.next, { month: null, label: "Next month" });
  assert.equal(atNewest.previous.month, "2026-02");
  assert.deepEqual(atFirst.previous, { month: null, label: "Previous month" });
  assert.equal(atFirst.next.month, "2026-03");
});

test("Month view ignores a URL month outside the record and opens on the newest matching month", () => {
  // Arrange: the record runs from February to April 2026
  const index = [row(3, "2026-04-02"), row(2, "2026-03-20"), row(1, "2026-02-05")];

  // Act
  const tooOld = projectHistoryMonth(index, monthView({ month: "2025-12" }));
  const tooNew = projectHistoryMonth(index, monthView({ month: "2026-09" }));

  // Assert: never rendered out of range
  assert.equal(tooOld.month, "2026-04");
  assert.equal(tooNew.month, "2026-04");
  assert.deepEqual(tooNew.visible.map((r) => r.id), [3]);
});

test("Month view shows an empty month inside the record rather than skipping it", () => {
  // Arrange: nothing logged in March, between February and April
  const index = [row(2, "2026-04-02"), row(1, "2026-02-05")];

  // Act: step back from April
  const april = projectHistoryMonth(index, monthView({ month: "2026-04" }));
  const march = projectHistoryMonth(index, monthView({ month: april.previous.month }));

  // Assert
  assert.equal(april.previous.month, "2026-03");
  assert.equal(march.month, "2026-03");
  assert.equal(march.summary, "No matching sessions in March 2026");
  assert.equal(march.previous.month, "2026-02");
});

test("A filter change that empties the visible month keeps Month view on that month", () => {
  // Arrange: Month view opened with no month in the URL lands on April; yoga is only in March
  const index = [
    row(3, "2026-04-02"),
    row(2, "2026-03-20", { training_type: "yoga" }),
    row(1, "2026-02-05"),
  ];
  const opened = monthView();

  // Act: pin the month on screen, then narrow to yoga
  const pinned = pinVisibleMonth(index, opened);
  const view = projectHistoryMonth(index, { ...pinned, trainingTypes: ["yoga"] });

  // Assert: the screen does not jump to March
  assert.equal(pinned.month, "2026-04");
  assert.equal(view.month, "2026-04");
  assert.deepEqual(view.visible, []);
  assert.equal(view.summary, "No matching sessions in April 2026");
});

test("Pinning replaces an out-of-range URL month with the month actually on screen", () => {
  // Arrange
  const index = [row(2, "2026-04-02"), row(1, "2026-03-20")];

  // Act
  const pinned = pinVisibleMonth(index, monthView({ month: "2030-01" }));

  // Assert
  assert.equal(pinned.month, "2026-04");
});

test("Pinning leaves the List untouched: it has no month", () => {
  // Arrange
  const index = [row(1, "2026-04-02")];
  const list = monthView({ view: "list" });

  // Act
  const pinned = pinVisibleMonth(index, list);

  // Assert
  assert.deepEqual(pinned, list);
});
