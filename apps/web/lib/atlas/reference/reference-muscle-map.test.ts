import { test } from "node:test";
import assert from "node:assert/strict";

import { CANONICAL_MUSCLE_IDS } from "../muscle-figure-spec.ts";
import { REFERENCE_PATHS, REFERENCE_VIEWBOX } from "./reference-data.ts";
import { REFERENCE_MUSCLE_MAP, canonicalMuscleFor } from "./reference-muscle-map.ts";

const CANONICAL = new Set(CANONICAL_MUSCLE_IDS);
const GENDERS = ["male", "female"] as const;
const HALVES = ["front", "back"] as const;

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

// The source artwork packs BOTH figures into each nested <svg> and relies on that svg's viewBox
// (plus overflow:hidden) to crop to one half. The generator filters each half down to its own
// paths, so the data is the half itself — otherwise the other figure bleeds over its neighbour
// whenever the SVG isn't clipped (the "doubled body" regression).
test("every path of a half lies inside that half's viewBox", () => {
  for (const gender of GENDERS) {
    for (const half of HALVES) {
      const [vx, , vw] = REFERENCE_VIEWBOX[gender][half].split(/\s+/).map(Number);
      for (const path of REFERENCE_PATHS[gender][half]) {
        const { min, max } = xExtent(path.d);
        assert.ok(
          min >= vx - 1 && max <= vx + vw + 1,
          `${gender}/${half} "${path.muscle}" spans [${min}, ${max}] outside viewBox [${vx}, ${vx + vw}]`,
        );
      }
    }
  }
});

test("the two halves occupy disjoint horizontal bands (no duplicated figure)", () => {
  for (const gender of GENDERS) {
    const frontMax = Math.max(...REFERENCE_PATHS[gender].front.map((p) => xExtent(p.d).max));
    const backMin = Math.min(...REFERENCE_PATHS[gender].back.map((p) => xExtent(p.d).min));
    assert.ok(frontMax < backMin, `${gender}: front and back overlap (${frontMax} >= ${backMin})`);
  }
});

// The x-extent of a path. The reference uses only absolute M/L/C/V/Z; x values are every other
// number of an M/L/C run, and V carries a lone y that must not be read as an x.
function xExtent(d: string): { min: number; max: number } {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let min = Infinity;
  let max = -Infinity;
  let command = "";
  let paramIndex = 0;
  for (const token of tokens) {
    if (/[A-Za-z]/.test(token)) {
      command = token.toUpperCase();
      paramIndex = 0;
      continue;
    }
    const value = Number(token);
    if ((command === "M" || command === "L" || command === "C") && paramIndex % 2 === 0) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    paramIndex += 1;
  }
  return { min, max };
}
