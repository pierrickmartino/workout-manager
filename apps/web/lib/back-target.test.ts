import { test } from "node:test";
import assert from "node:assert/strict";

import { appendFrom, backTarget, sanitizeInternalPath } from "./back-target.ts";

// `sanitizeInternalPath` is the single trust boundary for the `?from=` origin:
// it accepts only a same-origin absolute path so a crafted value can never turn
// the back link into an off-site navigation. Pure and server-free.

test("accepts a same-origin absolute path", () => {
  // Arrange / Act / Assert
  assert.equal(sanitizeInternalPath("/sessions/12"), "/sessions/12");
});

test("rejects a protocol-relative path that would leave the origin", () => {
  // Arrange — "//evil.com" is a host, not an internal path
  assert.equal(sanitizeInternalPath("//evil.com"), null);
});

test("rejects a backslash trick and an absolute URL", () => {
  // Assert — neither can be honoured as an internal navigation
  assert.equal(sanitizeInternalPath("/\\evil.com"), null);
  assert.equal(sanitizeInternalPath("https://evil.com"), null);
});

test("rejects absent, empty, and bare-slash origins", () => {
  // Assert — nothing trustworthy to point at
  assert.equal(sanitizeInternalPath(undefined), null);
  assert.equal(sanitizeInternalPath(null), null);
  assert.equal(sanitizeInternalPath(""), null);
  assert.equal(sanitizeInternalPath("/"), null);
});

// `backTarget` resolves the origin into the labelled BackLink destination: a
// recognised area keeps its own "Back to …" label; anything untrusted or
// unrecognised falls back to the Dashboard so the user is never stranded.

test("labels a Session origin as 'Back to session'", () => {
  // Arrange — the reported flow: an Exercise opened from its Session's card
  const target = backTarget("/sessions/12");

  // Assert — back returns to that exact Session
  assert.deepEqual(target, { href: "/sessions/12", label: "Back to session" });
});

test("labels a Protocol origin as 'Back to protocol'", () => {
  assert.deepEqual(backTarget("/protocols/5"), {
    href: "/protocols/5",
    label: "Back to protocol",
  });
});

test("labels the Analytics strength origin as 'Back to analytics'", () => {
  // Arrange — a strength-trajectory tile deep-links into Exercise Detail
  assert.deepEqual(backTarget("/analytics/strength"), {
    href: "/analytics/strength",
    label: "Back to analytics",
  });
});

test("labels a related-Exercise origin as 'Back to exercise'", () => {
  // Arrange — the origin carried forward through a Variation/Alternative hop
  assert.deepEqual(backTarget("/exercises/7"), {
    href: "/exercises/7",
    label: "Back to exercise",
  });
});

test("falls back to the Dashboard when no origin is given", () => {
  // Arrange — a shared/deep link or bookmark carries no `from`
  assert.deepEqual(backTarget(undefined), {
    href: "/dashboard",
    label: "Back to dashboard",
  });
});

test("falls back to the Dashboard for an untrusted origin", () => {
  // Assert — a crafted off-site `from` is never honoured as the back link
  assert.deepEqual(backTarget("//evil.com"), {
    href: "/dashboard",
    label: "Back to dashboard",
  });
});

test("falls back to the Dashboard for a valid but unlinked area", () => {
  // Arrange — a real internal path from an area that never links here
  assert.deepEqual(backTarget("/profile/edit"), {
    href: "/dashboard",
    label: "Back to dashboard",
  });
});

// `appendFrom` threads the origin onto an outgoing `/exercises/[id]` link so the
// destination — and every hop from it — can resolve a back target. An untrusted or
// absent origin is dropped rather than propagated.

test("appends the origin as an encoded ?from= on a query-less href", () => {
  // Arrange — a bare Exercise link from a Session card
  const href = appendFrom("/exercises/7", "/sessions/12");

  // Assert — the origin rides along, percent-encoded
  assert.equal(href, "/exercises/7?from=%2Fsessions%2F12");
});

test("appends with & when the href already carries a query", () => {
  // Arrange — a tab link that must keep both ?tab= and the origin
  const href = appendFrom("/exercises/7?tab=history", "/sessions/12");

  // Assert — the tab is preserved and the origin joins with &
  assert.equal(href, "/exercises/7?tab=history&from=%2Fsessions%2F12");
});

test("leaves the href untouched when the origin is untrusted or absent", () => {
  // Assert — junk is never propagated onto the next link
  assert.equal(appendFrom("/exercises/7", "//evil.com"), "/exercises/7");
  assert.equal(appendFrom("/exercises/7", undefined), "/exercises/7");
});
