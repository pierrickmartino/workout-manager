import { test } from "node:test";
import assert from "node:assert/strict";

import { computeStampGeometry, stampDesign } from "./stamp-art.ts";

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

test("each Achievement family is drawn with its own silhouette", () => {
  // Arrange & Act
  const silhouetteOf = (id: string): string => {
    const design = stampDesign(id);
    assert.ok(design !== null);
    return computeStampGeometry(design, "earned").silhouette.kind;
  };

  // Assert
  assert.equal(silhouetteOf("sessions-25"), "circle");
  assert.equal(silhouetteOf("streak-4"), "hexagon");
  assert.equal(silhouetteOf("muscle-all"), "square");
  assert.equal(silhouetteOf("first-pr"), "notched-circle");
});

test("a higher session tier adds an inner ring: 1, 5, 25 and 100 Sessions", () => {
  // Arrange & Act
  const rings = ["sessions-1", "sessions-5", "sessions-25", "sessions-100"].map((id) => {
    const design = stampDesign(id);
    assert.ok(design !== null);
    return computeStampGeometry(design, "earned").rings.length;
  });

  // Assert
  assert.deepEqual(rings, [1, 2, 3, 4]);
});

test("a week-streak Stamp carries one segment per week: 4 and 12", () => {
  // Arrange & Act
  const segments = ["streak-4", "streak-12"].map((id) => {
    const design = stampDesign(id);
    assert.ok(design !== null);
    return computeStampGeometry(design, "earned").segments.length;
  });

  // Assert
  assert.deepEqual(segments, [4, 12]);
});

test("an earned Stamp is filled ink and the next milestone a muted outline", () => {
  // Arrange
  const design = { family: "sessions", tier: 2 } as const;

  // Act
  const earned = computeStampGeometry(design, "earned");
  const next = computeStampGeometry(design, "next");

  // Assert: the state changes the treatment, never the structure.
  assert.equal(earned.filled, true);
  assert.equal(next.filled, false);
  assert.equal(next.accent, "muted");
  assert.deepEqual(next.silhouette, earned.silhouette);
  assert.deepEqual(next.rings, earned.rings);
});

test("only the record Stamp carries the violet milestone accent; the rest are teal", () => {
  // Arrange & Act
  const accentOf = (id: string): string => {
    const design = stampDesign(id);
    assert.ok(design !== null);
    return computeStampGeometry(design, "earned").accent;
  };

  // Assert
  assert.equal(accentOf("first-pr"), "violet");
  for (const id of CATALOG_IDS.filter((candidate) => candidate !== "first-pr")) {
    assert.equal(accentOf(id), "cyan", `${id} should use the teal ink`);
  }
});

test("an id outside the catalog has no Stamp design, so nothing is drawn", () => {
  assert.equal(stampDesign("sessions-7"), null);
  assert.equal(stampDesign("unknown"), null);
});

test("all geometry stays within the Stamp viewbox", () => {
  for (const id of CATALOG_IDS) {
    // Arrange
    const design = stampDesign(id);
    assert.ok(design !== null);

    // Act
    const { silhouette, rings, segments } = computeStampGeometry(design, "earned");

    // Assert
    const points = [
      ...silhouette.points,
      ...segments.flatMap((segment) => [segment.from, segment.to]),
    ];
    for (const point of points) {
      assert.ok(point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100, `${id}`);
    }
    for (const radius of [silhouette.radius, ...rings]) {
      assert.ok(radius > 0 && radius <= 50, `${id} radius ${radius}`);
    }
  }
});
