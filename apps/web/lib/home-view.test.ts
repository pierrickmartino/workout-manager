import { test } from "node:test";
import assert from "node:assert/strict";

import { weekStrip } from "./home-view.ts";
import type { ProtocolProgress, ProtocolSession } from "./protocols-types.ts";

// Build a Protocol whose Sessions are laid out `sessionsPerWeek` to a week over
// `weeks` weeks, numbered by 1-based `position`. `nextPosition` picks the Next
// Session (the earliest un-performed one); everything before it counts as
// completed. Keeps the fixtures table-friendly: a case is (weeks, perWeek,
// nextPosition).
function makeProtocol({
  weeks,
  sessionsPerWeek,
  nextPosition,
}: {
  weeks: number;
  sessionsPerWeek: number;
  nextPosition: number | null;
}): ProtocolProgress {
  const sessions: ProtocolSession[] = [];
  for (let week = 1; week <= weeks; week += 1) {
    for (let day = 1; day <= sessionsPerWeek; day += 1) {
      const position = (week - 1) * sessionsPerWeek + day;
      sessions.push({
        session_id: 100 + position,
        position,
        week,
        day,
        title: `Session ${position}`,
        prescriptions: [],
      });
    }
  }
  const next =
    nextPosition === null
      ? null
      : (sessions.find((s) => s.position === nextPosition) ?? null);
  return {
    id: 1,
    clerk_user_id: "user_1",
    training_type: "strength",
    objective: "hypertrophy",
    sessions_per_week: sessionsPerWeek,
    weeks,
    duration_minutes: 45,
    sessions,
    next_session: next,
    completed_count: nextPosition === null ? sessions.length : nextPosition - 1,
  };
}

test("returns one dot per Session in the current week", () => {
  // Arrange: a 2-week / 3-per-week Protocol, Next Session is the first of week 2.
  const protocol = makeProtocol({
    weeks: 2,
    sessionsPerWeek: 3,
    nextPosition: 4,
  });

  // Act
  const strip = weekStrip(protocol);

  // Assert: only week 2's three Sessions become dots.
  assert.ok(strip);
  assert.equal(strip.dots.length, 3);
  assert.deepEqual(
    strip.dots.map((d) => d.position),
    [4, 5, 6],
  );
});

test("tags a mid-week Next Session's dots as done / active / upcoming by position", () => {
  // Arrange: Next Session is the middle Session of week 2 (positions 4, 5, 6).
  const protocol = makeProtocol({
    weeks: 2,
    sessionsPerWeek: 3,
    nextPosition: 5,
  });

  // Act
  const strip = weekStrip(protocol);

  // Assert: earlier position is done, the Next Session is active, later is upcoming.
  assert.ok(strip);
  assert.deepEqual(
    strip.dots.map((d) => d.state),
    ["done", "active", "upcoming"],
  );
});

test("tags no dots as done in the first week when the very first Session is next", () => {
  // Arrange: a fresh Protocol — the Next Session is week 1's first Session.
  const protocol = makeProtocol({
    weeks: 3,
    sessionsPerWeek: 3,
    nextPosition: 1,
  });

  // Act
  const strip = weekStrip(protocol);

  // Assert: the first Session is active and the rest of week 1 is upcoming.
  assert.ok(strip);
  assert.deepEqual(
    strip.dots.map((d) => d.state),
    ["active", "upcoming", "upcoming"],
  );
});

test("derives the WEEK n/total label from the Next Session's week and the Protocol's weeks", () => {
  // Arrange: Next Session is in week 2 of a 6-week Protocol.
  const protocol = makeProtocol({
    weeks: 6,
    sessionsPerWeek: 3,
    nextPosition: 4,
  });

  // Act
  const strip = weekStrip(protocol);

  // Assert
  assert.ok(strip);
  assert.equal(strip.week, 2);
  assert.equal(strip.totalWeeks, 6);
  assert.equal(strip.label, "WEEK 2/6");
});

test("returns null when the Protocol has no Next Session", () => {
  // Arrange: a fully-performed Protocol carries no Next Session.
  const protocol = makeProtocol({
    weeks: 2,
    sessionsPerWeek: 3,
    nextPosition: null,
  });

  // Act & Assert
  assert.equal(weekStrip(protocol), null);
});
