import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ILLUSTRATION_ASPECT,
  ILLUSTRATION_HEIGHT,
  ILLUSTRATION_WIDTH,
  aspectClassRatio,
} from "./illustration-box.ts";

// ADR-0095: an illustration's box is reserved before its bytes arrive. Two things state
// that shape — the CSS utility that reserves the box and the `width`/`height` pair the
// <img> carries as its ratio hint — and they are only useful while they agree. These tests
// hold them to the same number, because a drifted pair is worse than none: the hint would
// reserve one shape and the box another, and the content below would still jump.
//
// The aspect, not the capped result: `ILLUSTRATION_MAX_HEIGHT` clamps the box in the wide
// shell, and the hint is what a browser lays out from *before* the stylesheet applies, when no
// cap is in play. Both are known before the image is, so the height is settled from the first
// layout either way — which is the property that matters here.

test("the ratio hint and the reserved aspect describe the same shape", () => {
  // Arrange / Act
  const box = aspectClassRatio(ILLUSTRATION_ASPECT);

  // Assert
  assert.equal(box, ILLUSTRATION_WIDTH / ILLUSTRATION_HEIGHT);
});

test("reads the ratio out of an arbitrary aspect utility", () => {
  // Arrange / Act / Assert
  assert.equal(aspectClassRatio("aspect-[16/9]"), 16 / 9);
  assert.equal(aspectClassRatio("aspect-[1/1]"), 1);
});

test("an aspect utility it cannot read is null, never a guessed square", () => {
  // Arrange — the named utilities and a malformed one. A guard that answered 1 here would
  // report agreement between a box and a hint it never actually compared.
  const unreadable = ["aspect-video", "aspect-square", "aspect-[4/0]", "aspect-[a/b]", ""];

  // Act / Assert
  for (const className of unreadable) {
    assert.equal(aspectClassRatio(className), null, className);
  }
});

test("the ratio hint is a pair of real pixel counts", () => {
  // Arrange / Act / Assert — a browser reads these as intrinsic dimensions when the
  // stylesheet has not arrived, so a zero or a fraction is not a hint.
  assert.ok(Number.isInteger(ILLUSTRATION_WIDTH) && ILLUSTRATION_WIDTH > 0);
  assert.ok(Number.isInteger(ILLUSTRATION_HEIGHT) && ILLUSTRATION_HEIGHT > 0);
});
