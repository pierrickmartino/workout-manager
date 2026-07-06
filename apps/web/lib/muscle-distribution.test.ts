import { test } from "node:test";
import assert from "node:assert/strict";

import { toMuscleBars } from "./muscle-distribution.ts";

// `toMuscleBars` turns the API's exact-float muscle shares into display rows: a
// rounded whole-percent label for the eye, plus the raw percentage as the bar
// fill width so the bars stay proportionally honest even when labels round.

test("rounds each share to a whole-percent label while keeping the raw width", () => {
  // Arrange — an exact-thirds split as the API returns it
  const bars = toMuscleBars([
    { group: "Chest", pct: 100 / 3 },
    { group: "Shoulders", pct: 100 / 3 },
    { group: "Arms", pct: 100 / 3 },
  ]);

  // Assert — labels round to 33%, widths preserve the exact float
  assert.deepEqual(
    bars.map((bar) => bar.label),
    ["33%", "33%", "33%"],
  );
  assert.equal(bars[0].width, 100 / 3);
});

test("preserves the incoming group order", () => {
  // Arrange — Legs before Core, as the read model orders them
  const bars = toMuscleBars([
    { group: "Legs", pct: 75 },
    { group: "Core", pct: 25 },
  ]);

  // Assert
  assert.deepEqual(
    bars.map((bar) => bar.group),
    ["Legs", "Core"],
  );
});

test("returns nothing for an empty distribution", () => {
  // Arrange / Act / Assert — the honest empty state
  assert.deepEqual(toMuscleBars([]), []);
});
