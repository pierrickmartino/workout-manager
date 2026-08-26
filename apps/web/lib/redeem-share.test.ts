import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RECEIVED_SHARE_CAVEAT_FALLBACK,
  REDEEM_FALLBACK_ERROR,
  redeemLanding,
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
  // Arrange — the backend returns the freshly redeemed standalone Session (unflagged redeem)
  const envelope = {
    success: true,
    data: { id: 99, caveat: { applies: false, message: null } },
    error: null,
  };

  // Act
  const result = toRedeemResult(envelope as never);

  // Assert — land on the new copy, never the source; no caveat flagged
  assert.deepEqual(result, {
    ok: true,
    sessionId: 99,
    href: "/sessions/99",
    caveat: { applies: false, message: null },
  });
});

test("redeem result carries the Received-Share caveat for a constrained redeemer", () => {
  // Arrange — the redeemer has a Sensitive Constraint, so the backend flags the ADR-0058 caveat
  const envelope = {
    success: true,
    data: {
      id: 42,
      caveat: {
        applies: true,
        message: "This session was built for another user…",
      },
    },
    error: null,
  };

  // Act
  const result = toRedeemResult(envelope as never);

  // Assert — the copy still lands (the Redeem is never blocked) and the caveat is carried through
  assert.equal(result.ok, true);
  assert.deepEqual((result as { caveat: unknown }).caveat, {
    applies: true,
    message: "This session was built for another user…",
  });
});

test("redeem result defaults to no caveat when the backend omits one", () => {
  // A redeem response without a `caveat` field (e.g. an older backend) collapses to no caveat,
  // so the caller never has to reason about an absent field.
  const envelope = { success: true, data: { id: 7 }, error: null };

  const result = toRedeemResult(envelope as never);

  assert.deepEqual((result as { caveat: unknown }).caveat, {
    applies: false,
    message: null,
  });
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

// --- redeemLanding: the hold-vs-redirect safety decision (ADR-0058, issue #399) ---------

test("an unflagged redeem lands by redirecting straight to the saved copy", () => {
  // Arrange — a successful, unconstrained redeem
  const result = {
    ok: true as const,
    sessionId: 12,
    href: "/sessions/12",
    caveat: { applies: false, message: null },
  };

  // Act
  const landing = redeemLanding(result);

  // Assert — no caveat to show, so the recipient is taken to the plan
  assert.deepEqual(landing, { kind: "redirect", href: "/sessions/12" });
});

test("a flagged redeem is held on the page with the caveat, never redirected", () => {
  // Arrange — a constrained redeemer: the copy is saved but the caveat must show prominently
  const result = {
    ok: true as const,
    sessionId: 5,
    href: "/sessions/5",
    caveat: { applies: true, message: "Built for another user…" },
  };

  // Act
  const landing = redeemLanding(result);

  // Assert — a caveat landing (held on the page), carrying the message and the link to the copy
  assert.deepEqual(landing, {
    kind: "caveat",
    message: "Built for another user…",
    href: "/sessions/5",
  });
});

test("a flagged redeem with no message still holds — never silently redirects", () => {
  // The safety hold keys on `applies` alone: a flagged redeem whose message is somehow missing
  // must still be held (with the fallback wording), never fall through to an auto-redirect — the
  // silent auto-promotion ADR-0058 forbids.
  const result = {
    ok: true as const,
    sessionId: 8,
    href: "/sessions/8",
    caveat: { applies: true, message: null },
  };

  const landing = redeemLanding(result);

  assert.equal(landing.kind, "caveat");
  assert.equal(
    (landing as { message: string }).message,
    RECEIVED_SHARE_CAVEAT_FALLBACK,
  );
});
