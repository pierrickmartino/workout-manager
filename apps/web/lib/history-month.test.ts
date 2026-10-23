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
    day: null,
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
  const list = visibleHistory(index, { ...facets, view: "list", month: null, day: null });
  const month = visibleHistory(index, { ...facets, view: "month", month: "2026-03", day: null });

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

// --- the day grid (#760): Monday weeks, presence counts, day selection ---------

// The grid as day numbers, padding cells as null, one array per Monday-first week.
function layout(view: ReturnType<typeof projectHistoryMonth>): (number | null)[][] {
  return view.weeks.map((week) =>
    week.map((cell) => (cell === null ? null : Number(cell.date.slice(8)))),
  );
}

test("The grid starts its weeks on Monday for a month whose 1st is a Sunday", () => {
  // Arrange: 1 February 2026 is a Sunday; 28 days
  const index = [row(1, "2026-02-10")];

  // Act
  const view = projectHistoryMonth(index, monthView({ month: "2026-02" }));

  // Assert
  assert.deepEqual(layout(view), [
    [null, null, null, null, null, null, 1],
    [2, 3, 4, 5, 6, 7, 8],
    [9, 10, 11, 12, 13, 14, 15],
    [16, 17, 18, 19, 20, 21, 22],
    [23, 24, 25, 26, 27, 28, null],
  ]);
});

test("A non-leap February that starts on a Monday fills exactly four weeks", () => {
  // Arrange: 1 February 2027 is a Monday
  const index = [row(1, "2027-02-10")];

  // Act
  const view = projectHistoryMonth(index, monthView({ month: "2027-02" }));

  // Assert
  assert.deepEqual(layout(view), [
    [1, 2, 3, 4, 5, 6, 7],
    [8, 9, 10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19, 20, 21],
    [22, 23, 24, 25, 26, 27, 28],
  ]);
});

test("A leap February carries its 29th day", () => {
  // Arrange: 1 February 2028 is a Tuesday
  const index = [row(1, "2028-02-10")];

  // Act
  const view = projectHistoryMonth(index, monthView({ month: "2028-02" }));

  // Assert
  assert.deepEqual(layout(view), [
    [null, 1, 2, 3, 4, 5, 6],
    [7, 8, 9, 10, 11, 12, 13],
    [14, 15, 16, 17, 18, 19, 20],
    [21, 22, 23, 24, 25, 26, 27],
    [28, 29, null, null, null, null, null],
  ]);
});

test("A 31-day month starting on a Saturday spans six weeks", () => {
  // Arrange: 1 August 2026 is a Saturday
  const index = [row(1, "2026-08-10")];

  // Act
  const view = projectHistoryMonth(index, monthView({ month: "2026-08" }));

  // Assert
  const weeks = layout(view);
  assert.equal(weeks.length, 6);
  assert.deepEqual(weeks[0], [null, null, null, null, null, 1, 2]);
  assert.deepEqual(weeks[5], [31, null, null, null, null, null, null]);
});

// The in-month day cell for a `YYYY-MM-DD` date.
function cell(view: ReturnType<typeof projectHistoryMonth>, date: string) {
  const found = view.weeks.flat().find((c) => c?.date === date);
  assert.ok(found, date);
  return found;
}

test("Each day counts only the Logged Sessions matching the exercise and type filters", () => {
  // Arrange: two strength sessions and one yoga session on 14 October, one yoga on the 15th
  const index = [
    row(4, "2026-10-15", { training_type: "yoga" }),
    row(3, "2026-10-14", { training_type: "yoga" }),
    row(2, "2026-10-14"),
    row(1, "2026-10-14"),
  ];

  // Act
  const view = projectHistoryMonth(
    index,
    monthView({ month: "2026-10", trainingTypes: ["strength"] }),
  );

  // Assert: the yoga sessions leave no trace, so the 15th is neutral
  assert.equal(cell(view, "2026-10-14").count, 2);
  assert.equal(cell(view, "2026-10-15").count, 0);
  assert.equal(cell(view, "2026-10-16").count, 0);
});

test("Each day is named by its full date and how many sessions it holds", () => {
  // Arrange
  const index = [row(3, "2026-10-15"), row(2, "2026-10-14"), row(1, "2026-10-14")];

  // Act
  const view = projectHistoryMonth(index, monthView({ month: "2026-10" }));

  // Assert
  assert.equal(cell(view, "2026-10-14").label, "14 October 2026, 2 sessions");
  assert.equal(cell(view, "2026-10-15").label, "15 October 2026, 1 session");
  assert.equal(cell(view, "2026-10-01").label, "1 October 2026, no sessions");
});

test("Selecting a day narrows the list to every matching Logged Session that day, newest first", () => {
  // Arrange: two sessions on 14 March, one on the 20th, and a yoga one on the 14th
  const index = [
    row(4, "2026-03-20"),
    row(3, "2026-03-14", { training_type: "yoga" }),
    row(2, "2026-03-14"),
    row(1, "2026-03-14"),
  ];

  // Act
  const view = projectHistoryMonth(
    index,
    monthView({ month: "2026-03", day: "2026-03-14", trainingTypes: ["strength"] }),
  );

  // Assert
  assert.equal(view.day, "2026-03-14");
  assert.deepEqual(view.visible.map((r) => r.id), [2, 1]);
  assert.equal(view.summary, "2 on 14 Mar 2026");
  assert.equal(cell(view, "2026-03-14").selected, true);
  assert.equal(cell(view, "2026-03-20").selected, false);
});

test("A selected day with no matching Logged Session shows the day's empty state", () => {
  // Arrange
  const index = [row(1, "2026-03-20")];

  // Act
  const view = projectHistoryMonth(
    index,
    monthView({ month: "2026-03", day: "2026-03-14" }),
  );

  // Assert
  assert.deepEqual(view.visible, []);
  assert.equal(view.summary, "No matching sessions on 14 Mar 2026");
});

test("Tapping a day selects it, and tapping the selected day again clears it", () => {
  // Arrange
  const index = [row(2, "2026-03-20"), row(1, "2026-03-14")];

  // Act
  const none = projectHistoryMonth(index, monthView({ month: "2026-03" }));
  const selected = projectHistoryMonth(
    index,
    monthView({ month: "2026-03", day: "2026-03-14" }),
  );

  // Assert: `toggleTo` is the day a tap leaves selected
  assert.equal(cell(none, "2026-03-14").toggleTo, "2026-03-14");
  assert.equal(cell(selected, "2026-03-14").toggleTo, null);
  assert.equal(cell(selected, "2026-03-20").toggleTo, "2026-03-20");
});

test("A selected day offers to show all of its month again", () => {
  // Arrange
  const index = [row(1, "2026-03-14")];

  // Act
  const none = projectHistoryMonth(index, monthView({ month: "2026-03" }));
  const selected = projectHistoryMonth(
    index,
    monthView({ month: "2026-03", day: "2026-03-14" }),
  );

  // Assert
  assert.equal(none.showAll, null);
  assert.equal(selected.showAll, "Show all of March 2026");
});

test("A day outside the month on screen is not selected", () => {
  // Arrange: the URL month is out of the record, so the view falls back to April
  const index = [row(2, "2026-04-02"), row(1, "2026-03-20")];

  // Act
  const view = projectHistoryMonth(
    index,
    monthView({ month: "2030-01", day: "2030-01-05" }),
  );
  const pinned = pinVisibleMonth(index, monthView({ month: "2030-01", day: "2030-01-05" }));

  // Assert
  assert.equal(view.month, "2026-04");
  assert.equal(view.day, null);
  assert.deepEqual(view.visible.map((r) => r.id), [2]);
  assert.equal(pinned.day, null);
});

test("A filter change keeps the selected day", () => {
  // Arrange
  const index = [row(2, "2026-03-14", { training_type: "yoga" }), row(1, "2026-03-14")];
  const filters = monthView({ month: "2026-03", day: "2026-03-14" });

  // Act
  const pinned = pinVisibleMonth(index, filters);
  const view = projectHistoryMonth(index, { ...pinned, trainingTypes: ["yoga"] });

  // Assert
  assert.equal(pinned.day, "2026-03-14");
  assert.deepEqual(view.visible.map((r) => r.id), [2]);
});

test("visibleHistory gives the selected day's matches, as the page's first window needs", () => {
  // Arrange
  const index = [row(3, "2026-03-20"), row(2, "2026-03-14"), row(1, "2026-03-02")];

  // Act
  const visible = visibleHistory(index, monthView({ month: "2026-03", day: "2026-03-14" }));

  // Assert
  assert.deepEqual(visible.map((r) => r.id), [2]);
});
