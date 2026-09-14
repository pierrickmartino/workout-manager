import { test } from "node:test";
import assert from "node:assert/strict";

import { deleteControlView } from "./admin-exercise-delete.ts";

test("a retired, unreferenced exercise can be deleted with no blocking reason", () => {
  const view = deleteControlView(true, 0);
  assert.equal(view.canDelete, true);
  assert.equal(view.blockingReason, null);
  assert.equal(view.actionLabel, "Delete permanently");
  assert.equal(view.busyLabel, "Deleting…");
  assert.match(view.confirmMessage, /permanently/i);
  assert.match(view.successMessage, /deleted/i);
});

test("an active (not retired) exercise cannot be deleted and says to retire first", () => {
  const view = deleteControlView(false, 0);
  assert.equal(view.canDelete, false);
  assert.match(view.blockingReason ?? "", /retire/i);
});

test("a retired but referenced exercise cannot be deleted and names the reference count", () => {
  const view = deleteControlView(true, 3);
  assert.equal(view.canDelete, false);
  assert.match(view.blockingReason ?? "", /3/);
  assert.match(view.blockingReason ?? "", /reference/i);
});

test("a single reference reads in the singular", () => {
  const view = deleteControlView(true, 1);
  assert.equal(view.canDelete, false);
  assert.match(view.blockingReason ?? "", /1 reference\b/);
});

test("multiple references read in the plural", () => {
  const view = deleteControlView(true, 2);
  assert.match(view.blockingReason ?? "", /2 references\b/);
});

test("an unknown reference count (null) blocks deletion defensively", () => {
  // A non-operator read carries no count; the editor only ever sees a number, so this is a
  // defensive guard — an unknown count must never enable the irreversible act.
  const view = deleteControlView(true, null);
  assert.equal(view.canDelete, false);
  assert.match(view.blockingReason ?? "", /unavailable/i);
});

test("an active AND referenced exercise reports the retire-first block first", () => {
  // Retire is the earlier gate: with both unmet, the reason nudges toward retiring first
  // rather than confusing the admin with a reference count on a still-active row.
  const view = deleteControlView(false, 5);
  assert.equal(view.canDelete, false);
  assert.match(view.blockingReason ?? "", /retire/i);
});
