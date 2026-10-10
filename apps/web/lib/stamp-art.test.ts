import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeStampGeometry,
  stampDesign,
  STAMP_VIEWBOX,
  type StampGeometry,
  type StampState,
} from "./stamp-art.ts";

// `stamp-art` is the pure engine behind every Stamp's illustration (#654), a sibling of the
// workout sigil. It is asserted on its structure — silhouette kind, ring and segment count,
// accent — never on markup or pixels.

// The curated catalog, in the API's order (`apps/api/app/domain/achievements.py`).
const CATALOG_IDS = [
  "sessions-1",
  "sessions-5",
  "sessions-25",
  "sessions-100",
  "streak-4",
  "streak-12",
  "muscle-all",
  "first-pr",
] as const;

const STATES: readonly StampState[] = ["earned", "next"];

function geometryOf(id: string, state: StampState): StampGeometry {
  const design = stampDesign(id);
  assert.ok(design !== null, `${id} has no Stamp design`);
  return computeStampGeometry(design, state);
}

test("every catalog Achievement maps to a distinct family and tier", () => {
  // Arrange & Act
  const designs = CATALOG_IDS.map((id) => stampDesign(id));

  // Assert
  for (const [index, design] of designs.entries()) {
    assert.notEqual(design, null, `${CATALOG_IDS[index]} has no Stamp design`);
  }
  const keys = designs.map((design) => `${design?.family}:${design?.tier}`);
  assert.equal(new Set(keys).size, CATALOG_IDS.length);
});

test("each Stamp's silhouette, rings and segments, in both states", () => {
  // Arrange: per Achievement, the family's silhouette and the tier's marks — inner rings for
  // 1 / 5 / 25 / 100 Sessions, one segment per week for the 4- and 12-week streaks.
  const expected: Record<(typeof CATALOG_IDS)[number], [string, number, number]> = {
    "sessions-1": ["circle", 1, 0],
    "sessions-5": ["circle", 2, 0],
    "sessions-25": ["circle", 3, 0],
    "sessions-100": ["circle", 4, 0],
    "streak-4": ["hexagon", 1, 4],
    "streak-12": ["hexagon", 1, 12],
    "muscle-all": ["square", 1, 0],
    "first-pr": ["notched-circle", 1, 0],
  };

  for (const id of CATALOG_IDS) {
    for (const state of STATES) {
      // Act
      const { silhouette, rings, segments } = geometryOf(id, state);

      // Assert: the state changes the treatment, never the structure.
      assert.deepEqual(
        [silhouette.kind, rings.length, segments.length],
        expected[id],
        `${id} (${state})`,
      );
    }
  }
});

test("an earned Stamp is filled ink and the next milestone an outline", () => {
  for (const id of CATALOG_IDS) {
    // Act & Assert
    assert.equal(geometryOf(id, "earned").filled, true, id);
    assert.equal(geometryOf(id, "next").filled, false, id);
  }
});

test("only the record Stamp carries the violet milestone accent; the rest are teal", () => {
  // Act & Assert
  assert.equal(geometryOf("first-pr", "earned").accent, "violet");
  for (const id of CATALOG_IDS.filter((candidate) => candidate !== "first-pr")) {
    assert.equal(geometryOf(id, "earned").accent, "cyan", `${id} should use the teal ink`);
  }
});

test("an id outside the catalog has no Stamp design, so nothing is drawn", () => {
  // Act & Assert
  assert.equal(stampDesign("sessions-7"), null);
  assert.equal(stampDesign("unknown"), null);
});

test("all geometry stays within the Stamp viewbox", () => {
  for (const id of CATALOG_IDS) {
    // Act
    const { silhouette, rings, segments } = geometryOf(id, "earned");

    // Assert
    const points = [
      ...silhouette.points,
      ...segments.flatMap((segment) => [segment.from, segment.to]),
    ];
    for (const { x, y } of points) {
      assert.ok(x >= 0 && x <= STAMP_VIEWBOX && y >= 0 && y <= STAMP_VIEWBOX, id);
    }
    for (const radius of [silhouette.radius, ...rings]) {
      assert.ok(radius > 0 && radius <= STAMP_VIEWBOX / 2, `${id} radius ${radius}`);
    }
  }
});
