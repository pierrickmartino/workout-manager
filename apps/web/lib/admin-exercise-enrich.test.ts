import { test } from "node:test";
import assert from "node:assert/strict";

import { enrichControlView } from "./admin-exercise-enrich.ts";

test("the enrich control exposes its resting and in-flight labels", () => {
  const view = enrichControlView();
  assert.equal(view.actionLabel, "Enrich now");
  assert.equal(view.busyLabel, "Queuing…");
});

test("the acknowledgement reflects acceptance, not completion", () => {
  const view = enrichControlView();
  // The fill runs in the background, so the message must not claim the movement is done.
  assert.match(view.acceptedMessage, /queued/i);
  assert.match(view.acceptedMessage, /background/i);
});

test("the description states the idempotent, provenance-safe guarantee", () => {
  const view = enrichControlView();
  assert.match(view.description, /Safe to re-run/i);
  assert.match(view.description, /provenance is never changed/i);
});
