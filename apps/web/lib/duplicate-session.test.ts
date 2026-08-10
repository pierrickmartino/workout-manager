import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DUPLICATE_FALLBACK_ERROR,
  toDuplicateResult,
} from "./duplicate-session.ts";

// `toDuplicateResult` turns the backend's duplicate envelope into the thin result the
// server action acts on: on success, the id and the href of the new standalone copy to
// navigate to; on failure, an honest error message with a fallback. Pure and
// server-free, so the redirect target and the error copy are unit-testable here and the
// action/component stay thin.

test("returns the new copy's id and href on success", () => {
  // Arrange — the backend returns the freshly created standalone Session
  const envelope = { success: true, data: { id: 42 }, error: null };

  // Act
  const result = toDuplicateResult(envelope as never);

  // Assert — navigate to the copy, not the source
  assert.deepEqual(result, { ok: true, sessionId: 42, href: "/sessions/42" });
});

test("surfaces the backend error message when the duplicate fails", () => {
  // Arrange — an envelope error (e.g. the source was not owned → 404 message)
  const envelope = { success: false, data: null, error: "Session not found" };

  // Act
  const result = toDuplicateResult(envelope as never);

  // Assert
  assert.deepEqual(result, { ok: false, error: "Session not found" });
});

test("falls back to a generic message when the failure carries no error text", () => {
  // Arrange — a failed envelope with no error string
  const envelope = { success: false, data: null, error: null };

  // Act
  const result = toDuplicateResult(envelope as never);

  // Assert — never a blank error
  assert.deepEqual(result, { ok: false, error: DUPLICATE_FALLBACK_ERROR });
});

test("treats a success envelope with no data as a failure", () => {
  // Arrange — success flag true but data missing (a malformed response)
  const envelope = { success: true, data: null, error: null };

  // Act
  const result = toDuplicateResult(envelope as never);

  // Assert — no href is fabricated from missing data
  assert.deepEqual(result, { ok: false, error: DUPLICATE_FALLBACK_ERROR });
});
