import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_PREVIEW_EXERCISES,
  MAX_RECENT_SESSIONS,
  buildRecentSessionRow,
  previewExerciseNames,
  selectRecentSessions,
  startLiveHref,
} from "./recent-sessions.ts";
import type { LoggedSession } from "./logs-types.ts";
import type { SessionSummary } from "./session-library.ts";

// `recent-sessions` is the pure view-model behind the Train page's "Recent Sessions" panel
// (CONTEXT: Recent Sessions). It surfaces the user's up-to-five most-recently-*performed*
// standalone Session **plans**, deduped, each as a one-tap Start into a Live Session — the
// proactive, Train-side cousin of Repeat. The cardinal plan/record split drives it: recency
// comes from the record (Logged Sessions), but every row is a plan (a standalone Session), so
// plan-less records are skipped and Protocol-member performances excluded.

function record(overrides: Partial<LoggedSession>): LoggedSession {
  return {
    id: 1,
    clerk_user_id: "u1",
    session_id: null,
    training_type: "strength",
    performed_on: "2026-06-20",
    completion_outcome: null,
    duration_seconds: null,
    logged_sets: [],
    ...overrides,
  };
}

function summary(overrides: Partial<SessionSummary>): SessionSummary {
  return {
    id: 1,
    training_type: "strength",
    name: null,
    display_name: "strength · 2026-06-01",
    created_at: "2026-06-01",
    author: { display_name: null },
    is_favorite: false,
    logged_count: 1,
    ...overrides,
  };
}

test("selects distinct standalone plans newest-first, carrying each plan's newest performance date", () => {
  // Arrange — history is newest-first (the GET /api/logs contract).
  const history = [
    record({ id: 30, session_id: 3, performed_on: "2026-06-20" }),
    record({ id: 20, session_id: 2, performed_on: "2026-06-18" }),
    record({ id: 10, session_id: 1, performed_on: "2026-06-15" }),
  ];
  const standalone = [summary({ id: 1 }), summary({ id: 2 }), summary({ id: 3 })];

  // Act
  const selected = selectRecentSessions(history, standalone);

  // Assert — same order as the record feed, each paired with its performance date.
  assert.deepEqual(
    selected.map((s) => [s.session.id, s.lastPerformedOn]),
    [
      [3, "2026-06-20"],
      [2, "2026-06-18"],
      [1, "2026-06-15"],
    ],
  );
});

test("dedupes repeated performances of one plan to its newest occurrence", () => {
  // Arrange — session 5 performed three times; only the newest survives, once.
  const history = [
    record({ id: 33, session_id: 5, performed_on: "2026-07-10" }),
    record({ id: 22, session_id: 9, performed_on: "2026-07-09" }),
    record({ id: 11, session_id: 5, performed_on: "2026-07-01" }),
  ];
  const standalone = [summary({ id: 5 }), summary({ id: 9 })];

  // Act
  const selected = selectRecentSessions(history, standalone);

  // Assert — plan 5 appears once, at its newest performance, above plan 9.
  assert.deepEqual(
    selected.map((s) => [s.session.id, s.lastPerformedOn]),
    [
      [5, "2026-07-10"],
      [9, "2026-07-09"],
    ],
  );
});

test("skips plan-less records — they have no plan to Start (Capture is their path)", () => {
  const history = [
    record({ id: 40, session_id: null, performed_on: "2026-08-01" }),
    record({ id: 30, session_id: 7, performed_on: "2026-07-31" }),
  ];
  const standalone = [summary({ id: 7 })];

  const selected = selectRecentSessions(history, standalone);

  assert.deepEqual(
    selected.map((s) => s.session.id),
    [7],
  );
});

test("excludes plan-backed performances whose session is not standalone (Protocol member or beyond the page)", () => {
  const history = [
    record({ id: 50, session_id: 99, performed_on: "2026-08-05" }), // not in the standalone library
    record({ id: 40, session_id: 4, performed_on: "2026-08-04" }),
  ];
  const standalone = [summary({ id: 4 })];

  const selected = selectRecentSessions(history, standalone);

  assert.deepEqual(
    selected.map((s) => s.session.id),
    [4],
  );
});

test("returns fewer than the cap when fewer distinct standalone plans exist", () => {
  const history = [record({ id: 10, session_id: 1, performed_on: "2026-06-15" })];
  const standalone = [summary({ id: 1 })];

  assert.equal(selectRecentSessions(history, standalone).length, 1);
});

test("returns an empty selection when nothing is eligible", () => {
  const history = [record({ id: 10, session_id: null })];
  const standalone: SessionSummary[] = [];

  assert.deepEqual(selectRecentSessions(history, standalone), []);
});

test("caps the selection at MAX_RECENT_SESSIONS distinct plans", () => {
  // Arrange — seven distinct standalone plans performed, newest-first.
  const history = Array.from({ length: 7 }, (_, i) =>
    record({ id: 100 - i, session_id: i + 1, performed_on: `2026-06-${20 - i}` }),
  );
  const standalone = Array.from({ length: 7 }, (_, i) => summary({ id: i + 1 }));

  // Act
  const selected = selectRecentSessions(history, standalone);

  // Assert — capped at five, keeping the five newest.
  assert.equal(selected.length, MAX_RECENT_SESSIONS);
  assert.deepEqual(
    selected.map((s) => s.session.id),
    [1, 2, 3, 4, 5],
  );
});

test("previewExerciseNames takes the first three names in prescription order, without dedupe", () => {
  const prescriptions = [
    { exercise_name: "Back Squat" },
    { exercise_name: "Bench Press" },
    { exercise_name: "Back Squat" },
    { exercise_name: "Deadlift" },
  ];

  assert.deepEqual(previewExerciseNames(prescriptions), [
    "Back Squat",
    "Bench Press",
    "Back Squat",
  ]);
  assert.equal(MAX_PREVIEW_EXERCISES, 3);
});

test("previewExerciseNames returns fewer when the plan has fewer, and empty when none", () => {
  assert.deepEqual(previewExerciseNames([{ exercise_name: "Plank" }]), ["Plank"]);
  assert.deepEqual(previewExerciseNames([]), []);
});

test("startLiveHref deep-links into the plan's Live Session", () => {
  assert.equal(startLiveHref(42), "/sessions/42/live");
});

test("buildRecentSessionRow assembles plan identity, performance recency, and the plan's exercise preview", () => {
  // Arrange
  const selection = {
    session: summary({ id: 8, display_name: "Push Day", training_type: "strength" }),
    lastPerformedOn: "2026-09-01",
  };
  const prescriptions = [
    { exercise_name: "Overhead Press" },
    { exercise_name: "Incline Bench" },
    { exercise_name: "Lateral Raise" },
    { exercise_name: "Triceps Pushdown" },
  ];

  // Act
  const row = buildRecentSessionRow(selection, prescriptions);

  // Assert — names from the library row, preview capped at three from the plan, Start into live.
  assert.deepEqual(row, {
    id: 8,
    displayName: "Push Day",
    trainingType: "strength",
    lastPerformedOn: "2026-09-01",
    previewExercises: ["Overhead Press", "Incline Bench", "Lateral Raise"],
    startHref: "/sessions/8/live",
  });
});
