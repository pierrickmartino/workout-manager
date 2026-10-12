import { test } from "node:test";
import assert from "node:assert/strict";

import { basedOnLabel } from "./curated-lineage.ts";

const LINEAGE = {
  identifier: "beginner-linear-progression",
  version: 1,
  name: "Beginner linear progression",
};

test("a plan adopted from a Curated Protocol reads Based on its name", () => {
  assert.equal(basedOnLabel(LINEAGE), "Based on Beginner linear progression");
});

test("a plan with no curated lineage shows no label", () => {
  assert.equal(basedOnLabel(null), null);
});

test("a read that omits the lineage shows no label", () => {
  assert.equal(basedOnLabel(undefined), null);
});
