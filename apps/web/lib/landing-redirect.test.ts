import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// The seam imports `server-only` and Clerk's server `auth()`; neither resolves in
// a plain Node context, so we stub both at the module boundary (via
// --experimental-test-module-mocks) and drive the routing decision by varying
// what `auth()` yields.
let authImpl: () => Promise<{ userId: string | null }>;

mock.module("server-only", { namedExports: {} });
mock.module("@clerk/nextjs/server", {
  namedExports: {
    auth: async () => authImpl(),
  },
});

// Import after the mocks are registered so the seam binds to the stubs.
const { resolveLandingRedirect } = await import("./landing-redirect.ts");

beforeEach(() => {
  authImpl = async () => ({ userId: null });
});

test("routes an authenticated visitor to the dashboard", async () => {
  // Arrange — a signed-in request
  authImpl = async () => ({ userId: "user_123" });

  // Act
  const target = await resolveLandingRedirect();

  // Assert — bounce to the dashboard
  assert.equal(target, "/dashboard");
});

test("keeps a signed-out visitor on the welcome surface", async () => {
  // Arrange — no active session
  authImpl = async () => ({ userId: null });

  // Act
  const target = await resolveLandingRedirect();

  // Assert — null means stay on `/` and render the welcome/sign-in view
  assert.equal(target, null);
});

test("fails closed: an auth/transport error keeps the visitor on welcome", async () => {
  // Arrange — auth() blows up (e.g. Clerk unreachable)
  authImpl = async () => {
    throw new Error("clerk unreachable");
  };

  // Act
  const target = await resolveLandingRedirect();

  // Assert — no bounce; the visitor lands on the welcome/sign-in surface
  assert.equal(target, null);
});
