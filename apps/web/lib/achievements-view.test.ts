import { test } from "node:test";
import assert from "node:assert/strict";

import { toAchievementCards } from "./achievements-view.ts";
import type { Achievement } from "./profile-progress-types.ts";

// `toAchievementCards` turns the API's evaluated Achievements into display cards for the
// Profile wall: an unlocked badge shows the short date it was earned and a full meter; a
// locked badge shows live "current/target" progress and a fractional fill. Pure and
// server-free, so it is safe from either a Server or Client Component.

const LOCKED: Achievement = {
  id: "sessions-25",
  name: "25 Sessions",
  criteria: "Log 25 Sessions",
  unlocked: false,
  current: 18,
  target: 25,
  unlocked_on: null,
};

const UNLOCKED: Achievement = {
  id: "sessions-5",
  name: "5 Sessions",
  criteria: "Log 5 Sessions",
  unlocked: true,
  current: 5,
  target: 5,
  unlocked_on: "2026-07-04",
};

test("shows a locked badge's live progress and fractional fill", () => {
  // Arrange / Act
  const [card] = toAchievementCards([LOCKED]);

  // Assert — the honest "18/25" a locked badge renders, filled 18/25 of the way
  assert.equal(card.name, "25 Sessions");
  assert.equal(card.criteria, "Log 25 Sessions");
  assert.equal(card.unlocked, false);
  assert.equal(card.progress, "18/25");
  assert.equal(card.fill, 18 / 25);
});

test("shows an unlocked badge's earned date and a full meter", () => {
  // Arrange / Act
  const [card] = toAchievementCards([UNLOCKED]);

  // Assert — the earned date instead of a ratio, and a full bar
  assert.equal(card.unlocked, true);
  assert.equal(card.progress, "Jul 4");
  assert.equal(card.fill, 1);
});

test("clamps fill to a full meter when progress overshoots the target", () => {
  // Arrange — an unlocked count badge whose current has run past its target
  const overshot: Achievement = { ...UNLOCKED, current: 30, target: 5 };

  // Act
  const [card] = toAchievementCards([overshot]);

  // Assert — the meter never overfills
  assert.equal(card.fill, 1);
});

test("guards against a zero target instead of dividing by zero", () => {
  // Arrange — a defensive case: a target of 0 must not yield NaN
  const zeroTarget: Achievement = { ...LOCKED, current: 0, target: 0 };

  // Act
  const [card] = toAchievementCards([zeroTarget]);

  // Assert
  assert.equal(card.fill, 0);
});

test("preserves the catalog order the API returns", () => {
  // Arrange — the API hands the catalog in a fixed, curated order
  const cards = toAchievementCards([UNLOCKED, LOCKED]);

  // Assert — order is carried through untouched
  assert.deepEqual(
    cards.map((card) => card.id),
    ["sessions-5", "sessions-25"],
  );
});
