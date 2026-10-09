import { test } from "node:test";
import assert from "node:assert/strict";

import {
  adoptedProtocolHref,
  setAsideNote,
  setAsideProtocolId,
} from "./protocol-supersede.ts";
import type { ProtocolProgress } from "./protocols-types.ts";

// A minimal Protocol fixture — only the fields the note reads (`id`, `label`) carry
// meaning; the rest are harmless placeholders so the fixture type-checks.
function makeProtocol(
  overrides: Partial<ProtocolProgress> = {},
): ProtocolProgress {
  return {
    id: 1,
    clerk_user_id: "user_1",
    training_type: "strength",
    objective: "hypertrophy",
    sessions_per_week: 3,
    weeks: 4,
    duration_minutes: 45,
    name: null,
    label: "hypertrophy · strength",
    sessions: [],
    next_session: null,
    completed_count: 0,
    calibration: 0,
    calibration_min: -3,
    calibration_max: 3,
    ...overrides,
  };
}

test("generation lands on the adopted Protocol alone when nothing was Current", () => {
  // Arrange: the Home empty state — there was no Current Protocol to set aside.
  // Act
  const href = adoptedProtocolHref(12, null);
  // Assert: no trace of a set-aside Protocol to report.
  assert.equal(href, "/protocols/12");
});

test("generation lands on the adopted Protocol carrying the one it set aside", () => {
  // Arrange: Protocol 4 was Current when Protocol 12 was generated and adopted.
  // Act
  const href = adoptedProtocolHref(12, 4);
  // Assert
  assert.equal(href, "/protocols/12?set_aside=4");
});

test("the set-aside Protocol is read back from the address", () => {
  // Arrange / Act
  const id = setAsideProtocolId("4", 12);
  // Assert
  assert.equal(id, 4);
});

test("an absent, malformed, or self-referring set-aside address reads nothing", () => {
  // Arrange / Act / Assert: nothing to look up, so no extra read and no note.
  assert.equal(setAsideProtocolId(undefined, 12), null);
  assert.equal(setAsideProtocolId("", 12), null);
  assert.equal(setAsideProtocolId("abc", 12), null);
  assert.equal(setAsideProtocolId("4.5", 12), null);
  assert.equal(setAsideProtocolId("-4", 12), null);
  assert.equal(setAsideProtocolId(["4", "5"], 12), null);
  // A Protocol cannot have set itself aside.
  assert.equal(setAsideProtocolId("12", 12), null);
});

test("the note names the set-aside Protocol and points at the Protocols screen", () => {
  // Arrange: the previous Protocol was resolved; the adopted one (12) is now Current.
  const previous = makeProtocol({ id: 4, label: "Summer Strength" });
  // Act
  const note = setAsideNote(previous, 12);
  // Assert
  assert.deepEqual(note, { label: "Summer Strength", href: "/protocols" });
});

test("no note when the set-aside Protocol could not be read", () => {
  // Arrange: not owned, deleted since, or the read failed.
  // Act
  const note = setAsideNote(null, 12);
  // Assert
  assert.equal(note, null);
});

test("no note once the Protocol it names is Current again", () => {
  // Arrange: the user Switched back to Protocol 4 and then revisited the address.
  const previous = makeProtocol({ id: 4, label: "Summer Strength" });
  // Act
  const note = setAsideNote(previous, 4);
  // Assert: telling them it was set aside would now be false.
  assert.equal(note, null);
});
