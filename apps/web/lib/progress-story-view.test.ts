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
    body_weight: null,
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
      body_weight: null,
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

// A load-at-reps story: 5 reps held, 60 kg last time, 62.5 kg now.
function loadAtReps(overrides: Partial<ProgressStory> = {}): ProgressStory {
  return story({
    axis: "load_at_reps",
    held: 5,
    delta: 2.5,
    latest: { logged_session_id: 12, performed_on: "2026-03-08", value: 62.5 },
    previous: { logged_session_id: 7, performed_on: "2026-03-01", value: 60 },
    ...overrides,
  });
}

test("states a heavier load at a shared rep count as a signed gain", () => {
  // Act
  const view = toProgressStoryView(loadAtReps(), "kg");

  // Assert
  assert.equal(view.headline, "+2.5 kg for 5 reps.");
});

test("states a lighter load at a shared rep count with a minus sign, plainly", () => {
  // Act
  const view = toProgressStoryView(
    loadAtReps({
      kind: "declined",
      delta: -2.5,
      latest: { logged_session_id: 12, performed_on: "2026-03-08", value: 57.5 },
    }),
    "kg",
  );

  // Assert — a typographic minus, not a hyphen
  assert.equal(view.headline, "−2.5 kg for 5 reps.");
});

test("says rep, not reps, for a single shared rep", () => {
  // Act
  const view = toProgressStoryView(loadAtReps({ held: 1 }), "kg");

  // Assert
  assert.equal(view.headline, "+2.5 kg for 1 rep.");
  assert.equal(view.rows[0].performance, "1 rep at 60 kg");
});

test("projects a load-at-reps change into the reader’s Weight Unit", () => {
  // Arrange — 60 lb then 65 lb, stored as exact kilograms
  const sixty = 60 * 0.45359237;
  const sixtyFive = 65 * 0.45359237;

  // Act
  const view = toProgressStoryView(
    loadAtReps({
      delta: sixtyFive - sixty,
      latest: { logged_session_id: 12, performed_on: "2026-03-08", value: sixtyFive },
      previous: { logged_session_id: 7, performed_on: "2026-03-01", value: sixty },
    }),
    "lb",
  );

  // Assert
  assert.equal(view.headline, "+5 lb for 5 reps.");
  assert.equal(view.rows[1].performance, "5 reps at 65 lb");
});

test("shows each side’s own load when the rep count is held", () => {
  // Act
  const view = toProgressStoryView(loadAtReps(), "kg");

  // Assert
  assert.deepEqual(view.rows, [
    { label: "Last time", performance: "5 reps at 60 kg", date: "Mar 1, 2026", href: "/history/7" },
    { label: "Latest", performance: "5 reps at 62.5 kg", date: "Mar 8, 2026", href: "/history/12" },
  ]);
});

test("acknowledges an unchanged load at a shared rep count with its numbers", () => {
  // Act
  const view = toProgressStoryView(
    loadAtReps({
      kind: "unchanged",
      delta: 0,
      latest: { logged_session_id: 12, performed_on: "2026-03-08", value: 60 },
    }),
    "kg",
  );

  // Assert
  assert.equal(view.headline, "Same as last time: 5 reps at 60 kg.");
});

test("writes its copy with the typographic apostrophe", () => {
  // Arrange
  const source = readFileSync(resolve(import.meta.dirname, "progress-story-view.ts"), "utf8");

  // Act / Assert
  assert.deepEqual(findStraightApostrophes(source, "lib/progress-story-view.ts"), []);
});

test("never words a story in a Load kind it has no display rule for", () => {
  // Act — a %1RM story, whose held value is no bar weight
  const view = toProgressStoryView(story({ load_kind: "percent_1rm" }), "kg");

  // Assert — withheld rather than misstated as a kilogram figure
  assert.equal(
    view.headline,
    "No comparable sessions yet. Repeat a load or a rep count from last time to see what changed.",
  );
  assert.deepEqual(view.rows, []);
  assert.equal(view.footnote, null);
});

// A bodyweight story: the held or measured load is the *added* load (ADR-0026).
function bodyweight(overrides: Partial<ProgressStory> = {}): ProgressStory {
  return story({ load_kind: "bodyweight", held: 0, delta: 3, ...overrides });
}

test("words plain bodyweight as bodyweight, never as zero kilograms", () => {
  // Act
  const view = toProgressStoryView(
    bodyweight({
      latest: { logged_session_id: 12, performed_on: "2026-03-08", value: 8 },
      previous: { logged_session_id: 7, performed_on: "2026-03-01", value: 5 },
    }),
    "kg",
  );

  // Assert
  assert.equal(view.headline, "3 more reps at bodyweight than last time.");
  assert.equal(view.rows[0].performance, "5 reps at bodyweight");
  assert.equal(view.rows[1].performance, "8 reps at bodyweight");
});

test("words bodyweight with added load as bodyweight plus the added load", () => {
  // Act
  const view = toProgressStoryView(bodyweight({ held: 10, delta: 2 }), "kg");

  // Assert — never a bare kg total
  assert.equal(view.headline, "2 more reps at bodyweight + 10 kg than last time.");
  assert.equal(view.rows[1].performance, "10 reps at bodyweight + 10 kg");
});

test("acknowledges the same bodyweight performance with its numbers", () => {
  // Act
  const view = toProgressStoryView(
    bodyweight({
      kind: "unchanged",
      delta: 0,
      latest: { logged_session_id: 12, performed_on: "2026-03-08", value: 8 },
    }),
    "kg",
  );

  // Assert
  assert.equal(view.headline, "Same as last time: 8 reps at bodyweight.");
});

test("states a change in added load at a shared rep count as added weight", () => {
  // Act — 5 reps at +10 kg, then at +12.5 kg
  const view = toProgressStoryView(
    bodyweight({
      axis: "load_at_reps",
      held: 5,
      delta: 2.5,
      latest: { logged_session_id: 12, performed_on: "2026-03-08", value: 12.5 },
      previous: { logged_session_id: 7, performed_on: "2026-03-01", value: 10 },
    }),
    "kg",
  );

  // Assert — the delta names itself as added, so it never reads as a bare kg total
  assert.equal(view.headline, "+2.5 kg added for 5 reps.");
  assert.deepEqual(
    view.rows.map((row) => row.performance),
    ["5 reps at bodyweight + 10 kg", "5 reps at bodyweight + 12.5 kg"],
  );
});

test("words a shared rep count up from plain bodyweight", () => {
  // Act — 5 reps at bodyweight, then at +5 kg
  const view = toProgressStoryView(
    bodyweight({
      axis: "load_at_reps",
      held: 5,
      delta: 5,
      latest: { logged_session_id: 12, performed_on: "2026-03-08", value: 5 },
      previous: { logged_session_id: 7, performed_on: "2026-03-01", value: 0 },
    }),
    "kg",
  );

  // Assert
  assert.equal(view.headline, "+5 kg added for 5 reps.");
  assert.equal(view.rows[0].performance, "5 reps at bodyweight");
});

test("projects the added load into the reader’s Weight Unit", () => {
  // Arrange — +20 lb, stored as exact kilograms
  const twentyPounds = 20 * 0.45359237;

  // Act
  const view = toProgressStoryView(bodyweight({ held: twentyPounds, delta: 2 }), "lb");

  // Assert
  assert.equal(view.headline, "2 more reps at bodyweight + 20 lb than last time.");
});

test("footnotes a changed Performed Body Weight, previous to latest", () => {
  // Act
  const view = toProgressStoryView(
    bodyweight({ held: 10, body_weight: { previous_kg: 80, latest_kg: 78 } }),
    "kg",
  );

  // Assert
  assert.equal(view.footnote, "Body weight 80 → 78 kg.");
});

test("footnotes the body weight in the reader’s Weight Unit", () => {
  // Arrange — 176 lb then 172 lb, stored as exact kilograms
  const pounds = 0.45359237;

  // Act
  const view = toProgressStoryView(
    bodyweight({ body_weight: { previous_kg: 176 * pounds, latest_kg: 172 * pounds } }),
    "lb",
  );

  // Assert
  assert.equal(view.footnote, "Body weight 176 → 172 lb.");
});

test("has no footnote when the API sends no body weight change", () => {
  // Act
  const absolute = toProgressStoryView(story(), "kg");
  const plain = toProgressStoryView(bodyweight({ body_weight: null }), "kg");

  // Assert
  assert.equal(absolute.footnote, null);
  assert.equal(plain.footnote, null);
});
