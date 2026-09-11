import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildUsageMap,
  usageBadgeText,
  usageMarker,
} from "./exercise-usage-view.ts";

test("an absent last-performed date reads as NEW with no recency", () => {
  assert.deepEqual(usageMarker(null, "2026-08-10"), {
    trained: false,
    recency: null,
  });
  assert.deepEqual(usageMarker(undefined, "2026-08-10"), {
    trained: false,
    recency: null,
  });
});

test("recency buckets today / this week / last week / N weeks ago", () => {
  const ref = "2026-08-10";
  assert.deepEqual(usageMarker("2026-08-10", ref), {
    trained: true,
    recency: "today",
  });
  assert.deepEqual(usageMarker("2026-08-06", ref), {
    trained: true,
    recency: "this week",
  });
  assert.deepEqual(usageMarker("2026-08-01", ref), {
    trained: true,
    recency: "last week",
  });
  // 28 days ago → 4 whole weeks
  assert.deepEqual(usageMarker("2026-07-13", ref), {
    trained: true,
    recency: "4 wks ago",
  });
});

test("an unparseable date is trained with unknown recency, never a fabricated one", () => {
  assert.deepEqual(usageMarker("not-a-date", "2026-08-10"), {
    trained: true,
    recency: null,
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

test("usageBadgeText reads NEW when never trained", () => {
  assert.equal(usageBadgeText({ trained: false, recency: null }), "NEW");
});

test("usageBadgeText composes TRAINED with the self-contained recency phrase", () => {
  // The recency phrases are already complete, so the prefix must not double them
  // up into "last last week" / "last today" (ADR-0042: honest, descriptive recency).
  assert.equal(
    usageBadgeText({ trained: true, recency: "today" }),
    "TRAINED · today",
  );
  assert.equal(
    usageBadgeText({ trained: true, recency: "this week" }),
    "TRAINED · this week",
  );
  assert.equal(
    usageBadgeText({ trained: true, recency: "last week" }),
    "TRAINED · last week",
  );
  assert.equal(
    usageBadgeText({ trained: true, recency: "4 wks ago" }),
    "TRAINED · 4 wks ago",
  );
});

test("usageBadgeText drops the recency clause when recency is unknown, never 'TRAINED · trained'", () => {
  assert.equal(usageBadgeText({ trained: true, recency: null }), "TRAINED");
});
