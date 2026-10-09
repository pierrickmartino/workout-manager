import { test } from "node:test";
import assert from "node:assert/strict";

import { toPassport } from "./passport-view.ts";
import type { Achievement } from "./profile-progress-types.ts";

// `toPassport` turns the API's evaluated Achievements (curated catalog order) into the
// Training Passport: the earned Stamps oldest first, one next milestone, and the rest of the
// locked Achievements behind "More to earn". Ordering and the milestone choice are
// presentation, so they live here and the API keeps catalog order.

function earned(id: string, on: string): Achievement {
  return {
    id,
    name: `Name of ${id}`,
    criteria: `Criteria of ${id}`,
    unlocked: true,
    current: 1,
    target: 1,
    unlocked_on: on,
  };
}

function locked(id: string, current: number, target: number): Achievement {
  return {
    id,
    name: `Name of ${id}`,
    criteria: `Criteria of ${id}`,
    unlocked: false,
    current,
    target,
    unlocked_on: null,
  };
}

test("orders earned Stamps oldest first, breaking a same-day tie by catalog order", () => {
  // Arrange — catalog order is a, b, c, d; b and d were earned on the same day
  const achievements = [
    earned("a", "2026-03-10"),
    earned("b", "2025-11-02"),
    earned("c", "2024-12-31"),
    earned("d", "2025-11-02"),
  ];

  // Act
  const passport = toPassport(achievements);

  // Assert
  assert.deepEqual(
    passport.stamps.map((stamp) => stamp.id),
    ["c", "b", "d", "a"],
  );
});

test("labels each Stamp with its earned date including the year", () => {
  // Arrange — two Stamps earned in different years on the same month and day
  const achievements = [earned("a", "2025-07-04"), earned("b", "2026-07-04")];

  // Act
  const passport = toPassport(achievements);

  // Assert — the year keeps a multi-year collection unambiguous
  assert.deepEqual(
    passport.stamps.map((stamp) => stamp.earnedOn),
    ["Jul 4, 2025", "Jul 4, 2026"],
  );
});

test("picks the locked Achievement proportionally closest to earned as the next milestone", () => {
  // Arrange — 18/25 (0.72) beats 3/5 (0.6) and 2/12 even though it needs more Sessions
  const achievements = [
    earned("sessions-5", "2026-01-02"),
    locked("streak-12", 2, 12),
    locked("sessions-25", 18, 25),
    locked("muscle-all", 3, 5),
  ];

  // Act
  const passport = toPassport(achievements);

  // Assert
  assert.equal(passport.next?.id, "sessions-25");
});

test("breaks a next-milestone ratio tie by catalog order", () => {
  // Arrange — 2/4 and 3/6 are both half-way; "b" comes first in the catalog
  const achievements = [locked("a", 1, 4), locked("b", 2, 4), locked("c", 3, 6)];

  // Act
  const passport = toPassport(achievements);

  // Assert
  assert.equal(passport.next?.id, "b");
});

test("shows no next milestone once every Achievement is earned", () => {
  // Arrange
  const achievements = [earned("a", "2026-01-02"), earned("b", "2026-02-03")];

  // Act
  const passport = toPassport(achievements);

  // Assert
  assert.equal(passport.next, null);
});

test("puts every other locked Achievement under More to earn, in catalog order", () => {
  // Arrange — four locked; "c" is closest, so it is the next milestone and not repeated
  const achievements = [
    locked("a", 0, 5),
    earned("b", "2026-01-02"),
    locked("c", 4, 5),
    locked("d", 1, 12),
    locked("e", 0, 1),
  ];

  // Act
  const passport = toPassport(achievements);

  // Assert
  assert.deepEqual(
    passport.moreToEarn.map((milestone) => milestone.id),
    ["a", "d", "e"],
  );
  assert.equal(passport.moreToEarnCount, 3);
});

test("states each locked Achievement's criteria and its current/target progress", () => {
  // Arrange
  const achievements = [locked("sessions-25", 18, 25), locked("sessions-100", 18, 100)];

  // Act
  const passport = toPassport(achievements);

  // Assert — the closer one leads; the other sits under More to earn with its criteria
  assert.equal(passport.next?.progress, "18/25");
  assert.equal(passport.next?.fill, 18 / 25);
  const [more] = passport.moreToEarn;
  assert.equal(more.criteria, "Criteria of sessions-100");
  assert.equal(more.progress, "18/100");
});

test("reads as empty when nothing is earned yet, and not otherwise", () => {
  // Arrange
  const fresh = [locked("a", 0, 5), locked("b", 0, 4)];
  const started = [earned("a", "2026-01-02"), locked("b", 0, 4)];

  // Act / Assert
  assert.equal(toPassport(fresh).empty, true);
  assert.equal(toPassport(started).empty, false);
});

test("words streak progress as the best run of consecutive weeks", () => {
  // Arrange — the streak metric is the longest run of consecutive weeks (ADR-0019), so the
  // copy must never read as a current streak that rest could break
  const achievements = [locked("streak-4", 2, 4), locked("streak-12", 2, 12)];

  // Act
  const passport = toPassport(achievements);

  // Assert
  assert.equal(passport.next?.progress, "Best run 2/4 consecutive weeks");
  assert.equal(passport.moreToEarn[0].progress, "Best run 2/12 consecutive weeks");
});

test("guards against a zero target instead of dividing by zero", () => {
  // Arrange — a defensive case: a target of 0 must not yield NaN or win the milestone
  const achievements = [locked("a", 0, 0), locked("b", 1, 5)];

  // Act
  const passport = toPassport(achievements);

  // Assert
  assert.equal(passport.next?.id, "b");
  assert.equal(passport.moreToEarn[0].fill, 0);
});
