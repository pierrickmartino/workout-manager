import { test } from "node:test";
import assert from "node:assert/strict";

import { RANGE_LABELS, toRangeOptions } from "./analytics-range-view.ts";

// `analytics-range-view` projects the served window and the backend's available-ranges
// set (History Depth gating, ADR-0056) onto the fixed 30D/90D/150D selector order: each
// entry carries its label, whether it is active, whether it is available, and — when
// locked — the hint naming the History Depth that unlocks it. Pure and server-free, like
// the other analytics view helpers.

test("offers only the floor window for a shallow history, hinting the rest", () => {
  // Arrange — a history under 30 days deep: the backend offers only 30d
  // Act
  const options = toRangeOptions("30d", ["30d"]);

  // Assert — 30d active and available; 90d/150d locked with an unlock hint naming
  // the History Depth each needs
  assert.deepEqual(options, [
    { range: "30d", label: "30D", active: true, available: true, hint: null },
    {
      range: "90d",
      label: "90D",
      active: false,
      available: false,
      // Strict unlock: 90D needs depth *past* 30 days, so the smallest depth that
      // actually unlocks it is 31 — not the "30+" a user would otherwise read literally.
      hint: "Log 31+ days of history to unlock 90D",
    },
    {
      range: "150d",
      label: "150D",
      active: false,
      available: false,
      hint: "Log 91+ days of history to unlock 150D",
    },
  ]);
});

test("unlocks the 90D window once history is deep enough, keeping 150D locked", () => {
  // Arrange / Act — history past 30 days but not past 90, served on the 90D window
  const options = toRangeOptions("90d", ["30d", "90d"]);

  // Assert — 90d now available and active; 150d still locked with its hint
  assert.deepEqual(
    options.map((o) => ({ range: o.range, available: o.available, active: o.active })),
    [
      { range: "30d", available: true, active: false },
      { range: "90d", available: true, active: true },
      { range: "150d", available: false, active: false },
    ],
  );
  assert.equal(options[2].hint, "Log 91+ days of history to unlock 150D");
});

test("offers every window for a deep history, with no hints", () => {
  // Arrange / Act
  const options = toRangeOptions("30d", ["30d", "90d", "150d"]);

  // Assert — all three available, none carry an unlock hint
  assert.ok(options.every((o) => o.available));
  assert.ok(options.every((o) => o.hint === null));
});

test("marks exactly the served window active", () => {
  // Arrange / Act
  const options = toRangeOptions("150d", ["30d", "90d", "150d"]);

  // Assert — only 150d is active
  assert.deepEqual(
    options.filter((o) => o.active).map((o) => o.range),
    ["150d"],
  );
});

test("exposes the shared window labels", () => {
  assert.deepEqual(RANGE_LABELS, { "30d": "30D", "90d": "90D", "150d": "150D" });
});
