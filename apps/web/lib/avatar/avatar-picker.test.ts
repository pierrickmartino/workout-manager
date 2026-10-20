import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAvatarOptions, type AvatarCatalog } from "./avatar-picker.ts";

// The Avatar picker's view-model (ADR-0136): the GET /api/avatars catalog and the user's
// current Avatar mapped into the radio options the page renders. Asserted on the returned
// option shapes, never on markup.

const CATALOG: AvatarCatalog = {
  operator_level: 1,
  avatars: [
    { id: "novice", name: "Novice", unlock_level: 1, unlocked: true },
    { id: "dwarf-lifter", name: "Dwarf Lifter", unlock_level: 1, unlocked: true },
    { id: "elf-ranger", name: "Elf Ranger", unlock_level: 1, unlocked: true },
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
