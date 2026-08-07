import { test } from "node:test";
import assert from "node:assert/strict";

import {
  dissolveSingletonGroups,
  editRoundRest,
  freshSupersetTag,
  groupWithNext,
  moveItem,
  reorderKeepingContiguous,
  supersetLayout,
  supersetsAreContiguous,
  ungroup,
  type SupersetMember,
} from "./supersets.ts";

// A minimal draft row — just the overlay fields plus a label so a reordered array is
// identifiable in assertions.
interface Row extends SupersetMember {
  name: string;
}

function row(
  name: string,
  supersetGroup: string | null = null,
  roundRestSeconds: number | null = null,
): Row {
  return { name, supersetGroup, roundRestSeconds };
}

test("moveItem repositions an item and preserves the rest in order", () => {
  // Arrange
  const items = [row("a"), row("b"), row("c")];

  // Act
  const moved = moveItem(items, 0, 2);

  // Assert
  assert.deepEqual(
    moved.map((r) => r.name),
    ["b", "c", "a"],
  );
});

test("moveItem returns the same array reference for an out-of-range move", () => {
  const items = [row("a"), row("b")];
  assert.equal(moveItem(items, 0, 5), items);
});

test("groupWithNext groups two consecutive solo rows under a fresh tag", () => {
  // Arrange
  const items = [row("a"), row("b"), row("c")];

  // Act — seed the round-rest from the next member's own rest (120).
  const grouped = groupWithNext(items, 0, 120);

  // Assert — a and b share a tag with the seeded round-rest; c stays solo.
  assert.equal(grouped[0].supersetGroup, grouped[1].supersetGroup);
  assert.notEqual(grouped[0].supersetGroup, null);
  assert.equal(grouped[0].roundRestSeconds, 120);
  assert.equal(grouped[1].roundRestSeconds, 120);
  assert.equal(grouped[2].supersetGroup, null);
});

test("groupWithNext keeps an existing group's round-rest over the seed", () => {
  // Arrange — a and b already grouped with a round-rest of 90; group c in.
  const items = [row("a", "1", 90), row("b", "1", 90), row("c")];

  // Act
  const grouped = groupWithNext(items, 1, 60);

  // Assert — all three share the tag and keep the existing 90s round-rest.
  assert.deepEqual(
    grouped.map((r) => r.supersetGroup),
    ["1", "1", "1"],
  );
  assert.deepEqual(
    grouped.map((r) => r.roundRestSeconds),
    [90, 90, 90],
  );
});

test("groupWithNext is a no-op past the last item", () => {
  const items = [row("a"), row("b")];
  assert.equal(groupWithNext(items, 1, 120), items);
});

test("ungroup dissolves the whole group and clears its round-rest", () => {
  // Arrange
  const items = [row("a", "1", 120), row("b", "1", 120), row("c")];

  // Act
  const flat = ungroup(items, 0);

  // Assert
  assert.deepEqual(
    flat.map((r) => r.supersetGroup),
    [null, null, null],
  );
  assert.deepEqual(
    flat.map((r) => r.roundRestSeconds),
    [null, null, null],
  );
});

test("ungroup is a no-op on a solo row", () => {
  const items = [row("a"), row("b")];
  assert.equal(ungroup(items, 0), items);
});

test("editRoundRest applies to every member of the group", () => {
  // Arrange
  const items = [row("a", "1", 120), row("b", "1", 120), row("c")];

  // Act — edit from the second member.
  const edited = editRoundRest(items, 1, 75);

  // Assert
  assert.deepEqual(
    edited.map((r) => r.roundRestSeconds),
    [75, 75, null],
  );
});

test("supersetsAreContiguous is true for an unbroken run and false for a split", () => {
  const contiguous = [row("a", "1"), row("b", "1"), row("c")];
  const split = [row("a", "1"), row("b"), row("c", "1")];
  assert.equal(supersetsAreContiguous(contiguous), true);
  assert.equal(supersetsAreContiguous(split), false);
});

test("reorderKeepingContiguous refuses a move that would split a group", () => {
  // Arrange — a and c are grouped and contiguous (positions 0,1); moving b between them
  // would split the group.
  const items = [row("a", "1"), row("c", "1"), row("b")];

  // Act — try to move the solo b (index 2) between the two members (index 1).
  const result = reorderKeepingContiguous(items, 2, 1);

  // Assert — the move is refused; the original order is preserved.
  assert.equal(result, items);
});

test("reorderKeepingContiguous allows a move that keeps every group contiguous", () => {
  const items = [row("a"), row("b"), row("c")];
  const result = reorderKeepingContiguous(items, 2, 0);
  assert.deepEqual(
    result.map((r) => r.name),
    ["c", "a", "b"],
  );
});

test("freshSupersetTag picks one past the largest numeric tag in use", () => {
  const items = [row("a", "1"), row("b", "3"), row("c")];
  assert.equal(freshSupersetTag(items), "4");
});

test("freshSupersetTag starts at 1 for a flat list", () => {
  assert.equal(freshSupersetTag([row("a"), row("b")]), "1");
});

test("dissolveSingletonGroups clears a group left with a single member", () => {
  // Arrange — a group whose second member was just removed, leaving a lone tag, next to a
  // still-healthy two-member group that must survive.
  const items = [
    row("a", "1", 120),
    row("b", "2", 90),
    row("c", "2", 90),
  ];

  // Act
  const pruned = dissolveSingletonGroups(items);

  // Assert — the singleton is dissolved (tag and round-rest cleared); the pair is intact.
  assert.equal(pruned[0].supersetGroup, null);
  assert.equal(pruned[0].roundRestSeconds, null);
  assert.deepEqual(
    pruned.slice(1).map((r) => r.supersetGroup),
    ["2", "2"],
  );
});

test("dissolveSingletonGroups leaves healthy groups and solos untouched", () => {
  const items = [row("a", "1", 120), row("b", "1", 120), row("c")];
  const pruned = dissolveSingletonGroups(items);
  assert.deepEqual(
    pruned.map((r) => r.supersetGroup),
    ["1", "1", null],
  );
});

test("supersetLayout letters members and brackets the group", () => {
  // Arrange — a two-member group followed by a solo row.
  const items = [row("a", "1", 120), row("b", "1", 120), row("c")];

  // Act
  const layout = supersetLayout(items);

  // Assert — A/B badges, first/last flags, the group's round-rest on each member, and the
  // solo row outside any container.
  assert.deepEqual(
    layout.map((slot) => slot.memberLabel),
    ["A", "B", null],
  );
  assert.equal(layout[0].isFirstMember, true);
  assert.equal(layout[1].isLastMember, true);
  assert.deepEqual(
    layout.map((slot) => slot.groupSize),
    [2, 2, 0],
  );
  assert.equal(layout[1].roundRestSeconds, 120);
});

test("supersetLayout gates canGroupWithNext across group boundaries", () => {
  // Arrange — a solo, then a group of two.
  const items = [row("a"), row("b", "1"), row("c", "1")];

  // Act
  const layout = supersetLayout(items);

  // Assert — the solo can group with the group's opener; the group's members cannot
  // re-group with a same-group neighbour, and the last row has no next.
  assert.equal(layout[0].canGroupWithNext, true);
  assert.equal(layout[1].canGroupWithNext, false);
  assert.equal(layout[2].canGroupWithNext, false);
});
