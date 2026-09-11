import { test } from "node:test";
import assert from "node:assert/strict";

import { createOffer, normalizeMovementName } from "./exercise-picker.ts";
import type { ExerciseSearchResult } from "./exercises-types.ts";

function result(overrides: Partial<ExerciseSearchResult> = {}): ExerciseSearchResult {
  return {
    id: 1,
    name: "Back Squat",
    targeted_muscles: [],
    required_equipment: [],
    difficulty: null,
    provenance: "curated",
    ...overrides,
  };
}

test("normalizes a name the way the backend dedup key does", () => {
  // Arrange / Act / Assert — trims, collapses internal whitespace, lowercases.
  assert.equal(normalizeMovementName("  Back   Squat "), "back squat");
  assert.equal(normalizeMovementName("BENCH PRESS"), "bench press");
  assert.equal(normalizeMovementName("   "), "");
});

test("offers to create a typed movement the catalog does not hold", () => {
  // Arrange — a search that returned only unrelated matches.
  const offer = createOffer("Zercher Squat", [result({ name: "Back Squat" })]);

  // Assert — a novel, valid name is offered for creation, verbatim (trimmed).
  assert.deepEqual(offer, { kind: "offer", name: "Zercher Squat" });
});

test("offers to create when the search returned nothing at all", () => {
  const offer = createOffer("Jefferson Curl", []);
  assert.deepEqual(offer, { kind: "offer", name: "Jefferson Curl" });
});

test("hides the create offer when an existing entry already matches the name", () => {
  // Arrange — the typed name resolves to a seeded/minted movement (dedup by
  // normalized name), so it should be picked, not created again.
  const offer = createOffer("back squat", [result({ name: "Back Squat" })]);

  // Assert — no duplicate-create affordance.
  assert.deepEqual(offer, { kind: "hidden" });
});

test("hides the create offer for a blank query", () => {
  assert.deepEqual(createOffer("   ", []), { kind: "hidden" });
  assert.deepEqual(createOffer("", []), { kind: "hidden" });
});

test("offers the trimmed name, leaving boundary rejection to the endpoint", () => {
  // Arrange — surrounding whitespace on an otherwise novel name.
  const offer = createOffer("  Copenhagen Plank  ", []);

  // Assert — the display/create name is trimmed; no length rule is applied here (the
  // endpoint enforces its own cap and rejects per its contract).
  assert.deepEqual(offer, { kind: "offer", name: "Copenhagen Plank" });
});
