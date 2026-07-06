import { test } from "node:test";
import assert from "node:assert/strict";

import {
  elapsedSeconds,
  durationSeconds,
  formatElapsed,
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
