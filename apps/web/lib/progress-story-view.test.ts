import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { toProgressStoryView, type ProgressStory } from "./progress-story-view.ts";
import { findStraightApostrophes } from "./copy-typography-policy.ts";

// `toProgressStoryView` turns the API's structured Progress Story (ADR-0127) into the
// headline sentence and the two compared Logged Sessions, each linking to its record. The
// API never sends a sentence: the copy, the unit and the links all live here.

function story(overrides: Partial<ProgressStory> = {}): ProgressStory {
  return {
    kind: "improved",
    axis: "reps_at_load",
    load_kind: "absolute",
    held: 60,
    delta: 2,
    latest: { logged_session_id: 12, performed_on: "2026-03-08", value: 10 },
    previous: { logged_session_id: 7, performed_on: "2026-03-01", value: 8 },
    ...overrides,
  };
}

test("states more reps at the same load as an improvement", () => {
  // Act
  const view = toProgressStoryView(story(), "kg");

  // Assert
  assert.equal(view.headline, "2 more reps at 60 kg than last time.");
});

test("says rep, not reps, for a one-rep improvement", () => {
  // Act
  const view = toProgressStoryView(
    story({ delta: 1, latest: { logged_session_id: 12, performed_on: "2026-03-08", value: 9 } }),
    "kg",
  );

  // Assert
  assert.equal(view.headline, "1 more rep at 60 kg than last time.");
});

test("states fewer reps plainly, with the delta unsigned", () => {
  // Act
  const declined = toProgressStoryView(story({ kind: "declined", delta: -1 }), "kg");
  const declinedTwo = toProgressStoryView(story({ kind: "declined", delta: -2 }), "kg");

  // Assert
  assert.equal(declined.headline, "1 fewer rep at 60 kg than last time.");
  assert.equal(declinedTwo.headline, "2 fewer reps at 60 kg than last time.");
});

test("acknowledges the same performance with its numbers", () => {
  // Arrange
  const same = { logged_session_id: 12, performed_on: "2026-03-08", value: 8 };
  const single = { logged_session_id: 12, performed_on: "2026-03-08", value: 1 };

  // Act
  const plural = toProgressStoryView(story({ kind: "unchanged", delta: 0, latest: same }), "kg");
  const singular = toProgressStoryView(
    story({
      kind: "unchanged",
      delta: 0,
      latest: single,
      previous: { ...single, logged_session_id: 7 },
    }),
    "kg",
  );

  // Assert
  assert.equal(plural.headline, "Same as last time: 8 reps at 60 kg.");
  assert.equal(singular.headline, "Same as last time: 1 rep at 60 kg.");
});

test("explains how to earn a story when there is nothing comparable", () => {
  // Act
  const view = toProgressStoryView(
    {
      kind: "insufficient",
      axis: null,
      load_kind: null,
      held: null,
      delta: null,
      latest: null,
      previous: null,
    },
    "kg",
  );

  // Assert — no invented comparison, no rows to link
  assert.equal(
    view.headline,
    "No comparable sessions yet. Repeat a load or a rep count from last time to see what changed.",
  );
  assert.deepEqual(view.rows, []);
});

test("projects the held load into the reader’s Weight Unit", () => {
  // Arrange — 60 lb, stored as exact kilograms
  const sixtyPounds = 60 * 0.45359237;

  // Act
  const view = toProgressStoryView(story({ held: sixtyPounds }), "lb");

  // Assert
  assert.equal(view.headline, "2 more reps at 60 lb than last time.");
  assert.equal(view.rows[0].performance, "8 reps at 60 lb");
});

test("keeps a fractional load at its displayed precision", () => {
  // Act
  const view = toProgressStoryView(story({ held: 62.5 }), "kg");

  // Assert
  assert.equal(view.headline, "2 more reps at 62.5 kg than last time.");
});

test("shows both compared sessions, previous first, each linking to its Logged Session", () => {
  // Act
  const view = toProgressStoryView(story(), "kg");

  // Assert
  assert.deepEqual(view.rows, [
    { label: "Last time", performance: "8 reps at 60 kg", date: "Mar 1, 2026", href: "/history/7" },
    { label: "Latest", performance: "10 reps at 60 kg", date: "Mar 8, 2026", href: "/history/12" },
  ]);
});

test("writes its copy with the typographic apostrophe", () => {
  // Arrange
  const source = readFileSync(resolve(import.meta.dirname, "progress-story-view.ts"), "utf8");

  // Act / Assert
  assert.deepEqual(findStraightApostrophes(source, "lib/progress-story-view.ts"), []);
});
