import { test } from "node:test";
import assert from "node:assert/strict";

import { retireControlView } from "./admin-exercise-retire.ts";

test("an active exercise offers Retire and targets the retired state", () => {
  const view = retireControlView(false);
  assert.equal(view.retired, false);
  assert.equal(view.statusLabel, "Active");
  assert.equal(view.actionLabel, "Retire");
  assert.equal(view.busyLabel, "Retiring…");
  assert.equal(view.nextRetired, true);
  assert.match(view.description, /Retiring hides it/);
  assert.match(view.successMessage, /hidden from discovery/);
});

test("a retired exercise offers Un-retire and targets the active state", () => {
  const view = retireControlView(true);
  assert.equal(view.retired, true);
  assert.equal(view.statusLabel, "Retired");
  assert.equal(view.actionLabel, "Un-retire");
  assert.equal(view.busyLabel, "Un-retiring…");
  assert.equal(view.nextRetired, false);
  assert.match(view.description, /Un-retiring fully restores it/);
  assert.match(view.successMessage, /discoverable again/);
});
