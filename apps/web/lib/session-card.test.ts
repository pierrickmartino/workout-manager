import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canDeleteSessionRow,
  exerciseCountLabel,
  favoriteActionDescription,
  favoriteActionLabel,
  lastTrainedLabel,
  sessionCardModel,
} from "./session-card.ts";
import type { SessionSummary } from "./session-library.ts";

// `session-card` maps one My Sessions list row into the `SessionCardModel` the shared card renders.
// Train's "Pick up again" panel and the My Sessions library feed the same row shape, so both
// surfaces render one card (GLOSSARY: Recent Sessions, My Sessions, ADR-0134). Pure and
// server-free, so the mapping and the menu-gating rules are unit-tested here.

function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 12,
    training_type: "cardio",
    name: "Zone 2 Ride",
    display_name: "Zone 2 Ride",
    created_at: "2026-09-01",
    author: { display_name: "Dana" },
    authored_by_me: false,
    is_favorite: false,
    exercise_count: 3,
    logged_count: 4,
    last_performed_on: "2026-10-12",
    preview_exercises: ["Bike", "Row"],
    ...overrides,
  };
}

test("maps a list row into the card model with a per-type badge and its links", () => {
  const model = sessionCardModel(makeSummary());

  assert.equal(model.id, 12);
  assert.equal(model.displayName, "Zone 2 Ride");
  // cardio maps to magenta in the shared training-type badge map.
  assert.equal(model.badgeVariant, "magenta");
  assert.equal(model.detailHref, "/sessions/12");
  assert.equal(model.startHref, "/sessions/12/live");
  assert.equal(model.startLabel, "Start Zone 2 Ride");
  assert.equal(model.exerciseCount, 3);
  assert.equal(model.loggedCount, 4);
});

test("carries the last-trained label and the plan's exercise preview", () => {
  const model = sessionCardModel(makeSummary());

  assert.equal(model.lastTrainedLabel, "Last trained Oct 12, 2026");
  assert.deepEqual(model.previewExercises, ["Bike", "Row"]);
});

test("a never-performed plan reads as not trained yet", () => {
  assert.equal(lastTrainedLabel(null), "Not trained yet");
  assert.equal(
    sessionCardModel(makeSummary({ last_performed_on: null, logged_count: 0 })).lastTrainedLabel,
    "Not trained yet",
  );
});

test("the exercise count is singular for one and plural otherwise", () => {
  assert.equal(exerciseCountLabel(1), "1 exercise");
  assert.equal(exerciseCountLabel(0), "0 exercises");
  assert.equal(exerciseCountLabel(6), "6 exercises");
});

test("an unnamed row titles by its formatted creation date", () => {
  const model = sessionCardModel(makeSummary({ name: null, created_at: "2026-09-05" }));

  assert.equal(model.displayName, "Sep 5, 2026");
  assert.equal(model.startLabel, "Start Sep 5, 2026");
});

test("a blank or missing Author credit falls back to the generic label, never blank", () => {
  // An adopted row (not self-authored) whose original Author has no name still shows a byline.
  assert.equal(
    sessionCardModel(makeSummary({ author: { display_name: "   " } })).authorName,
    "Anonymous",
  );
  assert.equal(
    sessionCardModel(makeSummary({ author: { display_name: null } })).authorName,
    "Anonymous",
  );
});

test("a self-authored row carries no author byline (pure repetition of the viewer)", () => {
  const model = sessionCardModel(
    makeSummary({ authored_by_me: true, author: { display_name: "Pierrick" } }),
  );

  assert.equal(model.authorName, null);
});

test("an adopted row keeps its Author byline (provenance from another user)", () => {
  const model = sessionCardModel(
    makeSummary({ authored_by_me: false, author: { display_name: "Alex Rivera" } }),
  );

  assert.equal(model.authorName, "Alex Rivera");
});

test("row Delete is offered only for a never-performed plan (Logged Count 0)", () => {
  assert.equal(canDeleteSessionRow(0), true);
  assert.equal(canDeleteSessionRow(1), false);
  assert.equal(canDeleteSessionRow(9), false);
});

test("the Favorite action label reflects the current marker", () => {
  assert.equal(favoriteActionLabel(false), "Favorite session");
  assert.equal(favoriteActionLabel(true), "Unfavorite session");
});

test("the Favorite action description says where the marker shows, for each state", () => {
  assert.equal(favoriteActionDescription(false), "Show it under Favorites in My Sessions");
  assert.equal(favoriteActionDescription(true), "Take it out of Favorites in My Sessions");
});
