import { test } from "node:test";
import assert from "node:assert/strict";

import { isPublicRoute } from "./route-access.ts";

// The allowlist is the whole security posture (finding #9): anything it does not
// return `true` for is gated by `auth.protect()`. So the tests pin both sides — the
// handful of genuinely public paths, and a representative slice of the private
// families that used to leak — plus the prefix edge cases a naive check gets wrong.

test("the landing and offline pages are public as exact matches", () => {
  // Arrange / Act / Assert — the signed-out welcome surface and the PWA fallback
  assert.equal(isPublicRoute("/"), true);
  assert.equal(isPublicRoute("/offline"), true);
});

test("the sign-in and sign-up subtrees are public, including Clerk sub-steps", () => {
  // Clerk owns catch-all sub-paths beneath these; the whole subtree must be reachable
  assert.equal(isPublicRoute("/sign-in"), true);
  assert.equal(isPublicRoute("/sign-in/factor-one"), true);
  assert.equal(isPublicRoute("/sign-in/sso-callback"), true);
  assert.equal(isPublicRoute("/sign-up"), true);
  assert.equal(isPublicRoute("/sign-up/verify-email-address"), true);
});

test("every private route family that used to leak is now gated", () => {
  // The ~9 families the old denylist missed, plus the ones it already covered
  for (const pathname of [
    "/dashboard",
    "/onboarding",
    "/profile/edit",
    "/protocols/5",
    "/sessions/1/live",
    "/history",
    "/exercises",
    "/exercises/42",
    "/train",
    "/metrics",
    "/analytics/strength",
    "/logs/new",
    "/shared/some-token",
    "/admin",
    "/api/exercises/7/image",
  ]) {
    assert.equal(isPublicRoute(pathname), false, `${pathname} must be private`);
  }
});

test("a path that only shares a public prefix is not public", () => {
  // `/sign-in-evil` starts with the *string* "/sign-in" but is a different route;
  // the exact-or-slash-boundary check must reject it rather than expose it.
  assert.equal(isPublicRoute("/sign-in-evil"), false);
  assert.equal(isPublicRoute("/sign-upgrade"), false);
});

test("a sub-path of an exact-only public route is not public", () => {
  // `/offline` is public but `/offline/anything` is not — exact paths do not spread.
  assert.equal(isPublicRoute("/offline/status"), false);
});
