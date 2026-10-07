import { test } from "node:test";
import assert from "node:assert/strict";

import { bestEffortData, settleBestEffort } from "./best-effort-read.ts";

// The rule these tests pin: a *best-effort* read has exactly one failure shape at the use
// site — `null`. Whether the transport rejected, the backend answered unsuccessfully, or the
// envelope carried no payload, the page sees `null` and renders the degraded surface it was
// already written to render. A page must never have to distinguish those three.

test("returns the payload of a successful read", () => {
  // Arrange
  const result = { success: true, data: { name: "Back Squat" }, error: null };

  // Act
  const data = bestEffortData(result);

  // Assert
  assert.deepEqual(data, { name: "Back Squat" });
});

test("returns null for an unsuccessful envelope", () => {
  // Arrange
  const result = { success: false, data: null, error: "backend said no" };

  // Act / Assert
  assert.equal(bestEffortData(result), null);
});

test("returns null when a successful envelope carries no payload", () => {
  // Arrange — the shape a 204, or a backend that answered `success` with nothing, produces.
  const result = { success: true, data: null, error: null };

  // Act / Assert
  assert.equal(bestEffortData(result), null);
});

test("returns null for a read that rejected rather than returning an envelope", () => {
  // Arrange — `settleBestEffort` maps a rejection to `null`, so this is what the call site holds.
  const result = null;

  // Act / Assert
  assert.equal(bestEffortData(result), null);
});

test("preserves a falsy-but-present payload", () => {
  // Arrange — `false` and `0` are legitimate payloads; only absence means "could not read".
  // An `?? null` unwrap on `data` would be correct here, but a truthiness test would not.
  const flag = { success: true, data: false, error: null };
  const count = { success: true, data: 0, error: null };

  // Act / Assert
  assert.equal(bestEffortData(flag), false);
  assert.equal(bestEffortData(count), 0);
});

test("settles a resolving read to its own envelope", async () => {
  // Arrange
  const envelope = { success: true, data: [1, 2, 3], error: null };

  // Act
  const settled = await settleBestEffort(Promise.resolve(envelope));

  // Assert
  assert.equal(settled, envelope);
});

test("settles a rejecting read to null instead of propagating", async () => {
  // Arrange — `apiGet` rejects on a transport failure or a non-JSON response (an HTML proxy
  // error page), so an uncaught optional read inside a `Promise.all` takes the whole page
  // down. This is the guard against that, and the reason it is a named function.
  const read = Promise.reject(new Error("ECONNRESET"));

  // Act
  const settled = await settleBestEffort(read);

  // Assert
  assert.equal(settled, null);
});

test("does not let one rejecting read reject a Promise.all of several", async () => {
  // Arrange
  const required = Promise.resolve({ success: true, data: "kept", error: null });
  const optional = Promise.reject(new Error("ECONNRESET"));

  // Act
  const [requiredResult, optionalResult] = await Promise.all([
    required,
    settleBestEffort(optional),
  ]);

  // Assert
  assert.equal(bestEffortData(requiredResult), "kept");
  assert.equal(bestEffortData(optionalResult), null);
});
