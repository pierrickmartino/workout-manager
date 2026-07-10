import { test } from "node:test";
import assert from "node:assert/strict";

import { queueView, weekStrip, QUEUE_CAP } from "./home-view.ts";
import type { WeekStrip } from "./home-view.ts";
import type { ProtocolProgress, ProtocolSession } from "./protocols-types.ts";
import type { ExercisePrescription } from "./sessions-types.ts";

// A minimal Exercise Prescription — only the fields the view-model reads matter;
// the rest are filled with harmless placeholders so the fixture type-checks.
function makePrescription(position: number): ExercisePrescription {
  return {
    position,
    sets: 3,
    reps: "10",
    rest_seconds: null,
    tempo: null,
    recommended_load: null,
    exercise_id: position,
    exercise_name: `Exercise ${position}`,
    exercise_description: null,
    targeted_muscles: [],
    required_equipment: [],
    provenance: "curated",
  };
}

// Build a Protocol whose Sessions are laid out `sessionsPerWeek` to a week over
// `weeks` weeks, numbered by 1-based `position`. `nextPosition` picks the Next
// Session (the earliest un-performed one); everything before it counts as
// completed. `modulesPerSession` fills each Session with that many Prescriptions
// (default 0). Keeps the fixtures table-friendly: a case is (weeks, perWeek,
// nextPosition).
function makeProtocol({
  weeks,
  sessionsPerWeek,
  nextPosition,
  modulesPerSession = 0,
}: {
  weeks: number;
  sessionsPerWeek: number;
  nextPosition: number | null;
  modulesPerSession?: number;
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
        performed: false,
        prescriptions: Array.from({ length: modulesPerSession }, (_, i) =>
          makePrescription(i + 1),
        ),
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
    name: null,
    label: "hypertrophy · strength",
    sessions,
    next_session: next,
    completed_count: nextPosition === null ? sessions.length : nextPosition - 1,
  };
}

// Collapse a strip into a compact, table-friendly view: each week as its number,
// current-week flag, and the ordered states of its cells. Lets the whole-Protocol
// map be asserted at a glance without reaching into cell objects.
function weekShape(strip: WeekStrip) {
  return strip.weeks.map((week) => ({
    week: week.week,
    isCurrent: week.isCurrent,
    states: week.cells.map((cell) => cell.state),
  }));
}

test("emits one pill per Protocol week, in ascending week order", () => {
  // Arrange: a 4-week / 3-per-week Protocol — the map spans every week, not just
  // the current one, so the pill count matches the WEEK n/total overline.
  const protocol = makeProtocol({
    weeks: 4,
    sessionsPerWeek: 3,
    nextPosition: 5,
  });

  // Act
  const strip = weekStrip(protocol);

  // Assert: four pills — one per week — in order, each carrying its week's cells.
  assert.ok(strip);
  assert.equal(strip.weeks.length, 4);
  assert.equal(strip.weeks.length, strip.totalWeeks);
  assert.deepEqual(
    strip.weeks.map((w) => w.week),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    strip.weeks.map((w) => w.cells.map((c) => c.position)),
    [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
    ],
  );
});

test("tags every cell upcoming (bar the active one) when the Next Session is the first", () => {
  // Arrange: a fresh Protocol — the Next Session is week 1's first Session.
  const protocol = makeProtocol({
    weeks: 3,
    sessionsPerWeek: 3,
    nextPosition: 1,
  });

  // Act
  const strip = weekStrip(protocol);

  // Assert: nothing is done; week 1 opens with the active cell, all else upcoming.
  assert.ok(strip);
  assert.deepEqual(weekShape(strip), [
    { week: 1, isCurrent: true, states: ["active", "upcoming", "upcoming"] },
    { week: 2, isCurrent: false, states: ["upcoming", "upcoming", "upcoming"] },
    { week: 3, isCurrent: false, states: ["upcoming", "upcoming", "upcoming"] },
  ]);
});

test("tags cells done / active / upcoming around a mid-Protocol Next Session", () => {
  // Arrange: Next Session is the middle Session of week 2 (positions 4, 5, 6).
  const protocol = makeProtocol({
    weeks: 3,
    sessionsPerWeek: 3,
    nextPosition: 5,
  });

  // Act
  const strip = weekStrip(protocol);

  // Assert: week 1 is fully done, week 2 straddles the Next Session, week 3 is all
  // upcoming — and only week 2 is flagged current.
  assert.ok(strip);
  assert.deepEqual(weekShape(strip), [
    { week: 1, isCurrent: false, states: ["done", "done", "done"] },
    { week: 2, isCurrent: true, states: ["done", "active", "upcoming"] },
    { week: 3, isCurrent: false, states: ["upcoming", "upcoming", "upcoming"] },
  ]);
});

test("tags every earlier cell done when the Next Session is the very last", () => {
  // Arrange: only the final Session of a 2-week / 3-per-week Protocol is upcoming.
  const protocol = makeProtocol({
    weeks: 2,
    sessionsPerWeek: 3,
    nextPosition: 6,
  });

  // Act
  const strip = weekStrip(protocol);

  // Assert: week 1 is done and week 2 ends on the active last cell.
  assert.ok(strip);
  assert.deepEqual(weekShape(strip), [
    { week: 1, isCurrent: false, states: ["done", "done", "done"] },
    { week: 2, isCurrent: true, states: ["done", "done", "active"] },
  ]);
});

test("flags exactly the week holding the Next Session as current", () => {
  // Arrange: Next Session is in week 3 of a 5-week Protocol.
  const protocol = makeProtocol({
    weeks: 5,
    sessionsPerWeek: 2,
    nextPosition: 5,
  });

  // Act
  const strip = weekStrip(protocol);

  // Assert: current-week flag is true on week 3 alone.
  assert.ok(strip);
  assert.equal(strip.currentWeek, 3);
  assert.deepEqual(
    strip.weeks.map((w) => w.isCurrent),
    [false, false, true, false, false],
  );
});

test("renders one cell per pill for a single-Session-per-week Protocol", () => {
  // Arrange: each week holds exactly one Session; the Next Session is week 2's.
  const protocol = makeProtocol({
    weeks: 4,
    sessionsPerWeek: 1,
    nextPosition: 2,
  });

  // Act
  const strip = weekStrip(protocol);

  // Assert: four single-cell pills, tagged done / active / upcoming across weeks.
  assert.ok(strip);
  assert.deepEqual(weekShape(strip), [
    { week: 1, isCurrent: false, states: ["done"] },
    { week: 2, isCurrent: true, states: ["active"] },
    { week: 3, isCurrent: false, states: ["upcoming"] },
    { week: 4, isCurrent: false, states: ["upcoming"] },
  ]);
});

test("renders a single pill for a one-week Protocol", () => {
  // Arrange: a one-week Protocol — the whole map is a single pill.
  const protocol = makeProtocol({
    weeks: 1,
    sessionsPerWeek: 3,
    nextPosition: 2,
  });

  // Act
  const strip = weekStrip(protocol);

  // Assert: one pill, WEEK 1/1, its cells straddling the Next Session.
  assert.ok(strip);
  assert.equal(strip.weeks.length, 1);
  assert.equal(strip.label, "WEEK 1/1");
  assert.deepEqual(weekShape(strip), [
    { week: 1, isCurrent: true, states: ["done", "active", "upcoming"] },
  ]);
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
  assert.equal(strip.currentWeek, 2);
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

test("queue lists the upcoming un-performed Sessions in position order, first flagged NEXT", () => {
  // Arrange: a 2-week / 3-per-week Protocol whose Next Session is position 4, so
  // positions 4, 5, 6 remain upcoming (1–3 are performed).
  const protocol = makeProtocol({
    weeks: 2,
    sessionsPerWeek: 3,
    nextPosition: 4,
  });

  // Act
  const queue = queueView(protocol);

  // Assert: rows are exactly the upcoming Sessions in ascending position, and the
  // Next Session (position 4) is the only one flagged NEXT.
  assert.ok(queue);
  assert.deepEqual(
    queue.rows.map((row) => row.position),
    [4, 5, 6],
  );
  assert.deepEqual(
    queue.rows.map((row) => row.isNext),
    [true, false, false],
  );
});

test("caps the queue at QUEUE_CAP rows and flags the overflow via hasMore", () => {
  // Arrange: a fresh 4-week / 3-per-week Protocol (12 upcoming Sessions) — well
  // over the cap.
  const protocol = makeProtocol({
    weeks: 4,
    sessionsPerWeek: 3,
    nextPosition: 1,
  });

  // Act
  const queue = queueView(protocol);

  // Assert: the list is trimmed to the cap and hasMore signals the "view all".
  assert.ok(queue);
  assert.equal(queue.rows.length, QUEUE_CAP);
  assert.equal(queue.totalUpcoming, 12);
  assert.equal(queue.hasMore, true);
});

test("does not flag hasMore when the upcoming Sessions fit within the cap", () => {
  // Arrange: only two Sessions remain upcoming (positions 5 and 6 of six).
  const protocol = makeProtocol({
    weeks: 2,
    sessionsPerWeek: 3,
    nextPosition: 5,
  });

  // Act
  const queue = queueView(protocol);

  // Assert
  assert.ok(queue);
  assert.equal(queue.rows.length, 2);
  assert.equal(queue.hasMore, false);
});

test("builds the completion header as completed_count / total", () => {
  // Arrange: 3 of a 2-week / 3-per-week (6-Session) Protocol are performed.
  const protocol = makeProtocol({
    weeks: 2,
    sessionsPerWeek: 3,
    nextPosition: 4,
  });

  // Act
  const queue = queueView(protocol);

  // Assert: the honest protocol-level aggregate, shown once as a header.
  assert.ok(queue);
  assert.equal(queue.completedCount, 3);
  assert.equal(queue.total, 6);
  assert.equal(queue.header, "3 / 6");
});

test("carries module count, per-session duration, and Week/Day label on each row", () => {
  // Arrange: each Session has 4 Prescriptions; the Next Session is week 2, day 1.
  const protocol = makeProtocol({
    weeks: 2,
    sessionsPerWeek: 3,
    nextPosition: 4,
    modulesPerSession: 4,
  });

  // Act
  const queue = queueView(protocol);

  // Assert
  assert.ok(queue);
  const [first] = queue.rows;
  assert.equal(first.modules, 4);
  assert.equal(first.durationMinutes, 45);
  assert.equal(first.label, "W2 · D1");
});

test("rows carry no per-session percentage of any kind", () => {
  // Arrange
  const protocol = makeProtocol({
    weeks: 2,
    sessionsPerWeek: 3,
    nextPosition: 4,
    modulesPerSession: 2,
  });

  // Act
  const queue = queueView(protocol);

  // Assert: the row shape is exactly the honest fields — no percent/ratio/ring
  // key sneaks a per-session completion figure onto the row (ADR-0008).
  assert.ok(queue);
  assert.deepEqual(
    Object.keys(queue.rows[0]).sort(),
    ["durationMinutes", "isNext", "label", "modules", "position", "sessionId"],
  );
});

test("returns no queue when the Protocol has no Next Session", () => {
  // Arrange: a fully-performed Protocol has nothing upcoming to queue.
  const protocol = makeProtocol({
    weeks: 2,
    sessionsPerWeek: 3,
    nextPosition: null,
  });

  // Act & Assert
  assert.equal(queueView(protocol), null);
});
