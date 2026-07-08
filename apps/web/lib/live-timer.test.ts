import { test } from "node:test";
import assert from "node:assert/strict";

import {
  elapsedSeconds,
  durationSeconds,
  formatElapsed,
  resolveRestSeconds,
  restTargetEnd,
  restRemainingSeconds,
  adjustRestTargetEnd,
  DEFAULT_REST_SECONDS,
  REST_ADJUST_STEP_SECONDS,
} from "./live-timer.ts";

// The Live Session timers (issue #88 — F2·S3) are pure timestamp math. Elapsed and
// duration are always computed wall-clock, from a stored start compared to a passed
// `now` — never a decrementing counter — so a backgrounded/locked tab can't corrupt
// them (ADR-0014).

test("elapsedSeconds is whole seconds between start and now", () => {
  // Arrange — 90.75 s of wall-clock between the two timestamps
  const start = 1_000_000;
  const now = start + 90_750;

  // Act / Assert — floored to whole seconds
  assert.equal(elapsedSeconds(start, now), 90);
});

test("elapsedSeconds is 0 before a session has started", () => {
  // A not-yet-started session has no start timestamp.
  assert.equal(elapsedSeconds(null, 1_000_000), 0);
});

test("elapsedSeconds never goes negative if the clock jumps backwards", () => {
  // A backwards clock adjustment must not produce a negative elapsed time.
  assert.equal(elapsedSeconds(2_000, 1_000), 0);
});

test("durationSeconds measures start → last activity, excluding the idle tail", () => {
  // Arrange — training ran start→last activity; `now` is well past the final set
  const start = 1_000_000;
  const lastActivity = start + 1_830_000; // 30m30s of actual training

  // Act / Assert — the idle time after the last set is never part of the figure
  assert.equal(durationSeconds(start, lastActivity), 1830);
});

test("durationSeconds is null when the session was never tracked", () => {
  // No start (or no activity) means no measured duration — the static form's case.
  assert.equal(durationSeconds(null, 1_000_000), null);
  assert.equal(durationSeconds(1_000_000, null), null);
  assert.equal(durationSeconds(null, null), null);
});

test("durationSeconds never goes negative", () => {
  // Last activity can't precede the start; guard the arithmetic anyway.
  assert.equal(durationSeconds(2_000, 1_000), 0);
});

test("formatElapsed renders M:SS under an hour", () => {
  assert.equal(formatElapsed(0), "0:00");
  assert.equal(formatElapsed(9), "0:09");
  assert.equal(formatElapsed(90), "1:30");
  assert.equal(formatElapsed(600), "10:00");
});

test("formatElapsed renders H:MM:SS once past an hour", () => {
  assert.equal(formatElapsed(3600), "1:00:00");
  assert.equal(formatElapsed(3661), "1:01:01");
});

// The rest countdown (issue #89 — F2·S4). Rest between sets defaults to the
// Exercise Prescription's `rest_seconds`, with a named-constant fallback when the
// prescription has none. Like the elapsed timer, it is wall-clock — a stored
// target-end timestamp compared to a passed `now` — so a phone lock or refresh
// mid-rest can't corrupt it.

test("resolveRestSeconds uses the prescription's rest_seconds when present", () => {
  // A prescription that names its own rest keeps it.
  assert.equal(resolveRestSeconds(120), 120);
});

test("resolveRestSeconds falls back to the default when the prescription has none", () => {
  // An absent (null) rest_seconds falls back to the named constant.
  assert.equal(resolveRestSeconds(null), DEFAULT_REST_SECONDS);
});

test("resolveRestSeconds prefers the user's profile default over the prescription (issue #121)", () => {
  // When the user has set a default rest on their Fitness Profile it overrides
  // the prescription's own rest — the profile setting acts as a global default.
  assert.equal(resolveRestSeconds(120, 60), 60);
});

test("resolveRestSeconds falls back to the prescription when the user set no default", () => {
  // A null profile default leaves the prescription's own rest in charge, so
  // existing users are unaffected.
  assert.equal(resolveRestSeconds(120, null), 120);
});

test("resolveRestSeconds falls back to the constant when neither default nor prescription is set", () => {
  // No profile default and no prescription rest → the hard-coded fallback.
  assert.equal(resolveRestSeconds(null, null), DEFAULT_REST_SECONDS);
});

test("restTargetEnd is the wall-clock instant the rest elapses", () => {
  // Arrange — a 90 s rest started at a known instant
  const now = 1_000_000;

  // Act / Assert — target-end is stored as `now` plus the rest in milliseconds
  assert.equal(restTargetEnd(now, 90), now + 90_000);
});

test("restRemainingSeconds counts down whole seconds, rounding a part-second up", () => {
  // Arrange — 89.25 s of wall-clock still left until the target-end
  const now = 1_000_000;
  const targetEnd = now + 89_250;

  // Act / Assert — a countdown shows the ceiling, so it reads 1:30 for the first
  // tick and only hits 0 the instant it truly elapses
  assert.equal(restRemainingSeconds(targetEnd, now), 90);
});

test("restRemainingSeconds clamps to 0 once the rest has elapsed", () => {
  // `now` is past the target-end — the rest is over, never a negative remainder.
  const targetEnd = 1_000_000;
  assert.equal(restRemainingSeconds(targetEnd, targetEnd + 5_000), 0);
});

test("restRemainingSeconds is 0 when no rest is running", () => {
  // No target-end (null) means no active rest countdown.
  assert.equal(restRemainingSeconds(null, 1_000_000), 0);
});

test("adjustRestTargetEnd extends the rest by +15", () => {
  // Arrange — 30 s left on the rest
  const now = 1_000_000;
  const targetEnd = now + 30_000;

  // Act — the `+15` control pushes the target-end out
  const extended = adjustRestTargetEnd(targetEnd, REST_ADJUST_STEP_SECONDS, now);

  // Assert — 15 s more remain
  assert.equal(restRemainingSeconds(extended, now), 45);
});

test("adjustRestTargetEnd shortens the rest by −15", () => {
  // Arrange — 30 s left on the rest
  const now = 1_000_000;
  const targetEnd = now + 30_000;

  // Act — the `−15` control pulls the target-end in
  const shortened = adjustRestTargetEnd(targetEnd, -REST_ADJUST_STEP_SECONDS, now);

  // Assert — 15 s less remain
  assert.equal(restRemainingSeconds(shortened, now), 15);
});

test("adjustRestTargetEnd never pulls the target-end before now", () => {
  // Arrange — only 5 s left, so a −15 would push the target-end into the past
  const now = 1_000_000;
  const targetEnd = now + 5_000;

  // Act — subtracting more than remains
  const clamped = adjustRestTargetEnd(targetEnd, -REST_ADJUST_STEP_SECONDS, now);

  // Assert — the rest ends now (0 remaining), never banking negative time that a
  // later `+15` would have to climb back out of
  assert.equal(clamped, now);
  assert.equal(restRemainingSeconds(clamped, now), 0);
});
