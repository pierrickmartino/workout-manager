import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAvatarOptions, type AvatarCatalog } from "./avatar-picker.ts";

// The Avatar picker's view-model (ADR-0136): the GET /api/avatars catalog and the user's
// current Avatar mapped into the radio options the page renders. Asserted on the returned
// option shapes, never on markup.

const CATALOG: AvatarCatalog = {
  operator_level: 1,
  avatars: [
    { id: "novice", name: "Novice", unlock_level: 1, unlocked: true, current_level: 1 },
    { id: "dwarf-lifter", name: "Dwarf Lifter", unlock_level: 1, unlocked: true, current_level: 1 },
    { id: "elf-ranger", name: "Elf Ranger", unlock_level: 1, unlocked: true, current_level: 1 },
  ],
};

test("the picker offers every catalog Avatar, in order, by its character name", () => {
  // Act
  const options = buildAvatarOptions(CATALOG, "novice");

  // Assert
  assert.deepEqual(
    options.map((option) => [option.id, option.name]),
    [
      ["novice", "Novice"],
      ["dwarf-lifter", "Dwarf Lifter"],
      ["elf-ranger", "Elf Ranger"],
    ],
  );
});

test("exactly the user’s current Avatar is marked selected", () => {
  // Act
  const options = buildAvatarOptions(CATALOG, "dwarf-lifter");

  // Assert
  assert.deepEqual(
    options.map((option) => option.selected),
    [false, true, false],
  );
});

test("each option is announced by its character name", () => {
  // Act
  const options = buildAvatarOptions(CATALOG, "novice");

  // Assert
  assert.deepEqual(
    options.map((option) => option.label),
    ["Novice", "Dwarf Lifter", "Elf Ranger"],
  );
});

test("each option carries the artwork drawn for its id", () => {
  // Act
  const options = buildAvatarOptions(CATALOG, "novice");

  // Assert
  assert.deepEqual(
    options.map((option) => option.art.id),
    ["novice", "dwarf-lifter", "elf-ranger"],
  );
});

test("no option is selected when the current Avatar is not in the catalog", () => {
  // Act
  const options = buildAvatarOptions(CATALOG, "retired-hero");

  // Assert
  assert.equal(options.some((option) => option.selected), false);
});

// A user at Operator Level 5: the Barbarian just unlocked, the Valkyrie and Titan still ahead.
const EARNED: AvatarCatalog = {
  operator_level: 5,
  avatars: [
    { id: "novice", name: "Novice", unlock_level: 1, unlocked: true, current_level: 1 },
    { id: "barbarian", name: "Barbarian", unlock_level: 5, unlocked: true, current_level: 5 },
    { id: "valkyrie", name: "Valkyrie", unlock_level: 8, unlocked: false, current_level: 5 },
    { id: "titan", name: "Titan", unlock_level: 20, unlocked: false, current_level: 5 },
  ],
};

test("an Avatar the user’s Operator Level hasn’t reached is locked", () => {
  // Act
  const options = buildAvatarOptions(EARNED, "novice");

  // Assert
  assert.deepEqual(
    options.map((option) => [option.id, option.locked]),
    [
      ["novice", false],
      ["barbarian", false],
      ["valkyrie", true],
      ["titan", true],
    ],
  );
});

test("a locked Avatar shows the user’s progress toward its unlock level", () => {
  // Act
  const options = buildAvatarOptions(EARNED, "novice");

  // Assert — an unlocked Avatar has no progress to show
  assert.deepEqual(
    options.map((option) => option.progress),
    [null, null, "LVL 5 / 8", "LVL 5 / 20"],
  );
});

test("a locked Avatar is announced with its name, its status and the level it needs", () => {
  // Act
  const options = buildAvatarOptions(EARNED, "novice");

  // Assert
  assert.deepEqual(
    options.map((option) => option.label),
    ["Novice", "Barbarian", "Valkyrie, locked, reach LVL 8", "Titan, locked, reach LVL 20"],
  );
});

test("an Avatar the user kept after their level dropped stays selected while locked", () => {
  // Act
  const valkyrie = buildAvatarOptions(EARNED, "valkyrie").find(
    (option) => option.id === "valkyrie",
  );

  // Assert
  assert.equal(valkyrie?.selected, true);
  assert.equal(valkyrie?.locked, true);
});
