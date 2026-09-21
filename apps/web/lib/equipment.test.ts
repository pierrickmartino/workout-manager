import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EQUIPMENT_ORDER,
  EQUIPMENT_LABEL,
  equipmentLabel,
  parseEquipment,
  type Equipment,
} from "./equipment.ts";

// `equipment` owns the presentation side of the curated Equipment vocabulary (ADR-0077): a
// label and the canonical order for each backend-classified token. Pure and server-free.

test("every equipment token in the order has a non-empty label", () => {
  for (const token of EQUIPMENT_ORDER) {
    assert.equal(typeof EQUIPMENT_LABEL[token], "string");
    assert.ok(EQUIPMENT_LABEL[token].length > 0);
  }
});

test("other is always ordered last", () => {
  assert.equal(EQUIPMENT_ORDER[EQUIPMENT_ORDER.length - 1], "other");
});

test("the order lists each token exactly once", () => {
  const unique = new Set(EQUIPMENT_ORDER);
  assert.equal(unique.size, EQUIPMENT_ORDER.length);
});

test("parses a known wire token to itself", () => {
  assert.equal(parseEquipment("pull-up bar"), "pull-up bar");
});

test("defaults an unknown or legacy token to other", () => {
  const legacy = "atletica r8 combat" as Equipment;
  assert.equal(parseEquipment(legacy), "other");
});

test("equipmentLabel resolves a token to its Title-Case label", () => {
  assert.equal(equipmentLabel("resistance band"), "Resistance Band");
  // an unknown token resolves through "other"
  assert.equal(equipmentLabel("something-new"), "Other");
});
