import { test, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// The seam imports Clerk's server `auth()` and the `server-only` guard. Neither is
// resolvable in a plain Node test context, so we stub both at the module boundary
// (via --experimental-test-module-mocks) and drive the seam through a mocked
// `fetch`, asserting the request it produces and the envelope it returns.
mock.module("server-only", { namedExports: {} });
mock.module("@clerk/nextjs/server", {
  namedExports: {
    auth: async () => ({ getToken: async () => "test-jwt" }),
  },
});

// Import after the mocks are registered so the seam binds to the stubs.
const { apiGet, apiSend } = await import("./api.ts");

// Capture the arguments each `fetch` call receives and hand back a canned envelope.
let lastFetch: { url: string; init: RequestInit | undefined };
function stubFetch(payload: unknown): void {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    lastFetch = { url, init };
    return { json: async () => payload } as Response;
  }) as typeof fetch;
}

const realFetch = globalThis.fetch;
beforeEach(() => {
  lastFetch = { url: "", init: undefined };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("apiGet requests the base-prefixed path with the Clerk JWT attached", async () => {
  // Arrange — a canned envelope so the call resolves
  stubFetch({ success: true, data: 1, error: null });

  // Act
  await apiGet("/api/home");

  // Assert — base URL prefix and the Bearer header from the stubbed token
  assert.equal(lastFetch.url, "http://localhost:8000/api/home");
  const headers = lastFetch.init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer test-jwt");
});

test("apiGet returns the parsed envelope unchanged (raw-envelope contract)", async () => {
  // Arrange — the exact wire shape the backend returns
  const envelope = { success: true, data: { greeting: "hi" }, error: null };
  stubFetch(envelope);

  // Act
  const result = await apiGet<{ greeting: string }>("/api/home");

  // Assert — the seam neither unwraps nor reshapes; the caller gets the raw envelope
  assert.deepEqual(result, envelope);
});

test("apiSend with a body sets Content-Type and sends the JSON-stringified body", async () => {
  // Arrange
  stubFetch({ success: true, data: null, error: null });

  // Act — a write with a payload (the PUT/POST-with-body shape)
  await apiSend("/api/profile", "PUT", { name: "Ada" });

  // Assert — base-prefixed URL, method, JSON header, and stringified body
  assert.equal(lastFetch.url, "http://localhost:8000/api/profile");
  assert.equal(lastFetch.init?.method, "PUT");
  const headers = lastFetch.init?.headers as Record<string, string>;
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers.Authorization, "Bearer test-jwt");
  assert.equal(lastFetch.init?.body, JSON.stringify({ name: "Ada" }));
});

test("apiSend without a body sends no Content-Type and no body (the substitute invariant)", async () => {
  // Arrange
  stubFetch({ success: true, data: null, error: null });

  // Act — the bodyless POST used by substitutePrescription
  await apiSend("/api/sessions/1/prescriptions/2/substitute", "POST");

  // Assert — the JWT is still attached, but no content is typed and none is sent
  const headers = lastFetch.init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer test-jwt");
  assert.equal(headers["Content-Type"], undefined);
  assert.equal(lastFetch.init?.body, undefined);
});

test("apiSend returns the parsed envelope unchanged", async () => {
  // Arrange
  const envelope = { success: false, data: null, error: "nope" };
  stubFetch(envelope);

  // Act
  const result = await apiSend("/api/profile", "PUT", { name: "Ada" });

  // Assert — writes surface the raw envelope too; unwrap stays at the caller
  assert.deepEqual(result, envelope);
});
