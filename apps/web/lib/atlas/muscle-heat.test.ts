import { test } from "node:test";
import assert from "node:assert/strict";

import {
  HEAT_ACTIVE_BOOST,
  HEAT_MIN_OPACITY,
  HEAT_RANGE,
  HEAT_SELECTED_OPACITY,
  heatFillOpacity,
} from "./muscle-heat.ts";

// `heatFillOpacity` is the descriptive heat ramp behind the atlas body map (issue #543): a
// trained muscle's fill grows with its emphasis-weighted intensity, brightens on hover/focus, and
// goes near-solid when selected. These tests pin the ramp so the map can never quietly turn into a
// quota fill (a floor that is invisible, or a ceiling that overflows).

test("a just-trained muscle sits at the minimum fill, never invisible", () => {
  assert.equal(heatFillOpacity(0, { selected: false, active: false }), HEAT_MIN_OPACITY);
});

test("the busiest muscle fills to the top of the ramp", () => {
  assert.equal(
    heatFillOpacity(1, { selected: false, active: false }),
    HEAT_MIN_OPACITY + HEAT_RANGE,
  );
});

test("intensity is monotonic between the floor and the ceiling", () => {
  const low = heatFillOpacity(0.25, { selected: false, active: false });
  const high = heatFillOpacity(0.75, { selected: false, active: false });
  assert.ok(low < high);
  assert.ok(low >= HEAT_MIN_OPACITY && high <= HEAT_MIN_OPACITY + HEAT_RANGE);
});

test("the active (hover/focus) boost lifts the fill but never past solid", () => {
  const base = heatFillOpacity(0.5, { selected: false, active: false });
  assert.equal(heatFillOpacity(0.5, { selected: false, active: true }), base + HEAT_ACTIVE_BOOST);
  // At full intensity the boost would exceed 1, so it clamps.
  assert.equal(heatFillOpacity(1, { selected: false, active: true }), 1);
});

test("selection overrides intensity and the active boost", () => {
  assert.equal(heatFillOpacity(0, { selected: true, active: false }), HEAT_SELECTED_OPACITY);
  assert.equal(heatFillOpacity(1, { selected: true, active: true }), HEAT_SELECTED_OPACITY);
});

test("intensity is clamped to [0, 1] so out-of-range input can't overflow", () => {
  assert.equal(heatFillOpacity(-5, { selected: false, active: false }), HEAT_MIN_OPACITY);
  assert.equal(heatFillOpacity(5, { selected: false, active: false }), HEAT_MIN_OPACITY + HEAT_RANGE);
});
