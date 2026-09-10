import { test } from "node:test";
import assert from "node:assert/strict";

import { summarizeCompletenessBreakdown } from "./catalog-completeness-breakdown-view.ts";

test("orders tiers strongest-first with counts and integer percents", () => {
  // Arrange — a 20-movement catalog: 10 enriched, 6 listable, 4 stub
  const view = summarizeCompletenessBreakdown({
    stub: 4,
    listable: 6,
    enriched: 10,
    total: 20,
  });

  // Assert — Enriched → Listable → Stub, each with its share of the catalog
  assert.deepEqual(
    view.tiers.map((t) => [t.key, t.count, t.percent]),
    [
      ["enriched", 10, 50],
      ["listable", 6, 30],
      ["stub", 4, 20],
    ],
  );
  assert.equal(view.total, 20);
  assert.equal(view.enrichedPercent, 50);
  assert.equal(view.isEmpty, false);
});

test("an empty catalog is flagged empty with zero percents, never NaN", () => {
  // Arrange / Act — no movements at all
  const view = summarizeCompletenessBreakdown({
    stub: 0,
    listable: 0,
    enriched: 0,
    total: 0,
  });

  // Assert — honest zeros and the empty flag; no divide-by-zero leaks through
  assert.equal(view.isEmpty, true);
  assert.equal(view.total, 0);
  assert.equal(view.enrichedPercent, 0);
  assert.ok(view.tiers.every((t) => t.count === 0 && t.percent === 0));
});

test("rounds each tier's percent independently", () => {
  // Arrange — thirds: 1 of each over a total of 3 rounds to 33 apiece
  const view = summarizeCompletenessBreakdown({
    stub: 1,
    listable: 1,
    enriched: 1,
    total: 3,
  });

  // Assert — each is Math.round(33.33) = 33; they need not sum to exactly 100
  assert.deepEqual(
    view.tiers.map((t) => t.percent),
    [33, 33, 33],
  );
});
