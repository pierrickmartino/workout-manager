import { test } from "node:test";
import assert from "node:assert/strict";

import { buildUsageMap, usageMarker } from "./exercise-usage-view.ts";

test("an absent last-performed date reads as NEW", () => {
  assert.deepEqual(usageMarker(null, "2026-08-10"), { trained: false, label: "NEW" });
  assert.deepEqual(usageMarker(undefined, "2026-08-10"), {
    trained: false,
    label: "NEW",
  });
});

test("recency buckets today / this week / last week / N weeks ago", () => {
  const ref = "2026-08-10";
  assert.deepEqual(usageMarker("2026-08-10", ref), { trained: true, label: "today" });
  assert.deepEqual(usageMarker("2026-08-06", ref), {
    trained: true,
    label: "this week",
  });
  assert.deepEqual(usageMarker("2026-08-01", ref), {
    trained: true,
    label: "last week",
  });
  // 28 days ago → 4 whole weeks
  assert.deepEqual(usageMarker("2026-07-13", ref), {
    trained: true,
    label: "4 wks ago",
  });
});

test("an unparseable date degrades to a bare trained marker, never a fabricated recency", () => {
  assert.deepEqual(usageMarker("not-a-date", "2026-08-10"), {
    trained: true,
    label: "trained",
  });
});

test("buildUsageMap indexes usage by exercise id", () => {
  const map = buildUsageMap([
    { exercise_id: 1, last_performed_on: "2026-08-01" },
    { exercise_id: 2, last_performed_on: "2026-07-01" },
  ]);
  assert.equal(map.get(1), "2026-08-01");
  assert.equal(map.get(2), "2026-07-01");
  assert.equal(map.get(3), undefined);
});
