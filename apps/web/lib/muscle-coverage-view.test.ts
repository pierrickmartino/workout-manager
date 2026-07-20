import { test } from "node:test";
import assert from "node:assert/strict";

import { toCoverageView } from "./muscle-coverage-view.ts";
import type { RecentCoverage } from "./analytics-types.ts";

// `toCoverageView` turns the API's six-group coverage read model into checklist rows for
// the Analytics screen: one row per real Muscle Group carrying its trained/not-trained
// state, a screen-reader label that never leans on color, a labeled window, and a
// section-level empty-state flag (issue #188 / ADR-0025). It is descriptive only — it
// names presence, it never flags or ranks — and it always renders all six groups ungated.

const SIX: RecentCoverage = {
  weeks: 8,
  groups: [
    { group: "Legs", covered: true },
    { group: "Chest", covered: false },
    { group: "Back", covered: true },
    { group: "Shoulders", covered: false },
    { group: "Arms", covered: false },
    { group: "Core", covered: true },
  ],
};

test("maps each group to a row with an icon-independent state label, in order", () => {
  // Act
  const view = toCoverageView(SIX);

  // Assert — one row per group, canonical order preserved, state carried as text
  assert.deepEqual(
    view.rows.map((row) => [row.group, row.covered, row.stateLabel]),
    [
      ["Legs", true, "Trained"],
      ["Chest", false, "Not trained"],
      ["Back", true, "Trained"],
      ["Shoulders", false, "Not trained"],
      ["Arms", false, "Not trained"],
      ["Core", true, "Trained"],
    ],
  );
});

test("gives each row a screen-reader label naming the group, state, and window", () => {
  // Act
  const view = toCoverageView(SIX);

  // Assert — the aria label conveys everything the icon alone cannot
  assert.equal(view.rows[0].ariaLabel, "Legs: trained in the last 8 weeks");
  assert.equal(view.rows[1].ariaLabel, "Chest: not trained in the last 8 weeks");
});

test("labels the window from the read model's week count", () => {
  // Act / Assert — the label is single-sourced from the API, not hardcoded
  assert.equal(toCoverageView(SIX).weeksLabel, "last 8 weeks");
});

test("is not empty when at least one group has been trained", () => {
  // Act / Assert — a partial history is a real checklist, not an empty state
  assert.equal(toCoverageView(SIX).isEmpty, false);
});

test("is empty when no group has been trained, to avoid six not-trained rows", () => {
  // Arrange — a user with no recent (or no mapped) history: every group not-trained
  const none: RecentCoverage = {
    weeks: 8,
    groups: SIX.groups.map((g) => ({ group: g.group, covered: false })),
  };

  // Act / Assert — the section shows a single teaching empty state instead
  const view = toCoverageView(none);
  assert.equal(view.isEmpty, true);
  assert.equal(view.rows.length, 6);
});
