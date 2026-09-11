import { test } from "node:test";
import assert from "node:assert/strict";

import { removeAffordances } from "./remove-prescription.ts";

// `removeAffordances` derives the per-row Remove control state for a standalone Session's
// prescriptions (Remove, ADR-0052): whether to show it (standalone-only), whether it is
// enabled (a Session must keep one movement), and whether removing a row dissolves its
// Superset partner (Q9).

function solo(): { superset_group: string | null } {
  return { superset_group: null };
}

function grouped(tag: string): { superset_group: string | null } {
  return { superset_group: tag };
}

test("shows and enables Remove for every row of a multi-movement standalone session", () => {
  // Arrange
  const prescriptions = [solo(), solo(), solo()];

  // Act
  const affordances = removeAffordances(prescriptions, false);

  // Assert
  assert.equal(affordances.length, 3);
  assert.ok(affordances.every((a) => a.showRemove && a.canRemove));
});

test("withholds Remove entirely on a protocol member", () => {
  // Arrange / Act
  const affordances = removeAffordances([solo(), solo()], true);

  // Assert — standalone-only: the control is never rendered inside a Protocol
  assert.ok(affordances.every((a) => !a.showRemove));
});

test("disables Remove on the last remaining movement", () => {
  // Arrange — one movement left: a Session must keep at least one (Q4/Q8)
  const affordances = removeAffordances([solo()], false);

  // Assert — shown but disabled
  assert.equal(affordances[0].showRemove, true);
  assert.equal(affordances[0].canRemove, false);
});

test("flags dissolve for both members of a two-member superset", () => {
  // Arrange — a two-member Superset "A" plus a solo movement
  const affordances = removeAffordances(
    [grouped("A"), grouped("A"), solo()],
    false,
  );

  // Assert — removing either "A" member ungroups its partner; the solo does not
  assert.equal(affordances[0].dissolvesSuperset, true);
  assert.equal(affordances[1].dissolvesSuperset, true);
  assert.equal(affordances[2].dissolvesSuperset, false);
});

test("does not flag dissolve for a three-member superset — it merely shrinks", () => {
  // Arrange — a three-member Superset "A": removing one leaves two, still a valid Superset
  const affordances = removeAffordances(
    [grouped("A"), grouped("A"), grouped("A")],
    false,
  );

  // Assert — no dissolve warning on any member
  assert.ok(affordances.every((a) => !a.dissolvesSuperset));
});
