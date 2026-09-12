import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeSigilGeometry,
  sigilNodeCount,
  MAX_SIGIL_NODES,
  MIN_SIGIL_NODES,
  SIGIL_VIEWBOX,
} from "./workout-sigil.ts";

// `workout-sigil` is the pure engine behind the Workout Signature mark (CONTEXT: Workout
// Signature). Its whole job is a DETERMINISTIC mapping from a Session id + Exercise count to a
// geometric sigil that is identical across every surface and distinct between Sessions.

test("is deterministic — the same id and exercise count yield identical geometry", () => {
  // Arrange / Act
  const first = computeSigilGeometry(4012, 5);
  const second = computeSigilGeometry(4012, 5);

  // Assert
  assert.deepEqual(first, second);
});

test("different ids yield different geometry — the two Calisthenics never collide", () => {
  // Arrange — two Sessions of the same Training Type and size, differing only by id.
  const a = computeSigilGeometry(4012, 5);
  const b = computeSigilGeometry(4027, 5);

  // Assert — rotation and node placement diverge, so the marks read differently.
  assert.notDeepEqual(a, b);
  assert.notEqual(a.rotation, b.rotation);
});

test("numeric and string ids seed identically — surfaces may pass either form", () => {
  assert.deepEqual(computeSigilGeometry(8, 4), computeSigilGeometry("8", 4));
});

test("node count equals the exercise count below the cap", () => {
  assert.equal(computeSigilGeometry(1, 1).nodes.length, 1);
  assert.equal(computeSigilGeometry(1, 5).nodes.length, 5);
  assert.equal(computeSigilGeometry(1, MAX_SIGIL_NODES).nodes.length, MAX_SIGIL_NODES);
});

test("node count is capped so a long circuit stays legible", () => {
  assert.equal(computeSigilGeometry(1, 40).nodes.length, MAX_SIGIL_NODES);
});

test("a zero or non-finite exercise count floors to the minimum node count", () => {
  assert.equal(sigilNodeCount(0), MIN_SIGIL_NODES);
  assert.equal(sigilNodeCount(-3), MIN_SIGIL_NODES);
  assert.equal(sigilNodeCount(Number.NaN), MIN_SIGIL_NODES);
  assert.equal(computeSigilGeometry(1, 0).nodes.length, MIN_SIGIL_NODES);
});

test("the base polygon has between 3 and 6 sides", () => {
  for (const id of [1, 2, 3, 100, 4012, 4027, 5501]) {
    const sides = computeSigilGeometry(id, 4).polygon.length;
    assert.ok(sides >= 3 && sides <= 6, `sides ${sides} for id ${id} out of range`);
  }
});

test("all geometry stays within the sigil viewbox", () => {
  const { polygon, nodes, center } = computeSigilGeometry(4012, 8);
  const points = [...polygon, ...nodes, center];
  for (const point of points) {
    assert.ok(point.x >= 0 && point.x <= SIGIL_VIEWBOX, `x ${point.x} out of range`);
    assert.ok(point.y >= 0 && point.y <= SIGIL_VIEWBOX, `y ${point.y} out of range`);
  }
});

test("rotation is a degree value in [0, 360)", () => {
  const { rotation } = computeSigilGeometry(4012, 5);
  assert.ok(rotation >= 0 && rotation < 360);
});
