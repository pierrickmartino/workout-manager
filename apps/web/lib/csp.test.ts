import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildContentSecurityPolicy,
  buildTrustedTypesReportOnly,
} from "./csp.ts";

// The CSP builder is the single source of truth for the app's DOM-XSS policy
// (ADR-0036). It is pure — no Clerk import, no I/O — and returns the config we
// hand to Clerk's `contentSecurityPolicy` middleware option. These tests pin the
// security acceptance criteria of #257 so a future loosening turns a test red.

test("requests strict mode so script-src is nonce + 'strict-dynamic' with no host allowlist", () => {
  // Arrange / Act
  const config = buildContentSecurityPolicy();

  // Assert — strict mode is the mechanism that yields the nonce/strict-dynamic
  // script policy and keeps 'unsafe-inline' out of script-src entirely.
  assert.equal(config.strict, true);
});

test("worker-src carries both 'self' and blob: — bounds foreign SWs while allowing Clerk's blob workers", () => {
  // Act
  const workerSrc = buildContentSecurityPolicy().directives["worker-src"];

  // Assert — 'self' blocks cross-origin service-worker registration (ADR-0028's
  // bound); blob: is required for Clerk's web workers (diverges from #254's bare
  // 'self', see ADR-0036). Both must be present.
  assert.ok(workerSrc?.includes("'self'"), "worker-src must include 'self'");
  assert.ok(workerSrc?.includes("blob:"), "worker-src must include blob:");
});

test("img-src allows self, Clerk's image host, and data: URIs", () => {
  // Act
  const imgSrc = buildContentSecurityPolicy().directives["img-src"];

  // Assert — self + Clerk avatars + data: (PWA icons, inline images)
  assert.ok(imgSrc?.includes("'self'"), "img-src must include 'self'");
  assert.ok(
    imgSrc?.includes("https://img.clerk.com"),
    "img-src must allow Clerk's image host",
  );
  assert.ok(imgSrc?.includes("data:"), "img-src must include data:");
});

test("style-src allows 'unsafe-inline' — the bounded concession for next/font, Tailwind, Clerk UI", () => {
  // Act
  const styleSrc = buildContentSecurityPolicy().directives["style-src"];

  // Assert — inline styles are permitted (they cannot execute script under the
  // strict script-src); this is deliberate per ADR-0036, not an oversight.
  assert.ok(styleSrc?.includes("'self'"), "style-src must include 'self'");
  assert.ok(
    styleSrc?.includes("'unsafe-inline'"),
    "style-src must allow 'unsafe-inline'",
  );
});

test("never contributes a script-src — it defers to Clerk strict mode, so no 'unsafe-inline' can leak in", () => {
  // Act — the builder must not define script-src itself; Clerk's strict mode owns
  // it (nonce + 'strict-dynamic'). Any script-src we set risks weakening it.
  const scriptSrc = buildContentSecurityPolicy().directives["script-src"];

  // Assert — (defensively) never carries 'unsafe-inline', and absent entirely.
  // The defensive `includes` check runs first: `assert.equal(scriptSrc, undefined)`
  // asserts `scriptSrc is undefined`, which narrows the value to `never` for the
  // rest of the block and would make a later `.includes` fail to type-check.
  assert.ok(!(scriptSrc ?? []).includes("'unsafe-inline'"));
  assert.equal(scriptSrc, undefined);
});

test("sets the hardening floor: default-src self, object-src none, base-uri self, frame-ancestors none, form-action self", () => {
  // Act
  const d = buildContentSecurityPolicy().directives;

  // Assert — the standard injection/clickjacking floor the whole-app CSP owns.
  assert.deepEqual(d["default-src"], ["'self'"]);
  assert.deepEqual(d["object-src"], ["'none'"]); // no <object>/<embed> vectors
  assert.deepEqual(d["base-uri"], ["'self'"]); // no injected <base> URL rewrite
  assert.deepEqual(d["frame-ancestors"], ["'none'"]); // no clickjacking embed
  assert.deepEqual(d["form-action"], ["'self'"]); // no form post to attacker origin
});

test("report-only Trusted Types header requires trusted types for script", () => {
  // Act — the value for the separate Content-Security-Policy-Report-Only header.
  const reportOnly = buildTrustedTypesReportOnly();

  // Assert — Trusted Types is observed, not enforced, in this pass (ADR-0036).
  assert.match(reportOnly, /require-trusted-types-for 'script'/);
});

test("enforcing config carries no Trusted Types directive — it stays report-only until proven clean", () => {
  // Act
  const keys = Object.keys(buildContentSecurityPolicy().directives);

  // Assert — nothing trusted-types-shaped leaks into the *enforcing* policy; that
  // would block Clerk/React 19 for real. Enforcement is a separate, evidence-gated step.
  assert.ok(!keys.some((k) => k.includes("trusted-types")));
});
