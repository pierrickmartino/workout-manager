import { test } from "node:test";
import assert from "node:assert/strict";

import { quickActions } from "./quick-actions.ts";
import type { HomeData } from "./home-types.ts";
import type { ProtocolProgress, ProtocolSession } from "./protocols-types.ts";

// `quick-actions` is the pure view-model behind Home's persistent quick-action row
// (docs/redesign-ia.md, ADR-0071). It turns the aggregated Home read into the ordered
// launch shortcuts for the recurring core intents — Start next (I1), Build (I4), Log (I5),
// My sessions (I6) — resolving each href, and dropping "Start next" when there is no Next
// Session to start (the empty state). It performs NO I/O and holds NO copy beyond the
// stable action keys, so the component stays thin and this stays unit-testable.

function homeData(overrides: Partial<HomeData> = {}): HomeData {
  return {
    readiness: "READY",
    current_protocol: null,
    gamification: {
      xp: 0,
      level: { level: 1, xp_into_level: 0, xp_span_of_level: 100, xp_to_next: 100 },
      streak: 0,
    },
    latest_pr: null,
    ...overrides,
  };
}

function nextSession(sessionId: number): ProtocolSession {
  return {
    session_id: sessionId,
    week: 1,
    day: 1,
    position: 1,
    title: "Push A",
    performed: false,
    prescriptions: [],
  } as ProtocolSession;
}

function protocol(next: ProtocolSession | null): ProtocolProgress {
  return {
    next_session: next,
    sessions: next ? [next] : [],
    weeks: 1,
    completed_count: 0,
    duration_minutes: 45,
    training_type: "strength",
    objective: "hypertrophy",
  } as ProtocolProgress;
}

test("includes Start next linking to the Next Session's live route when a Current Protocol has one", () => {
  const actions = quickActions(homeData({ current_protocol: protocol(nextSession(42)) }));

  const start = actions.find((action) => action.key === "start");
  assert.ok(start, "Start next should be present when a Next Session exists");
  assert.equal(start?.href, "/sessions/42/live");
  assert.equal(actions[0]?.key, "start", "Start next leads the row");
});

test("omits Start next in the empty state (no Current Protocol)", () => {
  const actions = quickActions(homeData({ current_protocol: null }));

  assert.equal(
    actions.find((action) => action.key === "start"),
    undefined,
    "nothing to start without a Current Protocol",
  );
});

test("omits Start next when the Current Protocol has no Next Session", () => {
  const actions = quickActions(homeData({ current_protocol: protocol(null) }));

  assert.equal(actions.find((action) => action.key === "start"), undefined);
});

test("always offers the hand-made core intents with their stable hrefs", () => {
  const actions = quickActions(homeData());
  const byKey = new Map(actions.map((action) => [action.key, action.href]));

  assert.equal(byKey.get("build"), "/sessions/build");
  assert.equal(byKey.get("log"), "/sessions/log");
  assert.equal(byKey.get("sessions"), "/sessions");
});
