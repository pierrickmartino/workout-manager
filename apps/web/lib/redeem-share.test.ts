import { test } from "node:test";
import assert from "node:assert/strict";

import {
  REDEEM_FALLBACK_ERROR,
  toRedeemResult,
  toSharePreviewView,
} from "./redeem-share.ts";
import { GENERIC_AUTHOR_LABEL } from "./session-author.ts";

// The recipient's two view-models (ADR-0057, issue #398): `toSharePreviewView` turns the preview
// envelope into a display model (valid + name/type/author byline, or a bare invalid state), and
// `toRedeemResult` turns the redeem envelope into the id + href to land on, or an honest error.
// Pure and server-free, so the "no longer available" collapse and the redirect target are
// unit-tested here and the page/action stay thin.

test("maps a valid preview to name, training type, and author byline", () => {
  // Arrange — the linked Session's resolved details
  const envelope = {
    success: true,
    data: {
      valid: true,
      display_name: "Leg Day",
      training_type: "strength",
      author: { display_name: "Dana" },
    },
    error: null,
  };

  // Act
  const view = toSharePreviewView(envelope as never);

  // Assert
  assert.deepEqual(view, {
    valid: true,
    displayName: "Leg Day",
    trainingType: "strength",
    authorByline: "by Dana",
  });
});

test("falls back to the generic author label when the creator has no name", () => {
  // Arrange — a preview whose Author never set a Profile name
  const envelope = {
    success: true,
    data: {
      valid: true,
      display_name: "strength · 2026-08-26",
      training_type: "strength",
      author: { display_name: null },
    },
    error: null,
  };

  // Act
  const view = toSharePreviewView(envelope as never);

  // Assert — one shared fallback with the Session view (never a fabricated name)
  assert.equal(view.valid, true);
  assert.equal(
    (view as { authorByline: string }).authorByline,
    `by ${GENERIC_AUTHOR_LABEL}`,
  );
});

test("collapses a revoked or unknown link to a bare invalid state", () => {
  // Arrange — the backend reports the link invalid (still a 200 envelope), with null details
  const envelope = {
    success: true,
    data: {
      valid: false,
      display_name: null,
      training_type: null,
      author: { display_name: null },
    },
    error: null,
  };

  // Act
  const view = toSharePreviewView(envelope as never);

  // Assert — nothing about the once-linked Session leaks into the view
  assert.deepEqual(view, { valid: false });
});

test("treats a failed preview envelope as an invalid link", () => {
  const envelope = { success: false, data: null, error: "boom" };
  const view = toSharePreviewView(envelope as never);
  assert.deepEqual(view, { valid: false });
});

test("redeem result points at the recipient's new copy on success", () => {
  // Arrange — the backend returns the freshly redeemed standalone Session
  const envelope = { success: true, data: { id: 99 }, error: null };

  // Act
  const result = toRedeemResult(envelope as never);

  // Assert — land on the new copy, never the source
  assert.deepEqual(result, { ok: true, sessionId: 99, href: "/sessions/99" });
});

test("redeem result surfaces the backend error on an invalid link", () => {
  const envelope = {
    success: false,
    data: null,
    error: "This share link is no longer valid.",
  };
  const result = toRedeemResult(envelope as never);
  assert.deepEqual(result, {
    ok: false,
    error: "This share link is no longer valid.",
  });
});

test("redeem result falls back to a generic message when none is supplied", () => {
  const envelope = { success: false, data: null, error: null };
  const result = toRedeemResult(envelope as never);
  assert.deepEqual(result, { ok: false, error: REDEEM_FALLBACK_ERROR });
});
