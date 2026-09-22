import { test } from "node:test";
import assert from "node:assert/strict";

import { CANONICAL_MUSCLE_IDS } from "../muscle-figure-spec.ts";
import { REFERENCE_PATHS } from "./reference-data.ts";
import { REFERENCE_MUSCLE_MAP, canonicalMuscleFor } from "./reference-muscle-map.ts";

const CANONICAL = new Set(CANONICAL_MUSCLE_IDS);

// Every reference region drawn in either gender's front or back must resolve through the map — a
// new source label must not silently render as an unaddressable shape.
test("every reference region label is covered by the map", () => {
  const labels = new Set<string>();
  for (const gender of ["male", "female"] as const) {
    for (const half of ["front", "back"] as const) {
      for (const path of REFERENCE_PATHS[gender][half]) labels.add(path.muscle);
    }
  }
  for (const label of labels) {
    assert.ok(label in REFERENCE_MUSCLE_MAP, `reference label "${label}" is not mapped`);
  }
});

// Every non-null target is a real canonical Muscle id — so a tap opens a real drawer and the heat
// reads a real coverage row.
test("every mapped target is a canonical Muscle id", () => {
  for (const [label, target] of Object.entries(REFERENCE_MUSCLE_MAP)) {
    if (target === null) continue;
    assert.ok(CANONICAL.has(target), `"${label}" maps to unknown muscle "${target}"`);
  }
});

test("head resolves to no addressable muscle", () => {
  assert.equal(canonicalMuscleFor("head"), null);
  assert.equal(canonicalMuscleFor("quads"), "Quadriceps");
});
