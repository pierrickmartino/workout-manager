import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RELATIONSHIP_KINDS,
  filterAddCandidates,
  groupRelationships,
  isRelationshipKind,
  relationshipDirectionLabel,
  relationshipKindLabel,
  relationshipKindOptions,
  relationshipRemovalTarget,
  type ExerciseRelationship,
} from "./admin-exercise-relationships.ts";

test("relationship kind options cover the closed vocabulary with labels", () => {
  const options = relationshipKindOptions();
  assert.deepEqual(
    options.map((option) => option.value),
    [...RELATIONSHIP_KINDS],
  );
  assert.deepEqual(
    options.map((option) => option.label),
    ["Variation", "Alternative"],
  );
});

test("isRelationshipKind accepts the vocabulary and rejects anything else", () => {
  assert.equal(isRelationshipKind("variation"), true);
  assert.equal(isRelationshipKind("alternative"), true);
  assert.equal(isRelationshipKind("sibling"), false);
  assert.equal(isRelationshipKind(""), false);
});

test("relationshipKindLabel falls back to the raw value for an unknown kind", () => {
  assert.equal(relationshipKindLabel("variation"), "Variation");
  assert.equal(relationshipKindLabel("mystery"), "mystery");
});

test("direction label reads relative to the viewed movement", () => {
  assert.equal(
    relationshipDirectionLabel("outgoing", "variation"),
    "Has this variation",
  );
  assert.equal(
    relationshipDirectionLabel("incoming", "alternative"),
    "Is an alternative of this movement",
  );
  assert.equal(
    relationshipDirectionLabel("incoming", "variation"),
    "Is a variation of this movement",
  );
});

test("removal target keys on the from end for an outgoing link", () => {
  const row: ExerciseRelationship = {
    id: 20,
    name: "Box Squat",
    kind: "variation",
    direction: "outgoing",
  };
  assert.deepEqual(relationshipRemovalTarget(10, row), {
    fromId: 10,
    toId: 20,
    kind: "variation",
  });
});

test("removal target keys on the other end for an incoming link", () => {
  const row: ExerciseRelationship = {
    id: 30,
    name: "Goblet Squat",
    kind: "alternative",
    direction: "incoming",
  };
  // The incoming link is (30 → 10), so removing it targets from=30, to=10.
  assert.deepEqual(relationshipRemovalTarget(10, row), {
    fromId: 30,
    toId: 10,
    kind: "alternative",
  });
});

test("add candidates drop the exercise being edited (no self-link offered)", () => {
  const results = [
    { id: 10, name: "Back Squat" },
    { id: 20, name: "Box Squat" },
    { id: 30, name: "Goblet Squat" },
  ];
  assert.deepEqual(filterAddCandidates(10, results), [
    { id: 20, name: "Box Squat" },
    { id: 30, name: "Goblet Squat" },
  ]);
});

test("grouping splits the two directions preserving order", () => {
  const rows: ExerciseRelationship[] = [
    { id: 20, name: "Box Squat", kind: "variation", direction: "outgoing" },
    { id: 30, name: "Goblet Squat", kind: "alternative", direction: "incoming" },
    { id: 40, name: "Front Squat", kind: "variation", direction: "outgoing" },
  ];
  const grouped = groupRelationships(rows);
  assert.deepEqual(
    grouped.outgoing.map((row) => row.id),
    [20, 40],
  );
  assert.deepEqual(
    grouped.incoming.map((row) => row.id),
    [30],
  );
});
