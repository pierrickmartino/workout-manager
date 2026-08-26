import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SHARE_FALLBACK_ERROR,
  shareUrl,
  toShareLinkResult,
} from "./share-link.ts";

// `toShareLinkResult` turns the backend's create-link envelope into the sharer's result — the
// token and the shareable recipient URL to copy, or an honest error. Pure and server-free, so the
// URL shape (CONTEXT: Share Link — it is a link, not a code) and the error copy are unit-tested
// here and the action/component stay thin.

test("builds the recipient URL from the token and origin", () => {
  assert.equal(
    shareUrl("tok-abc", "https://app.example"),
    "https://app.example/shared/tok-abc",
  );
});

test("url-encodes a token so a url-safe token stays path-safe", () => {
  assert.equal(
    shareUrl("a b/c", "https://app.example"),
    "https://app.example/shared/a%20b%2Fc",
  );
});

test("returns the token and shareable URL on success", () => {
  // Arrange — the backend returns the active Share Link
  const envelope = {
    success: true,
    data: { token: "tok-abc", session_id: 7, is_revoked: false },
    error: null,
  };

  // Act
  const result = toShareLinkResult(envelope as never, "https://app.example");

  // Assert — the sharer gets the copyable recipient URL, never the raw token as a URL
  assert.deepEqual(result, {
    ok: true,
    token: "tok-abc",
    url: "https://app.example/shared/tok-abc",
  });
});

test("surfaces the backend error when producing a link fails", () => {
  // Arrange — a 409 on a Protocol member, say
  const envelope = {
    success: false,
    data: null,
    error: "A session inside a protocol can't be shared.",
  };

  // Act
  const result = toShareLinkResult(envelope as never, "https://app.example");

  // Assert
  assert.deepEqual(result, {
    ok: false,
    error: "A session inside a protocol can't be shared.",
  });
});

test("falls back to a generic message when the failure carries no error text", () => {
  const envelope = { success: false, data: null, error: null };
  const result = toShareLinkResult(envelope as never, "https://app.example");
  assert.deepEqual(result, { ok: false, error: SHARE_FALLBACK_ERROR });
});

test("treats a success envelope with no data as a failure", () => {
  const envelope = { success: true, data: null, error: null };
  const result = toShareLinkResult(envelope as never, "https://app.example");
  assert.deepEqual(result, { ok: false, error: SHARE_FALLBACK_ERROR });
});
