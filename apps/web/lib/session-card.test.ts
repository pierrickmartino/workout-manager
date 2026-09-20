import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canDeleteSessionRow,
  favoriteActionLabel,
  recentSessionCardModel,
  sessionSummaryCardModel,
} from "./session-card.ts";
import type { RecentSessionRow } from "./recent-sessions.ts";
import type { SessionSummary } from "./session-library.ts";

// `session-card` normalizes a Train "Recent Sessions" row and a My Sessions library row into the
// one `SessionCardModel` the shared card renders, so both surfaces reuse a single card format
// (CONTEXT: Recent Sessions, My Sessions). Pure and server-free, so the mapping and the menu-gating
// rules are unit-tested here.

function makeRecentRow(overrides: Partial<RecentSessionRow> = {}): RecentSessionRow {
  return {
    id: 7,
    displayName: "Upper Push",
    trainingType: "strength",
    lastPerformedOn: "2026-09-14",
    previewExercises: ["Bench Press", "Overhead Press", "Dip"],
    exerciseCount: 5,
    startHref: "/sessions/7/live",
    ...overrides,
  };
}

function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 12,
    training_type: "cardio",
    name: "Zone 2 Ride",
    display_name: "Zone 2 Ride",
    created_at: "2026-09-01",
    author: { display_name: "Dana" },
    is_favorite: false,
    exercise_count: 3,
    logged_count: 4,
    ...overrides,
  };
}

test("maps a Train recent-session row into the card model with its fixed cyan badge", () => {
  const model = recentSessionCardModel(makeRecentRow());

  assert.equal(model.id, 7);
  assert.equal(model.displayName, "Upper Push");
  assert.equal(model.badgeVariant, "cyan");
  assert.equal(model.startHref, "/sessions/7/live");
  assert.equal(model.startLabel, "Start Upper Push");
  assert.equal(model.lastPerformedOn, "2026-09-14");
  assert.deepEqual(model.previewExercises, ["Bench Press", "Overhead Press", "Dip"]);
});

test("a Train card carries no author, Logged Count or detail link (no fact row / not a link)", () => {
  const model = recentSessionCardModel(makeRecentRow());

  assert.equal(model.detailHref, null);
  assert.equal(model.authorName, null);
  assert.equal(model.loggedCount, null);
});

test("maps a My Sessions row into the card model with a per-type badge and a detail link", () => {
  const model = sessionSummaryCardModel(makeSummary());

  assert.equal(model.id, 12);
  assert.equal(model.displayName, "Zone 2 Ride");
  // cardio maps to magenta in the shared training-type badge map.
  assert.equal(model.badgeVariant, "magenta");
  assert.equal(model.detailHref, "/sessions/12");
  assert.equal(model.startHref, "/sessions/12/live");
  assert.equal(model.startLabel, "Start Zone 2 Ride");
  assert.equal(model.authorName, "Dana");
  assert.equal(model.loggedCount, 4);
});

test("a My Sessions card carries no performed date or exercise preview (not on the list payload)", () => {
  const model = sessionSummaryCardModel(makeSummary());

  assert.equal(model.lastPerformedOn, null);
  assert.deepEqual(model.previewExercises, []);
});

test("an unnamed My Sessions row titles by its formatted creation date", () => {
  const model = sessionSummaryCardModel(
    makeSummary({ name: null, created_at: "2026-09-05" }),
  );

  assert.equal(model.displayName, "Sep 5, 2026");
  assert.equal(model.startLabel, "Start Sep 5, 2026");
});

test("a blank or missing Author credit falls back to the generic label, never blank", () => {
  assert.equal(
    sessionSummaryCardModel(makeSummary({ author: { display_name: "   " } })).authorName,
    "Anonymous",
  );
  assert.equal(
    sessionSummaryCardModel(makeSummary({ author: { display_name: null } })).authorName,
    "Anonymous",
  );
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
