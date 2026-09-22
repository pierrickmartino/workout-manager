import { test } from "node:test";
import assert from "node:assert/strict";

import { belly, oval, slab } from "./shape-kit.ts";

test("belly is symmetric about its axis and spans top to bottom", () => {
  // Arrange
  const cx = 80;
  // Act
  const ring = belly(cx, 100, 200, [
    [0, 0],
    [0.5, 10],
    [1, 0],
  ]);
  // Assert — the mean x sits on the axis (so a bilateral author stays off-centre), and the
  // extreme y's are the top and bottom.
  const meanX = ring.reduce((sum, [x]) => sum + x, 0) / ring.length;
  assert.ok(Math.abs(meanX - cx) < 0.001, "belly centred on its axis");
  const ys = ring.map(([, y]) => y);
  assert.equal(Math.min(...ys), 100);
  assert.equal(Math.max(...ys), 200);
});

test("belly collapses coincident tips to a single point (no zero-length segment)", () => {
  // Arrange + Act — both ends taper to width 0.
  const ring = belly(50, 0, 100, [
    [0, 0],
    [0.5, 8],
    [1, 0],
  ]);
  // Assert — no two consecutive points are coincident.
  for (let i = 1; i < ring.length; i += 1) {
    const [x0, y0] = ring[i - 1];
    const [x1, y1] = ring[i];
    assert.ok(Math.hypot(x1 - x0, y1 - y0) > 0.5, "no degenerate segment");
  }
});

test("oval returns n points on the ellipse", () => {
  // Arrange + Act
  const ring = oval(100, 100, 20, 10, 8);
  // Assert
  assert.equal(ring.length, 8);
  for (const [x, y] of ring) {
    const on = ((x - 100) / 20) ** 2 + ((y - 100) / 10) ** 2;
    assert.ok(Math.abs(on - 1) < 0.001, "point lies on the ellipse");
  }
});

test("slab passes its corners through as a ring", () => {
  // Arrange
  const corners: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  // Act
  const ring = slab(corners);
  // Assert
  assert.deepEqual(ring, corners);
});
