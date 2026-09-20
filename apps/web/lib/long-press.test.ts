import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LONG_PRESS_MOVE_TOLERANCE_PX,
  exceedsMoveTolerance,
} from "./long-press.ts";

// `exceedsMoveTolerance` is the cancel rule for the press-and-hold Favorite gesture (Q6/Q9): a
// pointer that drifts past the tolerance is a scroll/drag, so the pending long-press is dropped.
// Pure and server-free, so the threshold logic is unit-tested here (the pointer wiring is a thin,
// untested hook over it).

test("a still (or barely moved) pointer stays within tolerance", () => {
  assert.equal(exceedsMoveTolerance(0, 0), false);
  assert.equal(exceedsMoveTolerance(3, -4), false);
});

test("movement exactly at the tolerance is still a hold (boundary is inclusive)", () => {
  assert.equal(
    exceedsMoveTolerance(LONG_PRESS_MOVE_TOLERANCE_PX, 0),
    false,
  );
  assert.equal(
    exceedsMoveTolerance(0, LONG_PRESS_MOVE_TOLERANCE_PX),
    false,
  );
});

test("drift past the tolerance on either axis cancels the long-press", () => {
  assert.equal(exceedsMoveTolerance(LONG_PRESS_MOVE_TOLERANCE_PX + 1, 0), true);
  assert.equal(exceedsMoveTolerance(0, -(LONG_PRESS_MOVE_TOLERANCE_PX + 1)), true);
});

test("a custom tolerance overrides the default", () => {
  assert.equal(exceedsMoveTolerance(5, 0, 4), true);
  assert.equal(exceedsMoveTolerance(5, 0, 20), false);
});
