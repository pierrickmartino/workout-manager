import { test } from "node:test";
import assert from "node:assert/strict";

import { wakeLockAction, type Phase } from "./wake-lock.ts";

// The Screen Wake Lock decision (issue #386 — ADR-0055) is pure: given whether the
// document is visible, the Live Session lifecycle phase, whether the Keep Screen
// Awake preference is on, and whether a lock is already held, it returns the effect
// to run — "acquire" | "release" | "noop". All raw `navigator.wakeLock` I/O lives in
// the `useWakeLock` shell; this seam holds the whole decision, so it is unit-tested
// with no DOM. The lock is held in the `live` phase only.

test("acquires when visible, live, preference on, and no lock held", () => {
  // Arrange — the exact conditions the lock should be taken under
  const visible = true;
  const phase: Phase = "live";
  const prefEnabled = true;
  const held = false;

  // Act
  const action = wakeLockAction(visible, phase, prefEnabled, held);

  // Assert
  assert.equal(action, "acquire");
});

test("no-ops when the wanted lock is already held", () => {
  // Already holding the lock under live conditions — nothing to do.
  assert.equal(wakeLockAction(true, "live", true, true), "noop");
});

test("releases a held lock when the tab is hidden", () => {
  // The OS auto-releases on hide, but the decision still says release so our own
  // bookkeeping matches reality before the re-acquire on return.
  assert.equal(wakeLockAction(false, "live", true, true), "release");
});

test("releases a held lock when the preference is turned off", () => {
  assert.equal(wakeLockAction(true, "live", false, true), "release");
});

test("releases a held lock when leaving the live phase", () => {
  // Held only in `live` — finishing/summary/blocked/deciding all release.
  assert.equal(wakeLockAction(true, "summary", true, true), "release");
  assert.equal(wakeLockAction(true, "blocked", true, true), "release");
  assert.equal(wakeLockAction(true, "deciding", true, true), "release");
});

test("no-ops when not live and no lock is held", () => {
  // Nothing to acquire outside `live`, nothing to release without a lock.
  assert.equal(wakeLockAction(true, "deciding", true, false), "noop");
  assert.equal(wakeLockAction(true, "summary", true, false), "noop");
  assert.equal(wakeLockAction(true, "blocked", true, false), "noop");
});

test("no-ops when live and preference on but the tab is hidden and no lock held", () => {
  // A hidden tab can't hold a lock; there is nothing to acquire until it returns.
  assert.equal(wakeLockAction(false, "live", true, false), "noop");
});

test("no-ops when the preference is off and no lock is held", () => {
  assert.equal(wakeLockAction(true, "live", false, false), "noop");
});

test("re-acquires across a visible → hidden → visible cycle", () => {
  // The re-acquisition is the actual feature (ADR-0055): the OS drops the lock on
  // hide, so returning to visible must take it again rather than stay released.

  // Arrange — start live, visible, preference on, nothing held
  const phase: Phase = "live";
  const prefEnabled = true;

  // Act / Assert — foreground: acquire, then it is held
  assert.equal(wakeLockAction(true, phase, prefEnabled, false), "acquire");

  // Tab hides while we hold the lock → release (bookkeeping catches the auto-release)
  assert.equal(wakeLockAction(false, phase, prefEnabled, true), "release");

  // OS has auto-released, so we hold nothing while hidden → noop
  assert.equal(wakeLockAction(false, phase, prefEnabled, false), "noop");

  // Back to visible with nothing held → acquire again (the real work)
  assert.equal(wakeLockAction(true, phase, prefEnabled, false), "acquire");
});

test("re-acquires when resuming an unfinished Live Session back in the live phase", () => {
  // Resuming lands the screen in `live` again; visible + preference on + nothing held
  // takes the lock exactly as a fresh start would.
  assert.equal(wakeLockAction(true, "live", true, false), "acquire");
});
