import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAIN_CONTENT_ID,
  SKIP_LINK_HREF,
  SKIP_LINK_LABEL,
  NAV_LABELS,
} from "./shell-a11y.ts";

// The shell's a11y wiring is presentation-adjacent (skip link + landmark labels), but the
// *contract* between the pieces is pure data and belongs under test: the skip link's href
// must always target the <main> id, and the two <nav> landmarks must carry distinct,
// non-empty labels. Rendering layout.tsx (async server component + Clerk + next/font) is
// out of reach for `node --test`, so these assertions guard the parts that can drift
// silently — a renamed id whose href isn't updated, or a label emptied/duplicated
// (finding #11).

test("skip link href targets the main-content id", () => {
  // Arrange / Act / Assert — the href is the fragment reference to MAIN_CONTENT_ID.
  assert.equal(SKIP_LINK_HREF, `#${MAIN_CONTENT_ID}`);
});

test("main-content id is a non-empty fragment-safe token", () => {
  // Arrange / Act / Assert — an empty or whitespace id would make the skip target unreachable.
  assert.ok(MAIN_CONTENT_ID.length > 0);
  assert.ok(!/\s/.test(MAIN_CONTENT_ID));
});

test("skip link has visible label text", () => {
  // Arrange / Act / Assert — the link is visible on focus, so it needs real text.
  assert.ok(SKIP_LINK_LABEL.trim().length > 0);
});

test("the two nav landmarks have distinct, non-empty labels", () => {
  // Arrange
  const labels = [NAV_LABELS.account, NAV_LABELS.primary];
  // Act
  const distinct = new Set(labels);
  // Assert — distinctness is what makes the landmark rotor legible.
  assert.equal(distinct.size, labels.length);
  for (const label of labels) {
    assert.ok(label.trim().length > 0);
  }
});
