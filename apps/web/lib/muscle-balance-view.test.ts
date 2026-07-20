import { test } from "node:test";
import assert from "node:assert/strict";

import { toMuscleBalance } from "./muscle-balance-view.ts";
import type { WeeklyMuscleComposition } from "./strength-analytics-types.ts";

// `toMuscleBalance` turns the API's per-week composition series into stacked-bar rows:
// one row per week (canonical group order preserved, Unclassified last), each segment's
// exact percentage as its fill width plus a rounded label, an `isEmpty` flag for weeks
// with no training, and a screen-reader `ariaLabel` that names the split so the bars
// never rely on color alone. The view is empty only when no week has any training.

function week(
  weekIso: string,
  groups: WeeklyMuscleComposition["groups"],
): WeeklyMuscleComposition {
  return { week: weekIso, groups };
}

test("shapes a week into stacked segments with raw widths and rounded labels", () => {
  // Arrange — one week split two-thirds Legs, one-third Core
  const view = toMuscleBalance([
    week("2026-07-06", [
      { group: "Legs", pct: 200 / 3 },
      { group: "Core", pct: 100 / 3 },
    ]),
  ]);

  // Assert — the segment widths keep the exact float; the labels round
  const [row] = view.weeks;
  assert.equal(row.week, "2026-07-06");
  assert.deepEqual(
    row.segments.map((s) => s.group),
    ["Legs", "Core"],
  );
  assert.equal(row.segments[0].width, 200 / 3);
  assert.deepEqual(
    row.segments.map((s) => s.label),
    ["67%", "33%"],
  );
  assert.equal(row.isEmpty, false);
  assert.equal(view.isEmpty, false);
});

test("preserves the server's canonical group order (Unclassified last)", () => {
  // Arrange — the API already orders groups canonically, Unclassified trailing
  const view = toMuscleBalance([
    week("2026-07-06", [
      { group: "Legs", pct: 50 },
      { group: "Chest", pct: 30 },
      { group: "Unclassified", pct: 20 },
    ]),
  ]);

  // Assert — the row preserves that order rather than reshuffling
  assert.deepEqual(
    view.weeks[0].segments.map((s) => s.group),
    ["Legs", "Chest", "Unclassified"],
  );
});

test("labels a week's bar with its composition for screen readers", () => {
  // Arrange
  const view = toMuscleBalance([
    week("2026-07-06", [
      { group: "Legs", pct: 60 },
      { group: "Chest", pct: 40 },
    ]),
  ]);

  // Assert — the accessible label names the week and each share, not color alone
  assert.equal(
    view.weeks[0].ariaLabel,
    "Week of Jul 6: Legs 60%, Chest 40%",
  );
});

test("marks an untrained week as empty and labels it honestly", () => {
  // Arrange — a week with no training keeps its place in the series
  const view = toMuscleBalance([week("2026-07-06", [])]);

  // Assert — no segments, flagged empty, and a truthful screen-reader label
  const [row] = view.weeks;
  assert.deepEqual(row.segments, []);
  assert.equal(row.isEmpty, true);
  assert.equal(row.ariaLabel, "Week of Jul 6: no training logged");
});

test("formats the week label timezone-safely from the ISO Monday", () => {
  // Arrange — a date a local-offset Date constructor could shift back a day
  const view = toMuscleBalance([week("2026-01-01", [{ group: "Legs", pct: 100 }])]);

  // Assert — parsed from the string parts, so it is never off by a day
  assert.equal(view.weeks[0].weekLabel, "Jan 1");
});

test("keeps every week in order, including the empty ones between", () => {
  // Arrange — training, a gap week, then training
  const view = toMuscleBalance([
    week("2026-06-22", [{ group: "Chest", pct: 100 }]),
    week("2026-06-29", []),
    week("2026-07-06", [{ group: "Legs", pct: 100 }]),
  ]);

  // Assert — all three weeks appear, in order; the gap stays visible
  assert.deepEqual(
    view.weeks.map((w) => w.week),
    ["2026-06-22", "2026-06-29", "2026-07-06"],
  );
  assert.equal(view.weeks[1].isEmpty, true);
  assert.equal(view.isEmpty, false);
});

test("is empty only when no week has any training", () => {
  // Arrange — a full window where nothing was trained
  const view = toMuscleBalance([
    week("2026-06-29", []),
    week("2026-07-06", []),
  ]);

  // Assert — the section reads empty, though the weeks are still spanned
  assert.equal(view.isEmpty, true);
  assert.equal(view.weeks.length, 2);
});

test("returns an empty view for an empty series", () => {
  // Arrange / Act / Assert — the honest empty state
  const view = toMuscleBalance([]);
  assert.deepEqual(view.weeks, []);
  assert.equal(view.isEmpty, true);
});
