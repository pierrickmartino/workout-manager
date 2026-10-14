// Shared fixtures for the AI Hand-off tests (ADR-0132): a Logged Set and a Logged Session with
// plain defaults, overridden per test.

import type { LoggedSession, LoggedSet } from "./logs-types.ts";

export function set(overrides: Partial<LoggedSet>): LoggedSet {
  return {
    position: 1,
    quantity: { kind: "repetitions", text: "8", count: 8 },
    load: { kind: "absolute", text: "100 kg", kg: 100 },
    perceived_difficulty: null,
    exercise_id: 1,
    exercise_name: "Bench Press",
    body_weight_kg: null,
    ...overrides,
  };
}

export function record(overrides: Partial<LoggedSession>): LoggedSession {
  return {
    id: 7,
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
